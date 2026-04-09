/**
 * AI Chat API Route using AI SDK v6 patterns
 * Uses streamText + tools for structured output with SDK-native message handling
 */

import {
  streamText,
  convertToModelMessages,
  tool,
  type UIMessage,
} from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { z } from 'zod'
import { createClient } from '@/lib/supabase-server'
import { DEFAULT_MODEL_ID } from '@/lib/ai/model'
import { getAiDirectConfig } from '@/lib/ai/ai-center-config'
import { sendMessage as sendWhatsAppMessageToDB } from '@/lib/inbox/inbox-service'
import { getConversationById } from '@/lib/inbox/inbox-db'
import type { AIAgent, InboxConversation } from '@/types'

// Allow streaming responses up to 30 seconds
export const maxDuration = 30

// =============================================================================
// Schemas
// =============================================================================

const requestSchema = z.object({
  messages: z.array(z.any()), // UIMessage[]
  conversationId: z.string().uuid(),
  agentId: z.string().uuid(),
})

/**
 * Tool response schema - structured output from AI
 * This ensures consistent, validated responses
 */
const respondToolSchema = z.object({
  message: z.string().describe('A resposta para enviar ao usuário'),
  sentiment: z
    .enum(['positive', 'neutral', 'negative', 'frustrated'])
    .describe('Sentimento detectado na mensagem do usuário'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Nível de confiança na resposta (0 = incerto, 1 = certo)'),
  shouldHandoff: z
    .boolean()
    .describe('Se deve transferir para um atendente humano'),
  isUrgent: z
    .boolean()
    .describe('Se a transferência é URGENTE (cliente frustrado, emergência). False = transferência normal'),
  handoffReason: z
    .string()
    .optional()
    .describe('Motivo da transferência para humano'),
  handoffSummary: z
    .string()
    .optional()
    .describe('Resumo da conversa para o atendente'),
})

// =============================================================================
// Helper Functions
// =============================================================================

async function getAgent(agentId: string): Promise<AIAgent | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('id', agentId)
    .single()

  if (error || !data) return null
  return data as AIAgent
}

function buildSystemPrompt(agent: AIAgent, conversation: InboxConversation): string {
  const contactName = conversation.contact?.name || 'Cliente'

  return `${agent.system_prompt}

CONTEXTO DA CONVERSA:
- Nome do cliente: ${contactName}
- Telefone: ${conversation.phone}
- Prioridade: ${conversation.priority || 'normal'}
- Total de mensagens: ${conversation.total_messages}

INSTRUÇÕES IMPORTANTES:
1. Responda sempre em português do Brasil
2. Seja educado, profissional e empático
3. Se não souber a resposta, admita e ofereça alternativas
4. Detecte o sentimento do cliente (positivo, neutro, negativo, frustrado)

CRITÉRIOS PARA TRANSFERÊNCIA (shouldHandoff = true):
- Cliente explicitamente pede para falar com atendente/humano
- Cliente expressa frustração repetida (3+ mensagens negativas)
- Assunto sensível (reclamação formal, problema financeiro, dados pessoais)
- Você não consegue ajudar após 2 tentativas
- Detecção de urgência real (emergência, prazo crítico)

QUANDO MARCAR COMO URGENTE (isUrgent = true):
- Cliente está FRUSTRADO ou IRRITADO (sentimento negativo forte)
- Emergência real (prazo crítico, problema grave)
- Cliente já reclamou várias vezes

QUANDO NÃO É URGENTE (isUrgent = false):
- Cliente pediu educadamente para falar com humano
- Assunto sensível mas cliente está calmo
- Transferência preventiva (você não sabe ajudar)

IMPORTANTE: Você DEVE usar a ferramenta "respond" para enviar sua resposta.`
}

