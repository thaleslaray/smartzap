/**
 * Chat Agent - Tool-based RAG (Vercel AI SDK pattern)
 *
 * Agente de chat que processa conversas do inbox usando IA.
 * Suporta múltiplos providers: Google (Gemini), OpenAI (GPT), Anthropic (Claude).
 *
 * Usa RAG próprio com Supabase pgvector seguindo o padrão recomendado pela Vercel:
 * - O LLM recebe uma tool `searchKnowledgeBase` e DECIDE quando usá-la
 * - Para saudações ("oie") → responde direto, sem buscar
 * - Para perguntas ("qual o horário?") → chama a tool, depois responde
 *
 * Isso é mais eficiente que "eager RAG" (sempre buscar) porque:
 * - Reduz latência em mensagens que não precisam de contexto
 * - Reduz custos de embedding (menos queries)
 * - Evita injetar ruído em conversas simples
 */

import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase'
import { DEFAULT_MODEL_ID, normalizeToGatewayModelId } from '@/lib/ai/model'
import type { AIAgent, InboxConversation, InboxMessage } from '@/types'

// NOTE: AI dependencies are imported DYNAMICALLY inside processChatAgent
// This is required because static imports can cause issues when called from
// background contexts (like debounced webhook handlers)

// =============================================================================
// Debounce Manager
// =============================================================================

/**
 * Track pending responses to implement debounce
 * Key: conversationId, Value: timeout handle and last message timestamp
 */
const pendingResponses = new Map<
  string,
  {
    timeout: NodeJS.Timeout
    lastMessageAt: number
    messageIds: string[]
  }
>()

/**
 * Check if we should wait for more messages (debounce)
 * Returns true if we should delay processing
 */
export function shouldDebounce(
  conversationId: string,
  debounceSec: number = 5
): boolean {
  const pending = pendingResponses.get(conversationId)
  if (!pending) return false

  const elapsed = Date.now() - pending.lastMessageAt
  return elapsed < debounceSec * 1000
}

/**
 * Schedule agent processing with debounce
 * Returns a promise that resolves when processing should begin
 */
export function scheduleWithDebounce(
  conversationId: string,
  messageId: string,
  debounceSec: number = 5
): Promise<string[]> {
  return new Promise((resolve) => {
    const pending = pendingResponses.get(conversationId)

    // Clear existing timeout
    if (pending?.timeout) {
      clearTimeout(pending.timeout)
    }

    // Accumulate message IDs
    const messageIds = pending?.messageIds || []
    messageIds.push(messageId)

    // Set new timeout
    const timeout = setTimeout(() => {
      const accumulated = pendingResponses.get(conversationId)
      pendingResponses.delete(conversationId)
      resolve(accumulated?.messageIds || messageIds)
    }, debounceSec * 1000)

    pendingResponses.set(conversationId, {
      timeout,
      lastMessageAt: Date.now(),
      messageIds,
    })
  })
}

/**
 * Cancel pending debounce for a conversation
 */
export function cancelDebounce(conversationId: string): void {
  const pending = pendingResponses.get(conversationId)
  if (pending?.timeout) {
    clearTimeout(pending.timeout)
    pendingResponses.delete(conversationId)
  }
}

// =============================================================================
// Types
// =============================================================================

export interface ContactContext {
  name?: string
  email?: string
  created_at?: string
}

export interface SupportAgentConfig {
  agent: AIAgent
  conversation: InboxConversation
  messages: InboxMessage[]
  contactData?: ContactContext
}

export interface SupportAgentResult {
  success: boolean
  response?: SupportResponse
  error?: string
  latencyMs: number
  logId?: string
}

// =============================================================================
// Response Schema
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
  shouldQuoteUserMessage: z
    .boolean()
    .optional()
    .describe('Se a resposta deve citar a mensagem do usuário (aparecer como reply)'),
})

// Campos de handoff (adicionados quando habilitado)
// NOTA: A lógica de QUANDO fazer handoff deve estar no system_prompt do agente,
// não aqui. Este schema apenas define a estrutura da resposta.
const handoffFields = {
  shouldHandoff: z
    .boolean()
    .describe('Se deve transferir para um atendente humano'),
  handoffReason: z
    .string()
    .optional()
    .describe('Motivo da transferência para humano'),
  handoffSummary: z
    .string()
    .optional()
    .describe('Resumo da conversa para o atendente'),
}

