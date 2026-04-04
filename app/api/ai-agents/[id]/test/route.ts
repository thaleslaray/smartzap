/**
 * T055: Test AI Agent endpoint (V2 - Tool-based RAG)
 * Allows testing an agent with a sample message before activation
 *
 * Uses streamText + tools for structured output (AI SDK v6 pattern)
 * RAG: LLM decides when to search knowledge base (not eager search)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'
import { DEFAULT_MODEL_ID, normalizeToGatewayModelId } from '@/lib/ai/model'
import {
  findRelevantContent,
  buildEmbeddingConfigFromAgent,
  hasIndexedContent,
} from '@/lib/ai/rag-store'
import type { AIAgent, EmbeddingProvider } from '@/types'

// Mapeamento de provider para chave de API na tabela settings
const EMBEDDING_API_KEY_MAP: Record<EmbeddingProvider, { settingKey: string; envVar: string }> = {
  google: { settingKey: 'gemini_api_key', envVar: 'GEMINI_API_KEY' },
  openai: { settingKey: 'openai_api_key', envVar: 'OPENAI_API_KEY' },
  voyage: { settingKey: 'voyage_api_key', envVar: 'VOYAGE_API_KEY' },
  cohere: { settingKey: 'cohere_api_key', envVar: 'COHERE_API_KEY' },
}

// =============================================================================
// Response Schema (dynamic based on handoff_enabled - same as chat-agent)
// =============================================================================

// Schema base (sem handoff)
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
    .array(
      z.object({
        title: z.string(),
        content: z.string(),
      })
    )
    .optional()
    .describe('Fontes utilizadas para gerar a resposta'),
})

// Campos de handoff (adicionados quando habilitado)
const handoffFields = {
  shouldHandoff: z
    .boolean()
    .describe('Se deve transferir para um atendente humano'),
  handoffReason: z
    .string()
    .optional()
    .describe('Motivo da transferência para humano'),
}

/**
 * Gera o schema de resposta baseado na configuração do agente
 */
function getResponseSchema(handoffEnabled: boolean) {
  if (handoffEnabled) {
    return baseResponseSchema.extend(handoffFields)
  }
  return baseResponseSchema
}

// Tipo completo para compatibilidade
type TestResponse = z.infer<typeof baseResponseSchema> & {
  shouldHandoff?: boolean
  handoffReason?: string
}

// Helper to get admin client with null check
function getClient() {
  const client = getSupabaseAdmin()
  if (!client) {
    throw new Error('Supabase admin client not configured. Check SUPABASE_SECRET_KEY env var.')
  }
  return client
}