async function persistAILog(params: {
  conversationId: string
  agentId: string
  input: string
  output: z.infer<typeof respondToolSchema>
  latencyMs: number
  modelUsed: string
}): Promise<string | undefined> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('ai_agent_logs')
      .insert({
        conversation_id: params.conversationId,
        ai_agent_id: params.agentId,
        input_message: params.input,
        output_message: params.output.message,
        response_time_ms: params.latencyMs,
        model_used: params.modelUsed,
        metadata: {
          sentiment: params.output.sentiment,
          confidence: params.output.confidence,
          shouldHandoff: params.output.shouldHandoff,
          isUrgent: params.output.isUrgent,
          handoffReason: params.output.handoffReason,
        },
      })
      .select('id')
      .single()

    if (error) {
      console.error('[AI Log] Failed to persist:', error)
      return undefined
    }
    return data?.id
  } catch (err) {
    console.error('[AI Log] Error:', err)
    return undefined
  }
}

// =============================================================================
// POST Handler
// =============================================================================

export async function POST(req: Request) {
  const startTime = Date.now()

  try {
    const body = await req.json()
    const parsed = requestSchema.safeParse(body)

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parsed.error.flatten() }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { messages, conversationId, agentId } = parsed.data

    // Fetch agent and conversation in parallel
    const [agent, conversation] = await Promise.all([
      getAgent(agentId),
      getConversationById(conversationId),
    ])

    if (!agent) {
      return new Response(
        JSON.stringify({ error: 'Agent not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!conversation) {
      return new Response(
        JSON.stringify({ error: 'Conversation not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check if conversation is in bot mode
    if (conversation.mode !== 'bot') {
      return new Response(
        JSON.stringify({ error: 'Conversation is not in bot mode' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get the last user message for logging
    const lastUserMessage = messages
      .filter((m: UIMessage) => m.role === 'user')
      .slice(-1)[0]
    const inputText = lastUserMessage?.content || ''

    // Criar modelo direto via provider
    const config = await getAiDirectConfig()
    const targetModelId = agent.model || config.model || DEFAULT_MODEL_ID
    if (!config.googleApiKey) throw new Error('Chave Google não configurada. Acesse Configurações → IA.')
    const model = createGoogleGenerativeAI({ apiKey: config.googleApiKey })(targetModelId)

    console.log(`[inbox/chat] Using model: ${targetModelId} (provider: ${config.provider})`)

    // Convert messages to model format
    const modelMessages = await convertToModelMessages(messages as UIMessage[])

    // Use streamText with tools for structured output
    const result = streamText({
      model,
      system: buildSystemPrompt(agent, conversation),
      messages: modelMessages,
      tools: {
        respond: tool({
          description: 'Envia uma resposta estruturada ao usuário. SEMPRE use esta ferramenta para responder.',
          inputSchema: respondToolSchema,
          execute: async (params) => {
            const latencyMs = Date.now() - startTime

            // Persist AI log
            await persistAILog({
              conversationId,
              agentId,
              input: inputText,
              output: params,
              latencyMs,
              modelUsed: targetModelId,
            })

            // Send message to WhatsApp and persist
            try {
              await sendWhatsAppMessageToDB(conversationId, params.message)
            } catch (err) {
              console.error('[Chat API] Failed to send WhatsApp message:', err)
              // Don't fail the whole response, the message was generated
            }

            // Handle handoff if needed
            if (params.shouldHandoff) {
              const supabase = await createClient()

              if (params.isUrgent) {
                // URGENTE: mantém no bot, marca como urgente
                // Aparece com badge vermelho na fila até atendente assumir
                await supabase
                  .from('inbox_conversations')
                  .update({
                    priority: 'urgent',
                    handoff_summary: params.handoffSummary || params.handoffReason,
                  })
                  .eq('id', conversationId)
              } else {
                // Normal: transfere direto para humano
                // Vai para fila normal de atendimento
                await supabase
                  .from('inbox_conversations')
                  .update({
                    mode: 'human',
                    priority: 'normal',
                    handoff_summary: params.handoffSummary || params.handoffReason,
                  })
                  .eq('id', conversationId)
              }
            }

            // Return the structured response
            return params
          },
        }),
      },
      // Force the model to use the respond tool
      toolChoice: 'required',
      temperature: 0.7,
      maxOutputTokens: 2048,
    })

    // Return the stream response
    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error('[POST /api/inbox/chat]', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