// Schema completo (com handoff) - mantido para compatibilidade
const supportResponseSchema = baseResponseSchema.extend(handoffFields)

/**
 * Gera o schema de resposta baseado na configuração do agente
 */
function getResponseSchema(handoffEnabled: boolean) {
  if (handoffEnabled) {
    return baseResponseSchema.extend(handoffFields)
  }
  return baseResponseSchema
}

export type SupportResponse = z.infer<typeof supportResponseSchema>

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_MAX_TOKENS = 2048
const AI_TIMEOUT_MS = 90_000 // 90 segundos - timeout para chamadas de IA (considera RAG + tools)
const MAX_TOOL_RETRIES = 2 // Tentativas extras quando LLM não chama respond tool

/**
 * Converte formatação Markdown para WhatsApp.
 * Executado após a resposta do LLM (zero tokens extras).
 *
 * Markdown → WhatsApp:
 * - **texto** → *texto* (negrito)
 * - __texto__ → *texto* (negrito alternativo)
 * - ~~texto~~ → ~texto~ (riscado)
 * - [texto](url) → texto (url) ou só url se forem iguais
 */
function convertMarkdownToWhatsApp(text: string): string {
  return text
    // **texto** ou __texto__ → *texto* (negrito)
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/__(.+?)__/g, '*$1*')
    // ~~texto~~ → ~texto~ (riscado)
    .replace(/~~(.+?)~~/g, '~$1~')
    // [texto](url) → converte links Markdown
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
      // Se o texto é basicamente a URL (com ou sem protocolo), só retorna a URL
      const cleanText = linkText.replace(/^https?:\/\//, '').replace(/\/$/, '')
      const cleanUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '')
      if (cleanText === cleanUrl || linkText === url) {
        return url
      }
      // Senão, retorna "texto: url"
      return `${linkText}: ${url}`
    })
}

// =============================================================================
// Helpers
// =============================================================================

function convertToAIMessages(
  messages: InboxMessage[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((m) => m.message_type !== 'internal_note')
    .map((m) => ({
      role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }))
}


async function persistAILog(data: {
  conversationId: string
  agentId: string
  messageIds: string[]
  input: string
  output: SupportResponse | null
  latencyMs: number
  error: string | null
  modelUsed: string
}): Promise<string | undefined> {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      console.error('[chat-agent] Supabase admin client not available')
      return undefined
    }
    const { data: log, error } = await supabase
      .from('ai_agent_logs')
      .insert({
        conversation_id: data.conversationId,
        ai_agent_id: data.agentId,
        input_message: data.input,
        output_message: data.output?.message || null,
        response_time_ms: data.latencyMs,
        model_used: data.modelUsed,
        tokens_used: null,
        sources_used: data.output?.sources || null,
        error_message: data.error,
        metadata: {
          messageIds: data.messageIds,
          sentiment: data.output?.sentiment,
          confidence: data.output?.confidence,
          shouldHandoff: data.output?.shouldHandoff,
          handoffReason: data.output?.handoffReason,
        },
      })
      .select('id')
      .single()

    if (error) {
      console.error('[chat-agent] Failed to persist log:', error)
      return undefined
    }
    return log?.id
  } catch (err) {
    console.error('[chat-agent] Log error:', err)
    return undefined
  }
}

// =============================================================================
// Main Function
// =============================================================================

