/**
 * AI Agent Chat API - Conversar com agente via API
 *
 * Inspirado no GPTMaker, permite conversar com o agente de duas formas:
 * 1. Session mode: Usa sessionId para manter histórico no servidor
 * 2. Stateless mode: Cliente envia array de mensagens (para testes/benchmark)
 *
 * POST /api/ai-agents/{id}/chat
 *
 * Body (Session mode):
 * {
 *   "sessionId": "unique-session-id",
 *   "message": "mensagem do usuário",
 *   "userName": "Nome do usuário (opcional)"
 * }
 *
 * Body (Stateless mode - para testes):
 * {
 *   "messages": [
 *     { "role": "user", "content": "oi" },
 *     { "role": "assistant", "content": "Olá!" },
 *     { "role": "user", "content": "quero falar com humano" }
 *   ]
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'
import { DEFAULT_MODEL_ID, normalizeToGatewayModelId } from '@/lib/ai/model'
import {
  findRelevantContent,
  buildEmbeddingConfigFromAgent,
  buildRerankConfigFromAgent,
  hasIndexedContent,
} from '@/lib/ai/rag-store'
import type { AIAgent, EmbeddingProvider } from '@/types'

// =============================================================================
// Types & Schemas
// =============================================================================

// Mapeamento de provider para chave de API
const EMBEDDING_API_KEY_MAP: Record<EmbeddingProvider, { settingKey: string; envVar: string }> = {
  google: { settingKey: 'gemini_api_key', envVar: 'GEMINI_API_KEY' },
  openai: { settingKey: 'openai_api_key', envVar: 'OPENAI_API_KEY' },
  voyage: { settingKey: 'voyage_api_key', envVar: 'VOYAGE_API_KEY' },
  cohere: { settingKey: 'cohere_api_key', envVar: 'COHERE_API_KEY' },
}

// Schema para mensagem individual
const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

// Schema para request - suporta session mode e stateless mode
const chatRequestSchema = z.discriminatedUnion('mode', [
  // Session mode: sessionId + message
  z.object({
    mode: z.literal('session').default('session'),
    sessionId: z.string().min(1, 'sessionId é obrigatório'),
    message: z.string().min(1, 'Mensagem é obrigatória').max(4000),
    userName: z.string().optional(),
  }),
  // Stateless mode: array de messages
  z.object({
    mode: z.literal('stateless'),
    messages: z.array(messageSchema).min(1, 'Pelo menos uma mensagem é obrigatória'),
  }),
]).or(
  // Fallback: se não tem mode, inferir pelo conteúdo
  z.object({
    sessionId: z.string().optional(),
    message: z.string().optional(),
    messages: z.array(messageSchema).optional(),
    userName: z.string().optional(),
  })
)

// Schema base de resposta (sem handoff)
const baseResponseSchema = z.object({
  message: z.string().describe('A resposta para enviar ao usuário'),
  sentiment: z
    .enum(['positive', 'neutral', 'negative', 'frustrated'])
    .describe('Sentimento detectado na mensagem do usuário'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Nível de confiança na resposta (0 = incerto, 1 = certo)'),
  sources: z
    .array(z.object({ title: z.string(), content: z.string() }))
    .optional()
    .describe('Fontes utilizadas para gerar a resposta'),
})

// Campos de handoff
const handoffFields = {
  shouldHandoff: z.boolean().describe('Se deve transferir para um atendente humano'),
  handoffReason: z.string().optional().describe('Motivo da transferência para humano'),
  handoffSummary: z.string().optional().describe('Resumo da conversa para o atendente'),
}

function getResponseSchema(handoffEnabled: boolean) {
  if (handoffEnabled) {
    return baseResponseSchema.extend(handoffFields)
  }
  return baseResponseSchema
}

type ChatResponse = z.infer<typeof baseResponseSchema> & {
  shouldHandoff?: boolean
  handoffReason?: string
  handoffSummary?: string
}

// =============================================================================
// Session Store (in-memory para simplicidade - pode migrar para Redis/DB)
// =============================================================================

interface ChatSession {
  agentId: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  userName?: string
  createdAt: number
  lastMessageAt: number
}

// In-memory session store (para MVP - depois pode migrar para Redis)
const sessions = new Map<string, ChatSession>()

// Limpa sessões antigas (mais de 1 hora)
function cleanOldSessions() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000
  for (const [id, session] of sessions) {
    if (session.lastMessageAt < oneHourAgo) {
      sessions.delete(id)
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

function getClient() {
  const client = getSupabaseAdmin()
  if (!client) {
    throw new Error('Supabase admin client not configured')
  }
  return client
}

// =============================================================================
// Route Handler
// =============================================================================

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const startTime = Date.now()

  try {
    const { id: agentId } = await context.params
    const supabase = getClient()
    const body = await request.json()

    // Limpa sessões antigas periodicamente
    cleanOldSessions()

    // Parse e validação do body
    let messages: Array<{ role: 'user' | 'assistant'; content: string }>
    let sessionId: string | undefined
    let userName: string | undefined
    let isSessionMode = false

    // Detectar modo baseado no conteúdo
    if (body.messages && Array.isArray(body.messages)) {
      // Stateless mode
      messages = body.messages
    } else if (body.sessionId && body.message) {
      // Session mode
      isSessionMode = true
      sessionId = String(body.sessionId)
      userName = body.userName

      // Buscar ou criar sessão
      let session = sessions.get(sessionId)
      if (!session) {
        session = {
          agentId,
          messages: [],
          userName,
          createdAt: Date.now(),
          lastMessageAt: Date.now(),
        }
        sessions.set(sessionId, session)
      }

      // Adicionar nova mensagem do usuário
      session.messages.push({ role: 'user', content: body.message })
      session.lastMessageAt = Date.now()
      messages = session.messages
    } else if (body.message) {
      // Single message mode (sem sessão)
      messages = [{ role: 'user', content: body.message }]
    } else {
      return NextResponse.json(
        { error: 'Forneça "messages" (array) ou "sessionId" + "message"' },
        { status: 400 }
      )
    }

    // Validar que última mensagem é do usuário
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role !== 'user') {
      return NextResponse.json(
        { error: 'A última mensagem deve ser do usuário' },
        { status: 400 }
      )
    }

    // Buscar configuração do agente
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', agentId)
      .single()

    if (agentError || !agent) {
      return NextResponse.json(
        { error: 'Agente não encontrado' },
        { status: 404 }
      )
    }

    console.log(`[ai-agents/chat] Agent: ${agent.name}, session: ${sessionId || 'stateless'}, messages: ${messages.length}`)

    // Verificar se tem knowledge base
    const hasKnowledgeBase = await hasIndexedContent(agentId)

    // Import AI dependencies
    const { generateText, gateway, tool, stepCountIs } = await import('ai')
    const { withDevTools } = await import('@/lib/ai/devtools')

    // Criar modelo via Gateway
    const modelId = normalizeToGatewayModelId(agent.model || DEFAULT_MODEL_ID)
    const baseModel = gateway(modelId)
    const model = await withDevTools(baseModel, { name: `chat:${agent.name}` })

    console.log(`[ai-agents/chat] Using model: ${modelId} (via Gateway), hasKB: ${hasKnowledgeBase}`)

    // Preparar resposta estruturada
    let structuredResponse: ChatResponse | undefined
    let ragSources: Array<{ title: string; content: string }> = []
    let searchPerformed = false

    // Schema dinâmico baseado em handoff_enabled
    const handoffEnabled = agent.handoff_enabled ?? true
    const responseSchema = getResponseSchema(handoffEnabled)

    console.log(`[ai-agents/chat] Handoff enabled: ${handoffEnabled}`)

    // Tool: respond
    const respondTool = tool({
      description: 'Envia uma resposta estruturada ao usuário. SEMPRE use esta ferramenta para responder.',
      inputSchema: responseSchema,
      execute: async (params) => {
        const handoffParams = params as {
          shouldHandoff?: boolean
          handoffReason?: string
          handoffSummary?: string
        }
        structuredResponse = {
          ...params,
          shouldHandoff: handoffParams.shouldHandoff,
          handoffReason: handoffParams.handoffReason,
          handoffSummary: handoffParams.handoffSummary,
          sources: ragSources.length > 0 ? ragSources : params.sources,
        }
        return { success: true, message: params.message }
      },
    })

    // Tool: searchKnowledgeBase (se disponível)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let searchKnowledgeBaseTool: any = undefined

    if (hasKnowledgeBase) {
      const embeddingProvider = (agent.embedding_provider || 'google') as EmbeddingProvider
      const config = EMBEDDING_API_KEY_MAP[embeddingProvider]

      const { data: embeddingKeySetting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', config.settingKey)
        .maybeSingle()

      const embeddingApiKey = embeddingKeySetting?.value || process.env[config.envVar]

      if (embeddingApiKey) {
        searchKnowledgeBaseTool = tool({
          description: 'Busca informações na base de conhecimento. Use para responder perguntas específicas.',
          inputSchema: z.object({
            query: z.string().describe('Pergunta ou termos de busca'),
          }),
          execute: async ({ query }) => {
            console.log(`[ai-agents/chat] Knowledge search: "${query.slice(0, 80)}..."`)
            searchPerformed = true

            const embeddingConfig = buildEmbeddingConfigFromAgent(agent as AIAgent)
            const rerankConfig = await buildRerankConfigFromAgent(agent as AIAgent)

            const relevantContent = await findRelevantContent({
              agentId,
              query,
              embeddingConfig,
              rerankConfig,
              topK: agent.rag_max_results || 5,
              threshold: agent.rag_similarity_threshold || 0.5,
            })

            if (relevantContent.length === 0) {
              return { found: false, message: 'Nenhuma informação encontrada.' }
            }

            ragSources = relevantContent.map((r, i) => ({
              title: `Fonte ${i + 1}`,
              content: r.content.slice(0, 200) + '...',
            }))

            const contextText = relevantContent
              .map((r, i) => `[${i + 1}] ${r.content}`)
              .join('\n\n')

            return { found: true, content: contextText, sourceCount: relevantContent.length }
          },
        })
      }
    }

    // Build tools
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: Record<string, any> = { respond: respondTool }
    if (searchKnowledgeBaseTool) {
      tools.searchKnowledgeBase = searchKnowledgeBaseTool
    }

    // Gerar resposta
    await generateText({
      model,
      system: agent.system_prompt,
      messages: messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      temperature: agent.temperature ?? 0.7,
      maxOutputTokens: agent.max_tokens ?? 2048,
      tools,
      ...(searchKnowledgeBaseTool ? { stopWhen: stepCountIs(3) } : {}),
    })

    const latencyMs = Date.now() - startTime

    if (!structuredResponse) {
      throw new Error('Nenhuma resposta gerada pelo agente')
    }

    // Se session mode, adicionar resposta ao histórico
    if (isSessionMode && sessionId) {
      const session = sessions.get(sessionId)
      if (session) {
        session.messages.push({ role: 'assistant', content: structuredResponse.message })
        session.lastMessageAt = Date.now()
      }
    }

    console.log(`[ai-agents/chat] Response in ${latencyMs}ms, handoff: ${structuredResponse.shouldHandoff}`)

    // Retornar resposta no formato inspirado no GPTMaker
    return NextResponse.json({
      // Resposta principal
      message: structuredResponse.message,

      // Metadados
      latency_ms: latencyMs,
      model: modelId,
      session_id: sessionId,

      // Análise
      sentiment: structuredResponse.sentiment,
      confidence: structuredResponse.confidence,

      // Handoff (só presente se handoff_enabled=true)
      handoff_enabled: handoffEnabled,
      should_handoff: structuredResponse.shouldHandoff,
      handoff_reason: structuredResponse.handoffReason,
      handoff_summary: structuredResponse.handoffSummary,

      // RAG
      search_performed: searchPerformed,
      sources: structuredResponse.sources,

      // Histórico (se session mode)
      ...(isSessionMode && sessionId ? {
        message_count: sessions.get(sessionId)?.messages.length || 0,
      } : {}),
    })

  } catch (error) {
    console.error('[ai-agents/chat] Error:', error)

    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return NextResponse.json({ error: 'Erro de autenticação com o modelo de IA' }, { status: 401 })
      }
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        return NextResponse.json({ error: 'Limite de requisições excedido' }, { status: 429 })
      }
      return NextResponse.json({ error: `Erro: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// GET: Listar sessões ativas (para debug)
export async function GET(request: NextRequest, context: RouteContext) {
  const { id: agentId } = await context.params

  const agentSessions = Array.from(sessions.entries())
    .filter(([_, session]) => session.agentId === agentId)
    .map(([id, session]) => ({
      sessionId: id,
      messageCount: session.messages.length,
      userName: session.userName,
      createdAt: new Date(session.createdAt).toISOString(),
      lastMessageAt: new Date(session.lastMessageAt).toISOString(),
    }))

  return NextResponse.json({
    agentId,
    activeSessions: agentSessions.length,
    sessions: agentSessions,
  })
}

// DELETE: Limpar sessão específica
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id: agentId } = await context.params
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId é obrigatório' }, { status: 400 })
  }

  const session = sessions.get(sessionId)
  if (!session || session.agentId !== agentId) {
    return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 })
  }

  sessions.delete(sessionId)

  return NextResponse.json({ success: true, deleted: sessionId })
}