const testMessageSchema = z.object({
  message: z.string().min(1, 'Mensagem é obrigatória').max(2000),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = getClient()
    const body = await request.json()

    // Validate body
    const parsed = testMessageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { message } = parsed.data

    // Get agent configuration
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json(
        { error: 'Agente não encontrado' },
        { status: 404 }
      )
    }

    console.log(`[ai-agents/test] Agent: ${agent.name}, embedding_provider: ${agent.embedding_provider}`)

    // Check if agent has indexed content in pgvector
    const hasKnowledgeBase = await hasIndexedContent(id)

    // Get count of indexed files for this agent
    const { count: indexedFilesCount } = await supabase
      .from('ai_knowledge_files')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', id)
      .eq('indexing_status', 'completed')

    console.log(`[ai-agents/test] hasKnowledgeBase: ${hasKnowledgeBase}, indexed files: ${indexedFilesCount}`)

    // Import AI dependencies dynamically
    const { generateText, gateway, tool, stepCountIs } = await import('ai')
    const { withDevTools } = await import('@/lib/ai/devtools')

    // Criar modelo via Gateway
    const modelId = normalizeToGatewayModelId(agent.model || DEFAULT_MODEL_ID)
    const baseModel = gateway(modelId)

    // Create model with DevTools support
    const model = await withDevTools(baseModel, { name: `agente:${agent.name}` })

    console.log(`[ai-agents/test] Using model: ${modelId} (via Gateway)`)

    // Generate response
    const startTime = Date.now()

    // Capture structured response and sources from tool execution
    let structuredResponse: TestResponse | undefined
    let ragSources: Array<{ title: string; content: string }> = []
    let searchPerformed = false

    // =======================================================================
    // TOOL-BASED RAG: LLM decides when to search
    // =======================================================================

    // Use agent's system prompt as-is (model decides when to use tools)
    const systemPrompt = agent.system_prompt

    // Define respond tool with dynamic schema based on handoff_enabled
    const handoffEnabled = agent.handoff_enabled ?? true
    const responseSchema = getResponseSchema(handoffEnabled)

    console.log(`[ai-agents/test] Handoff enabled: ${handoffEnabled}`)

    const respondTool = tool({
      description: 'Envia uma resposta estruturada ao usuário. SEMPRE use esta ferramenta para responder.',
      inputSchema: responseSchema,
      execute: async (params) => {
        const handoffParams = params as {
          shouldHandoff?: boolean
          handoffReason?: string
        }
        structuredResponse = {
          ...params,
          shouldHandoff: handoffParams.shouldHandoff,
          handoffReason: handoffParams.handoffReason,
          sources: ragSources.length > 0 ? ragSources : params.sources,
        }
        return { success: true, message: params.message }
      },
    })

    // Knowledge base search tool - only created if agent has indexed content and API key
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let searchKnowledgeBaseTool: any = undefined

    if (hasKnowledgeBase) {
      // Get embedding API key for the configured provider
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
          description: 'Busca informações na base de conhecimento do agente. Use para responder perguntas que precisam de dados específicos.',
          inputSchema: z.object({
            query: z.string().describe('A pergunta ou termos de busca para encontrar informações relevantes'),
          }),
          execute: async ({ query }) => {
            console.log(`[ai-agents/test] LLM requested knowledge search: "${query.slice(0, 100)}..."`)
            searchPerformed = true
            const ragStartTime = Date.now()

            const embeddingConfig = buildEmbeddingConfigFromAgent(agent as AIAgent)

            const relevantContent = await findRelevantContent({
              agentId: id,
              query,
              embeddingConfig,
              topK: agent.rag_max_results || 5,
              threshold: agent.rag_similarity_threshold || 0.5,
            })

            console.log(`[ai-agents/test] RAG search completed in ${Date.now() - ragStartTime}ms, found ${relevantContent.length} chunks`)

            if (relevantContent.length === 0) {
              return { found: false, message: 'Nenhuma informação relevante encontrada na base de conhecimento.' }
            }

            // Track sources for response
            ragSources = relevantContent.map((r, i) => ({
              title: `Trecho ${i + 1} (${(r.similarity * 100).toFixed(0)}% relevante)`,
              content: r.content.slice(0, 200) + (r.content.length > 200 ? '...' : ''),
            }))

            // Return formatted content for LLM to use
            const contextText = relevantContent
              .map((r, i) => `[${i + 1}] ${r.content}`)
              .join('\n\n')

            return {
              found: true,
              content: contextText,
              sourceCount: relevantContent.length,
            }
          },
        })
      } else {
        console.log(`[ai-agents/test] Embedding API key not configured for ${embeddingProvider}`)
      }
    }

    // Build tools object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: Record<string, any> = { respond: respondTool }
    if (searchKnowledgeBaseTool) {
      tools.searchKnowledgeBase = searchKnowledgeBaseTool
    }

    console.log(`[ai-agents/test] Generating response with tools: ${Object.keys(tools).join(', ')}`)

    // Generate with multi-step support (LLM can search, then respond)
    await generateText({
      model,
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: message }],
      temperature: agent.temperature ?? 0.7,
      maxOutputTokens: agent.max_tokens ?? 1024,
      tools,
      ...(searchKnowledgeBaseTool ? { stopWhen: stepCountIs(3) } : {}), // Allow: search → think → respond
    })

    const latencyMs = Date.now() - startTime

    // If no structured response was captured, something went wrong
    if (!structuredResponse) {
      throw new Error('No structured response generated from AI')
    }

    console.log(`[ai-agents/test] Response generated in ${latencyMs}ms. Search performed: ${searchPerformed}`)

    return NextResponse.json({
      response: structuredResponse.message,
      latency_ms: latencyMs,
      model: modelId,
      knowledge_files_used: indexedFilesCount ?? 0,
      rag_enabled: hasKnowledgeBase,
      rag_chunks_used: ragSources.length,
      search_performed: searchPerformed, // New: indicates if LLM decided to search
      // Structured output fields
      sentiment: structuredResponse.sentiment,
      confidence: structuredResponse.confidence,
      // Handoff fields (only present when handoff_enabled=true)
      handoff_enabled: handoffEnabled,
      should_handoff: structuredResponse.shouldHandoff,
      handoff_reason: structuredResponse.handoffReason,
      sources: structuredResponse.sources,
    })
  } catch (error) {
    console.error('[ai-agents/test] Error:', error)

    // Handle AI SDK specific errors
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return NextResponse.json(
          { error: 'Erro de autenticação com o modelo de IA' },
          { status: 401 }
        )
      }
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        return NextResponse.json(
          { error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' },
          { status: 429 }
        )
      }
      if (error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED')) {
        return NextResponse.json(
          { error: 'Quota excedida. Verifique seu plano do Gemini e configure billing.' },
          { status: 429 }
        )
      }
      // Return the actual error message for debugging
      return NextResponse.json(
        { error: `Erro ao testar agente: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Erro ao testar agente' },
      { status: 500 }
    )
  }
}
