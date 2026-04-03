import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateBodyOrError } from '@/lib/api-validation'
import { generateJSON } from '@/lib/ai'
import { getAiPromptsConfig } from '@/lib/ai/ai-center-config'
import { MARKETING_PROMPT } from '@/lib/ai/prompts/marketing'
import { UTILITY_PROMPT } from '@/lib/ai/prompts/utility'
import { BYPASS_PROMPT } from '@/lib/ai/prompts/bypass'

// ============================================================================
// ENDPOINT DE TESTE - Gera templates usando diferentes estratégias
// Útil para comparar resultados entre Marketing, Utility e Bypass
// ============================================================================

const TestStrategySchema = z.object({
  prompt: z.string()
    .min(10, 'Descreva melhor o que você precisa (mínimo 10 caracteres)')
    .max(2000, 'Descrição muito longa'),
  strategy: z.enum(['marketing', 'utility', 'bypass']).default('utility'),
  language: z.enum(['pt_BR', 'en_US', 'es_ES']).default('pt_BR'),
})

type Strategy = 'marketing' | 'utility' | 'bypass'

const STRATEGY_CONFIG: Record<Strategy, {
  defaultPrompt: string
  configKey: keyof Awaited<ReturnType<typeof getAiPromptsConfig>>
  category: 'MARKETING' | 'UTILITY'
  emoji: string
}> = {
  marketing: {
    defaultPrompt: MARKETING_PROMPT,
    configKey: 'strategyMarketing',
    category: 'MARKETING',
    emoji: '📢'
  },
  utility: {
    defaultPrompt: UTILITY_PROMPT,
    configKey: 'strategyUtility',
    category: 'UTILITY',
    emoji: '📋'
  },
  bypass: {
    defaultPrompt: BYPASS_PROMPT,
    configKey: 'strategyBypass',
    category: 'UTILITY', // Bypass tenta passar como UTILITY
    emoji: '🛡️'
  }
}

const languageMap: Record<string, string> = {
  pt_BR: 'português brasileiro',
  en_US: 'inglês americano',
  es_ES: 'espanhol'
}

interface GeneratedTemplate {
  name: string
  content: string
  header?: { format: string; text?: string }
  footer?: { text: string }
  buttons?: Array<{ type: string; text: string; url?: string }>
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('[TEST_STRATEGY] Received:', JSON.stringify(body, null, 2))

    const validation = validateBodyOrError(TestStrategySchema, body)
    if (!validation.success) return validation.response

    const { prompt: userPrompt, strategy, language } = validation.data
    const config = STRATEGY_CONFIG[strategy]
    const langName = languageMap[language] || 'português brasileiro'

    // Buscar prompt customizado do AI Center ou usar default
    let strategyPrompt = config.defaultPrompt
    try {
      const promptsConfig = await getAiPromptsConfig()
      const customPrompt = promptsConfig[config.configKey]
      if (customPrompt && typeof customPrompt === 'string' && customPrompt.trim()) {
        strategyPrompt = customPrompt
      }
    } catch {
      console.log('[TEST_STRATEGY] Using default prompt for', strategy)
    }

    // Detectar URLs no prompt
    const urlRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:\/[^\s]*)?)/gi
    const detectedUrls = userPrompt.match(urlRegex) || []
    const primaryUrl = detectedUrls[0]
      ? (detectedUrls[0].startsWith('http') ? detectedUrls[0] : `https://${detectedUrls[0]}`)
      : 'https://example.com'

    // Construir prompt final
    const fullPrompt = `${strategyPrompt}

---

${userPrompt}

Gere 1 template de WhatsApp no formato JSON:
{
  "name": "nome_snake_case",
  "content": "Texto do body da mensagem com {{1}} para nome",
  "header": { "format": "TEXT", "text": "Título opcional" },
  "footer": { "text": "Footer opcional" },
  "buttons": [{ "type": "URL", "text": "Texto do botão", "url": "${primaryUrl}" }]
}

Idioma: ${langName}
Retorne APENAS o JSON, sem markdown.`

    console.log(`[TEST_STRATEGY] ${config.emoji} Generating with strategy: ${strategy.toUpperCase()}`)

    const template = await generateJSON<GeneratedTemplate>({
      prompt: fullPrompt
    })

    // Normalizar resposta
    const normalizedTemplate: GeneratedTemplate = {
      name: String(template.name || `${strategy}_template`).toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      content: String(template.content || ''),
      header: template.header?.text ? {
        format: 'TEXT',
        text: String(template.header.text).substring(0, 60)
      } : undefined,
      footer: template.footer?.text ? {
        text: String(template.footer.text).substring(0, 60)
      } : undefined,
      buttons: Array.isArray(template.buttons) ? template.buttons.slice(0, 3).map(b => ({
        type: 'URL' as const,
        text: String(b.text || 'Ver Detalhes').substring(0, 25),
        url: String(b.url || primaryUrl)
      })) : undefined
    }

    return NextResponse.json({
      strategy,
      category: config.category,
      emoji: config.emoji,
      template: normalizedTemplate,
      metadata: {
        promptUsed: strategy,
        language,
        detectedUrl: primaryUrl
      }
    })

  } catch (error) {
    console.error('[TEST_STRATEGY] Error:', error)
    return NextResponse.json(
      { error: 'Falha ao gerar template', details: error instanceof Error ? error.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}