export async function processChatAgent(
  config: SupportAgentConfig
): Promise<SupportAgentResult> {
  const { agent, conversation, messages } = config
  const startTime = Date.now()

  // Dynamic imports - required for background execution context
  const { generateText, tool, stepCountIs, gateway } = await import('ai')
  const { withDevTools } = await import('@/lib/ai/devtools')
  const {
    findRelevantContent,
    hasIndexedContent,
    buildEmbeddingConfigFromAgent,
    buildRerankConfigFromAgent,
  } = await import('@/lib/ai/rag-store')

  // Setup message context
  const lastUserMessage = messages.filter((m) => m.direction === 'inbound').slice(-1)[0]
  const inputText = lastUserMessage?.content || ''
  const messageIds = messages.map((m) => m.id)
  const aiMessages = convertToAIMessages(messages.slice(-10))

  // =======================================================================
  // MEM0: Fetch relevant memories (graceful degradation)
  // =======================================================================
  const { fetchRelevantMemories, saveInteractionMemory, isMem0EnabledAsync } = await import('@/lib/ai/mem0-client')

  let memoryContext = { systemPromptAddition: '', memoryCount: 0 }
  let mem0Enabled = false
  try {
    mem0Enabled = await isMem0EnabledAsync()
    if (mem0Enabled) {
      console.log(`[chat-agent] Mem0 enabled, fetching memories for ${conversation.phone}...`)
      memoryContext = await fetchRelevantMemories(inputText, {
        user_id: conversation.phone,
        agent_id: agent.id,
      })
      if (memoryContext.memoryCount > 0) {
        console.log(`[chat-agent] Found ${memoryContext.memoryCount} memories`)
      }
    } else {
      console.log(`[chat-agent] Mem0 disabled (configure mem0_enabled e mem0_api_key nas settings)`)
    }
  } catch (mem0Error) {
    // Falha no Mem0 não deve derrubar o agente — continua sem memória
    console.warn(`[chat-agent] Mem0 unavailable (degradação graceful):`, mem0Error instanceof Error ? mem0Error.message : mem0Error)
    mem0Enabled = false
  }

  // Get model configuration - routes through AI Gateway via OIDC
  const modelId = agent.model || DEFAULT_MODEL_ID

  const gatewayModelId = normalizeToGatewayModelId(modelId)
  const baseModel = gateway(gatewayModelId)
  const model = await withDevTools(baseModel, { name: `agente:${agent.name}` })

  console.log(`[chat-agent] Using gateway model: ${gatewayModelId}`)

  // Check if agent has indexed content in pgvector
  let hasKnowledgeBase = false
  try {
    hasKnowledgeBase = await hasIndexedContent(agent.id)
  } catch (ragError) {
    // Falha no pgvector não deve derrubar o agente — continua sem RAG
    console.warn(`[chat-agent] pgvector check unavailable (degradação graceful):`, ragError instanceof Error ? ragError.message : ragError)
  }

  console.log(`[chat-agent] Processing: model=${modelId}, hasKnowledgeBase=${hasKnowledgeBase}`)
  console.log(`[chat-agent] Total messages received: ${messages.length}`)
  console.log(`[chat-agent] Last user message: "${inputText.slice(0, 100)}..."`)

  let response: SupportResponse | undefined
  let error: string | null = null
  let sources: Array<{ title: string; content: string }> | undefined

  try {
    // =======================================================================
    // TOOL-BASED RAG: LLM decides when to search
    // =======================================================================

    // Define respond tool (required for structured output)
    // Schema é dinâmico baseado em handoff_enabled
    const handoffEnabled = agent.handoff_enabled ?? true // default true para compatibilidade

    // Build system prompt: base + contact context + handoff instructions + memory context
    let systemPrompt = agent.system_prompt

    // Adiciona contexto do contato (nome, email)
    const { contactData } = config
    if (contactData && (contactData.name || contactData.email)) {
      const contactLines: string[] = []
      if (contactData.name) contactLines.push(`- Nome: ${contactData.name}`)
      if (contactData.email) contactLines.push(`- Email: ${contactData.email}`)
      if (contactData.created_at) {
        const date = new Date(contactData.created_at).toLocaleDateString('pt-BR')
        contactLines.push(`- Cliente desde: ${date}`)
      }
      systemPrompt += `\n\n## Contexto do Contato\n${contactLines.join('\n')}`
    }

    // Adiciona instruções de handoff se habilitado e configurado
    if (handoffEnabled && agent.handoff_instructions) {
      systemPrompt += `\n\n## Transferência para Humano\n${agent.handoff_instructions}`
    }

    // Adiciona contexto de memória (Mem0) se disponível
    if (memoryContext.systemPromptAddition) {
      systemPrompt += `\n\n${memoryContext.systemPromptAddition}`
    }
    const responseSchema = getResponseSchema(handoffEnabled)

    console.log(`[chat-agent] Handoff enabled: ${handoffEnabled}`)

    // Flags de estado
    let hasResponded = false
    let shouldQuoteUserMessage = false // Setado pelo tool quoteMessage

    const respondTool = tool({
      description: 'Envia uma resposta estruturada ao usuário. Use APENAS quando tiver a resposta final. NÃO use para respostas parciais.',
      inputSchema: responseSchema,
      execute: async (params) => {
        const handoffParams = params as { shouldHandoff?: boolean }
        // Converte Markdown → WhatsApp (zero tokens extras, só post-processing)
        const formattedMessage = convertMarkdownToWhatsApp(params.message)
        response = {
          ...params,
          message: formattedMessage,
          shouldHandoff: handoffParams.shouldHandoff ?? false,
          sources: sources || params.sources,
          shouldQuoteUserMessage, // Inclui a flag setada pelo tool quoteMessage
        }
        hasResponded = true // Marca que já respondeu
        return { success: true, message: formattedMessage }
      },
    })

    // Knowledge base search tool - only created if agent has indexed content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let searchKnowledgeBaseTool: any = undefined

    if (hasKnowledgeBase) {
      searchKnowledgeBaseTool = tool({
        description: 'Busca informações na base de conhecimento do agente. Use para responder perguntas que precisam de dados específicos.',
        inputSchema: z.object({
          query: z.string().describe('A pergunta ou termos de busca para encontrar informações relevantes'),
        }),
        execute: async ({ query }) => {
          console.log(`[chat-agent] LLM requested knowledge search: "${query.slice(0, 100)}..."`)
          const ragStartTime = Date.now()

          // Build configs
          const embeddingConfig = buildEmbeddingConfigFromAgent(agent)
          const rerankConfig = await buildRerankConfigFromAgent(agent)

          // Search
          const relevantContent = await findRelevantContent({
            agentId: agent.id,
            query,
            embeddingConfig,
            rerankConfig,
            topK: agent.rag_max_results || 5,
            threshold: agent.rag_similarity_threshold || 0.5,
          })

          console.log(`[chat-agent] RAG search completed in ${Date.now() - ragStartTime}ms, found ${relevantContent.length} chunks`)

          if (relevantContent.length === 0) {
            return { found: false, message: 'Nenhuma informação relevante encontrada na base de conhecimento.' }
          }

          // Track sources for logging
          sources = relevantContent.map((r, i) => ({
            title: `Fonte ${i + 1}`,
            content: r.content.slice(0, 200) + '...',
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
    }

    // Build tools object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: Record<string, any> = { respond: respondTool }
    if (searchKnowledgeBaseTool) {
      tools.searchKnowledgeBase = searchKnowledgeBaseTool
    }

    // Booking Flow tool - only created if agent has booking tool enabled
    if (agent.booking_tool_enabled) {
      console.log(`[chat-agent] 📅 Booking tool is enabled, checking prerequisites...`)
      const { sendBookingFlow, checkBookingPrerequisites, BOOKING_TOOL_DESCRIPTION } = await import('@/lib/ai/tools/booking-tool')

      // Check if prerequisites are met (async check)
      const prereqs = await checkBookingPrerequisites()
      console.log(`[chat-agent] 📅 Prerequisites check: ready=${prereqs.ready}, missing=${prereqs.missing.join(', ') || 'none'}`)

      if (prereqs.ready) {
        const sendBookingFlowTool = tool({
          description: BOOKING_TOOL_DESCRIPTION,
          // Schema com campo opcional - alguns providers não lidam bem com schemas vazios
          inputSchema: z.object({
            confirm: z.boolean().optional().describe('Confirmação para enviar o formulário de agendamento (sempre true)')
          }),
          execute: async () => {
            console.log(`[chat-agent] 📅 LLM requested booking flow for: ${conversation.phone}`)
            const result = await sendBookingFlow(conversation.phone)

            if (result.success) {
              console.log(`[chat-agent] 📅 Booking flow sent successfully: ${result.messageId}`)
              return {
                sent: true,
                message: 'Formulário de agendamento enviado com sucesso. O cliente verá os horários disponíveis.',
              }
            }
            console.log(`[chat-agent] 📅 Failed to send booking flow: ${result.error}`)
            return {
              sent: false,
              message: `Não foi possível enviar o formulário: ${result.error}`,
            }
          },
        })
        tools.sendBookingFlow = sendBookingFlowTool
        console.log(`[chat-agent] 📅 Booking tool added to tools list`)
      } else {
        console.log(`[chat-agent] ⚠️ Booking tool enabled but prerequisites not met: ${prereqs.missing.join(', ')}`)
      }
    }

    // Reaction tool - allows the agent to react to user messages with emojis
    // Only available if: 1) we have the user's message ID, 2) agent allows reactions
    const allowReactions = agent.allow_reactions !== false // default true
    const allowQuotes = agent.allow_quotes !== false // default true

    if (lastUserMessage?.whatsapp_message_id && allowReactions) {
      const { sendReaction } = await import('@/lib/whatsapp-send')

      const reactToMessageTool = tool({
        description: 'Reage à mensagem do usuário com um emoji. A reação aparece grudada na mensagem dele como feedback visual instantâneo.',
        inputSchema: z.object({
          emoji: z.string().describe('O emoji para reagir à mensagem do usuário'),
        }),
        execute: async ({ emoji }) => {
          console.log(`[chat-agent] 😀 LLM requested reaction: ${emoji} on message ${lastUserMessage.whatsapp_message_id}`)

          const result = await sendReaction({
            to: conversation.phone,
            messageId: lastUserMessage.whatsapp_message_id!,
            emoji,
          })

          if (result.success) {
            console.log(`[chat-agent] 😀 Reaction sent successfully`)
            return { reacted: true, emoji }
          }

          console.log(`[chat-agent] 😀 Reaction failed: ${result.error}`)
          return { reacted: false, error: result.error }
        },
      })

      tools.reactToMessage = reactToMessageTool
      console.log(`[chat-agent] 😀 Reaction tool added to tools list`)
    } else if (!allowReactions) {
      console.log(`[chat-agent] 😀 Reaction tool disabled by agent settings`)
    } else {
      console.log(`[chat-agent] ⚠️ Reaction tool not available: no whatsapp_message_id on last user message`)
    }

    // Quote Message tool - allows the agent to quote/reply to the user's message
    if (lastUserMessage?.whatsapp_message_id && allowQuotes) {
      const quoteMessageTool = tool({
        description: 'Faz a resposta aparecer como citação da mensagem do usuário (reply). Use para destacar que está respondendo diretamente a algo específico que o usuário disse.',
        inputSchema: z.object({
          reason: z.string().optional().describe('Motivo opcional para citar a mensagem'),
        }),
        execute: async ({ reason }) => {
          console.log(`[chat-agent] 💬 LLM requested to quote user message${reason ? `: ${reason}` : ''}`)
          shouldQuoteUserMessage = true
          return { willQuote: true, reason }
        },
      })

      tools.quoteMessage = quoteMessageTool
      console.log(`[chat-agent] 💬 Quote tool added to tools list`)
    } else if (!allowQuotes) {
      console.log(`[chat-agent] 💬 Quote tool disabled by agent settings`)
    }

    // Determina se precisa de multi-step (mais de uma tool além de respond)
    const hasMultipleTools = Object.keys(tools).length > 1
    console.log(`[chat-agent] Generating response with tools: ${Object.keys(tools).join(', ')}, multiStep: ${hasMultipleTools}`)

    // Generate with multi-step support when we have multiple tools
    // Condição de parada: para assim que respond for chamado OU após 3 steps
    const stopCondition = () => {
      if (hasResponded) {
        console.log(`[chat-agent] 🛑 Stopping: respond tool was called`)
        return true
      }
      return false
    }

    console.log(`[chat-agent] 🚀 Calling generateText...`)
    const startGenerate = Date.now()

    // =======================================================================
    // RETRY LOOP: Tenta novamente se LLM não chamar respond tool
    // Issue #8992: toolChoice: 'required' não é garantia, LLM pode retornar texto puro
    // Solução: retry com prompt reforçado até MAX_TOOL_RETRIES tentativas
    // =======================================================================
    let retryCount = 0
    let lastLLMText = '' // Guarda texto que o LLM gerou sem chamar tool

    while (!hasResponded && retryCount <= MAX_TOOL_RETRIES) {
      // Timeout AbortController - previne que chamadas de IA fiquem penduradas
      const abortController = new AbortController()
      const timeoutId = setTimeout(() => {
        console.error(`[chat-agent] ⏱️ AI call timed out after ${AI_TIMEOUT_MS}ms`)
        abortController.abort()
      }, AI_TIMEOUT_MS)

      // Se é retry, adiciona instrução reforçada ao system prompt
      let currentSystemPrompt = systemPrompt
      // Usa cópia do array base para não acumular contexto de retries entre iterações
      let currentMessages = [...aiMessages]
      if (retryCount > 0) {
        console.log(`[chat-agent] 🔄 Retry ${retryCount}/${MAX_TOOL_RETRIES} - LLM não chamou respond tool`)
        currentSystemPrompt += `\n\n## INSTRUÇÃO CRÍTICA\nVocê DEVE chamar a tool "respond" para enviar sua resposta. NÃO responda com texto direto. Use a tool respond com message, sentiment e confidence.`

        // Adiciona o texto anterior como contexto na CÓPIA, sem mutar o array original
        if (lastLLMText) {
          currentMessages = [
            ...currentMessages,
            {
              role: 'assistant' as const,
              content: lastLLMText,
            },
            {
              role: 'user' as const,
              content: '[SISTEMA] Você precisa usar a tool "respond" para enviar sua resposta. Reformule sua resposta anterior usando a tool.',
            },
          ]
        }
      }

      try {
        const result = await generateText({
          model,
          system: currentSystemPrompt,
          messages: currentMessages,
          tools,
          toolChoice: 'required', // FORÇA o LLM a chamar uma tool (respond)
          // Para quando respond for chamado OU após 3 steps (o que vier primeiro)
          stopWhen: (event) => stopCondition() || stepCountIs(3)(event),
          temperature: agent.temperature ?? DEFAULT_TEMPERATURE,
          maxOutputTokens: agent.max_tokens ?? DEFAULT_MAX_TOKENS,
          abortSignal: abortController.signal,
        })

        clearTimeout(timeoutId) // Limpa timeout se completou

        const attemptLabel = retryCount === 0 ? '' : ` (retry ${retryCount})`
        console.log(`[chat-agent] ✅ generateText completed${attemptLabel} in ${Date.now() - startGenerate}ms`)
        console.log(`[chat-agent] Steps executed: ${result.steps?.length || 0}`)
        console.log(`[chat-agent] Tool calls: ${JSON.stringify(result.steps?.map(s => s.toolCalls?.map(tc => tc.toolName)).flat().filter(Boolean) || [])}`)
        console.log(`[chat-agent] Finish reason: ${result.finishReason}`)

        // 🔍 DIAGNÓSTICO: Log completo quando finishReason é error
        if (result.finishReason === 'error') {
          console.error(`[chat-agent] 🔴 PROVIDER ERROR DETAILS:`)
          console.error(`[chat-agent] - finishReason: ${result.finishReason}`)
          console.error(`[chat-agent] - text: ${result.text?.slice(0, 200) || 'none'}`)
          console.error(`[chat-agent] - response headers: ${JSON.stringify(result.response?.headers || {})}`)
          console.error(`[chat-agent] - warnings: ${JSON.stringify(result.warnings || [])}`)
          console.error(`[chat-agent] - usage: ${JSON.stringify(result.usage || {})}`)
          // Log raw response se existir
          if (result.response?.body) {
            console.error(`[chat-agent] - raw body available: true`)
          }
          // Log cada step em detalhe
          result.steps?.forEach((step, i) => {
            console.error(`[chat-agent] - Step ${i + 1} details:`, JSON.stringify({
              finishReason: step.finishReason,
              text: step.text?.slice(0, 100),
              toolCalls: step.toolCalls?.length || 0,
              warnings: step.warnings,
            }))
          })
        }

        // Log each step for debugging
        result.steps?.forEach((step, i) => {
          console.log(`[chat-agent] Step ${i + 1}: toolCalls=${step.toolCalls?.map(tc => tc.toolName).join(', ') || 'none'}, text=${step.text?.slice(0, 50) || 'none'}...`)
        })

        // Se LLM retornou texto mas não chamou respond, guarda para retry
        if (!hasResponded && result.text) {
          lastLLMText = result.text
          console.log(`[chat-agent] ⚠️ LLM retornou texto sem chamar respond: "${result.text.slice(0, 100)}..."`)
        }

      } catch (genError) {
        clearTimeout(timeoutId) // Limpa timeout em caso de erro
        const elapsed = Date.now() - startGenerate

        // Detecta se foi timeout
        if (abortController.signal.aborted) {
          console.error(`[chat-agent] ❌ generateText ABORTED (timeout) after ${elapsed}ms`)
          throw new Error(`AI call timed out after ${AI_TIMEOUT_MS / 1000}s`)
        }

        console.error(`[chat-agent] ❌ generateText failed after ${elapsed}ms:`, genError)
        throw genError
      }

      retryCount++
    }

    // Se ainda não respondeu após todos os retries, usa o texto como fallback
    if (!response) {
      if (lastLLMText) {
        // Fallback: usa o texto que o LLM gerou como resposta
        console.log(`[chat-agent] ⚠️ Fallback: usando texto direto do LLM como resposta`)
        response = {
          message: convertMarkdownToWhatsApp(lastLLMText),
          sentiment: 'neutral',
          confidence: 0.3, // Baixa confiança pois não seguiu o formato
          shouldHandoff: false,
          sources: sources,
        }
      } else {
        console.error(`[chat-agent] ⚠️ No response object after ${retryCount} attempts - respond tool was not called`)
        throw new Error('No response generated - LLM did not call respond tool after retries')
      }
    }

    console.log(`[chat-agent] Response generated: "${response.message.slice(0, 100)}..."`)
    if (sources) {
      console.log(`[chat-agent] Used ${sources.length} knowledge base sources`)
    } else {
      console.log(`[chat-agent] No knowledge base search performed`)
    }

  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error'
    console.error('[chat-agent] ❌ Error:', error)
    console.error('[chat-agent] ❌ Full error object:', err)
    console.error('[chat-agent] ❌ Context:', {
      modelId,
      agentId: agent.id,
      agentName: agent.name,
      hasKnowledgeBase,
      messageCount: messages.length,
    })
  }

  const latencyMs = Date.now() - startTime

  // Success case
  if (response) {
    const logId = await persistAILog({
      conversationId: conversation.id,
      agentId: agent.id,
      messageIds,
      input: inputText,
      output: response,
      latencyMs,
      error: null,
      modelUsed: modelId,
    })

    // Save interaction to Mem0 (fire-and-forget, não bloqueia resposta)
    if (mem0Enabled) {
      saveInteractionMemory(
        [
          { role: 'user', content: inputText },
          { role: 'assistant', content: response.message },
        ],
        {
          user_id: conversation.phone,
          agent_id: agent.id,
        }
      ).catch((err) => {
        console.warn(`[chat-agent] Failed to save memory: ${err.message}`)
      })
    }

    return { success: true, response, latencyMs, logId }
  }

  // Error case - auto handoff
  const handoffResponse: SupportResponse = {
    message: 'Desculpe, estou com dificuldades técnicas. Vou transferir você para um atendente.',
    sentiment: 'neutral',
    confidence: 0,
    shouldHandoff: true,
    handoffReason: `Erro técnico: ${error}`,
    handoffSummary: `Erro durante processamento. Última mensagem: "${inputText.slice(0, 200)}"`,
  }

  const logId = await persistAILog({
    conversationId: conversation.id,
    agentId: agent.id,
    messageIds,
    input: inputText,
    output: handoffResponse,
    latencyMs,
    error,
    modelUsed: modelId,
  })

  return {
    success: false,
    response: handoffResponse,
    error: error || 'Unknown error',
    latencyMs,
    logId,
  }
}
