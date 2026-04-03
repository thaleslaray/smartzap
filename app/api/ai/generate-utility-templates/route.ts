import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateBodyOrError } from '@/lib/api-validation'
import { generateText, generateJSON } from '@/lib/ai'
import { judgeTemplates } from '@/lib/ai/services/ai-judge'
import { buildUtilityGenerationPrompt } from '@/lib/ai/prompts/utility-generator'
import { supabase } from '@/lib/supabase'
import { getAiPromptsConfig, isAiRouteEnabled } from '@/lib/ai/ai-center-config'

// ============================================================================
// PROMPT ÚNICO - Gera templates UTILITY
// ============================================================================

// Schema de entrada
export const GenerateUtilityTemplatesSchema = z.object({
  prompt: z.string()
    .min(10, 'Descreva melhor o que você precisa (mínimo 10 caracteres)')
    .max(2000, 'Descrição muito longa'),
  quantity: z.number().int().min(1).max(20).default(5),
  language: z.enum(['pt_BR', 'en_US', 'es_ES']).default('pt_BR'),
  strategy: z.enum(['marketing', 'utility', 'bypass']).default('bypass'),
})

const languageMap: Record<string, string> = {
  pt_BR: 'português brasileiro',
  en_US: 'inglês americano',
  es_ES: 'espanhol'
}

// ============================================================================
// TIPO PARA TEMPLATE GERADO
// ============================================================================

interface GeneratedTemplate {
  id: string
  name: string
  content: string
  header?: { format: string; text?: string }
  footer?: { text: string }
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>
  language: string
  status: string
  category: 'MARKETING' | 'UTILITY' // Definido pela strategy selecionada
  // Variáveis genéricas (usado em MARKETING/UTILITY)
  variables?: Record<string, string>
  // Variáveis comportadas para enviar à Meta na criação (usado em BYPASS)
  sample_variables?: Record<string, string>
  // Variáveis agressivas de marketing para envio real (usado em BYPASS)
  marketing_variables?: Record<string, string>
  // AI Judge fields
  judgment?: {
    approved: boolean
    predictedCategory: 'UTILITY' | 'MARKETING'
    confidence: number
    issues: Array<{ word: string; reason: string; suggestion: string }>
  }
  wasFixed?: boolean
  originalContent?: string
}

// ============================================================================
// FUNÇÃO DE NORMALIZAÇÃO DEFINITIVA
// Garante que todos os campos estejam no formato esperado pelo schema
// ============================================================================

// ============================================================================
// SANITIZAÇÃO PARA REGRAS DA META
// Corrige automaticamente templates que violam regras conhecidas
// ============================================================================

/**
 * Normaliza variáveis para serem sequenciais
 * Problema: AI às vezes gera {{1}}, {{5}}, {{6}} em vez de {{1}}, {{2}}, {{3}}
 * Solução: Renumera todas as variáveis para serem sequenciais
 */
function normalizeVariablesToSequential(
  content: string,
  headerText: string | null,
  sampleVars: Record<string, string> | undefined,
  marketingVars: Record<string, string> | undefined
): {
  content: string
  headerText: string | null
  sample_variables: Record<string, string> | undefined
  marketing_variables: Record<string, string> | undefined
} {
  // 1. Encontra todas as variáveis usadas no template
  const allText = [content, headerText || ''].join(' ')
  const varPattern = /\{\{(\d+)\}\}/g
  const usedVars = new Set<number>()
  let match
  while ((match = varPattern.exec(allText)) !== null) {
    usedVars.add(parseInt(match[1]))
  }

  // Se não há variáveis ou já são sequenciais, retorna original
  const sortedVars = Array.from(usedVars).sort((a, b) => a - b)
  const isSequential = sortedVars.every((v, i) => v === i + 1)

  if (sortedVars.length === 0 || isSequential) {
    return { content, headerText, sample_variables: sampleVars, marketing_variables: marketingVars }
  }

  // 2. Cria mapeamento: variável original -> nova posição sequencial
  const varMapping: Record<number, number> = {}
  sortedVars.forEach((oldVar, index) => {
    varMapping[oldVar] = index + 1
  })

  // 3. Substitui variáveis no content e header
  const replaceVars = (text: string) => {
    return text.replace(/\{\{(\d+)\}\}/g, (_, num) => {
      const newNum = varMapping[parseInt(num)] || num
      return `{{${newNum}}}`
    })
  }

  const normalizedContent = replaceVars(content)
  const normalizedHeader = headerText ? replaceVars(headerText) : null

  // 4. Reorganiza sample_variables e marketing_variables
  const remapVars = (vars: Record<string, string> | undefined): Record<string, string> | undefined => {
    if (!vars) return undefined
    const newVars: Record<string, string> = {}
    for (const [oldKey, newKey] of Object.entries(varMapping)) {
      if (vars[oldKey]) {
        newVars[String(newKey)] = vars[oldKey]
      }
    }
    return Object.keys(newVars).length > 0 ? newVars : undefined
  }

  return {
    content: normalizedContent,
    headerText: normalizedHeader,
    sample_variables: remapVars(sampleVars),
    marketing_variables: remapVars(marketingVars)
  }
}

function sanitizeContentForMeta(content: string): string {
  let sanitized = content.trim()

  // Regra 1: NUNCA começar com variável
  // Ex: "{{1}}, seu pedido..." -> "Olá {{1}}, seu pedido..."
  if (/^{{\d+}}/.test(sanitized)) {
    sanitized = 'Olá ' + sanitized
  }

  // Regra 2: NUNCA terminar com variável
  // Ex: "...para {{2}}" -> "...para {{2}}."
  if (/{{\d+}}$/.test(sanitized)) {
    sanitized = sanitized + '.'
  }

  // Regra 3: Garantir proporção mínima texto/variáveis
  // Se houver muitas variáveis, adicionar mais texto
  const variableCount = (sanitized.match(/{{\d+}}/g) || []).length
  const wordCount = sanitized.replace(/{{\d+}}/g, '').split(/\s+/).filter(w => w.length > 0).length

  // Meta exige ~3-4 palavras por variável mínimo
  if (variableCount > 0 && wordCount / variableCount < 3) {
    // Adicionar contexto extra
    if (!sanitized.includes('Informamos')) {
      sanitized = 'Informamos que ' + sanitized.charAt(0).toLowerCase() + sanitized.slice(1)
    }
    if (!sanitized.includes('detalhes')) {
      sanitized = sanitized.replace(/\.$/, '. Para mais detalhes, acesse sua conta.')
    }
  }

  return sanitized
}

function normalizeTemplate(
  rawTemplate: Record<string, unknown>,
  index: number,
  language: string,
  primaryUrl: string | null,
  strategy: 'marketing' | 'utility' | 'bypass'
): GeneratedTemplate {
  // Mapear strategy para categoria Meta
  // marketing -> MARKETING
  // utility/bypass -> UTILITY (bypass usa UTILITY para passar pelo filtro)
  const category: 'MARKETING' | 'UTILITY' = strategy === 'marketing' ? 'MARKETING' : 'UTILITY'
  // Name: snake_case, apenas letras minúsculas, números e underscore
  let name = String(rawTemplate.name || `template_${index + 1}`)
  name = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 512)

  // Content: string obrigatória + sanitização
  const rawContent = String(rawTemplate.content || rawTemplate.body || '')
  const content = sanitizeContentForMeta(rawContent)

  // Header: { format: string, text?: string } ou undefined
  let header: GeneratedTemplate['header'] = undefined
  if (rawTemplate.header && typeof rawTemplate.header === 'object') {
    const h = rawTemplate.header as Record<string, unknown>
    let headerText = h.text ? String(h.text).substring(0, 60) : undefined
    // Sanitizar header também
    if (headerText) {
      if (/^{{\d+}}/.test(headerText)) {
        headerText = 'Atualização: ' + headerText
      }
      if (/{{\d+}}$/.test(headerText)) {
        headerText = headerText + ' ⚡'
      }
      header = {
        format: String(h.format || 'TEXT'),
        text: headerText
      }
    }
  }

  // Footer: { text: string } ou undefined (NUNCA { text: undefined })
  let footer: GeneratedTemplate['footer'] = undefined
  if (rawTemplate.footer && typeof rawTemplate.footer === 'object') {
    const f = rawTemplate.footer as Record<string, unknown>
    const footerText = f.text ? String(f.text).substring(0, 60) : undefined
    if (footerText) {
      footer = { text: footerText }
    }
  }

  // Buttons: array de { type: 'URL', text: string, url: string }
  let buttons: GeneratedTemplate['buttons'] = undefined
  if (Array.isArray(rawTemplate.buttons) && rawTemplate.buttons.length > 0) {
    const validButtons = rawTemplate.buttons
      .filter((b): b is Record<string, unknown> => b && typeof b === 'object')
      .map(b => {
        const btnUrl = b.url ? String(b.url) : primaryUrl
        const btnText = b.text ? String(b.text).substring(0, 25) : 'Ver Detalhes'
        return {
          type: 'URL' as const,
          text: btnText,
          url: btnUrl || 'https://example.com'
        }
      })
      .filter(b => b.url) // Apenas botões com URL válida
      .slice(0, 10) // Max 10 botões

    if (validButtons.length > 0) {
      buttons = validButtons
    }
  }

  // Variables: valores de exemplo para preview (usado em MARKETING/UTILITY)
  let variables: GeneratedTemplate['variables'] = undefined
  if (rawTemplate.variables && typeof rawTemplate.variables === 'object') {
    const vars = rawTemplate.variables as Record<string, unknown>
    variables = {}
    for (const [key, value] of Object.entries(vars)) {
      if (typeof value === 'string') {
        variables[key] = value
      }
    }
    if (Object.keys(variables).length === 0) {
      variables = undefined
    }
  }

  // Sample Variables: valores comportados para enviar à Meta (usado em BYPASS)
  let sample_variables: GeneratedTemplate['sample_variables'] = undefined
  if (rawTemplate.sample_variables && typeof rawTemplate.sample_variables === 'object') {
    const vars = rawTemplate.sample_variables as Record<string, unknown>
    sample_variables = {}
    for (const [key, value] of Object.entries(vars)) {
      if (typeof value === 'string') {
        sample_variables[key] = value
      }
    }
    if (Object.keys(sample_variables).length === 0) {
      sample_variables = undefined
    }
  }

  // Marketing Variables: valores agressivos para envio real (usado em BYPASS)
  let marketing_variables: GeneratedTemplate['marketing_variables'] = undefined
  if (rawTemplate.marketing_variables && typeof rawTemplate.marketing_variables === 'object') {
    const vars = rawTemplate.marketing_variables as Record<string, unknown>
    marketing_variables = {}
    for (const [key, value] of Object.entries(vars)) {
      if (typeof value === 'string') {
        marketing_variables[key] = value
      }
    }
    if (Object.keys(marketing_variables).length === 0) {
      marketing_variables = undefined
    }
  }

  // === PASSO FINAL: Normalizar variáveis para serem sequenciais ===
  // AI às vezes gera {{1}}, {{5}}, {{6}} em vez de {{1}}, {{2}}, {{3}}
  // Isso causa rejeição pela Meta - variáveis devem ser sequenciais
  const normalized = normalizeVariablesToSequential(
    content,
    header?.text || null,
    sample_variables,
    marketing_variables
  )

  return {
    id: `generated_${Date.now()}_${index}`,
    name,
    content: normalized.content,
    header: normalized.headerText && header
      ? { ...header, text: normalized.headerText }
      : header,
    footer,
    buttons,
    language,
    status: 'DRAFT',
    category,
    variables,
    sample_variables: normalized.sample_variables,
    marketing_variables: normalized.marketing_variables
  }
}

// ============================================================================
// LEGACY GENERATION FUNCTION (fallback quando Agent não disponível)
// ============================================================================

async function generateWithUnifiedPrompt(
  userPrompt: string,
  quantity: number,
  language: string,
  primaryUrl: string | null,
  promptTemplate: string,
  strategy: 'marketing' | 'utility' | 'bypass'
): Promise<GeneratedTemplate[]> {
  const utilityPrompt = buildUtilityGenerationPrompt({
    prompt: userPrompt,
    quantity,
    language: languageMap[language] || 'português brasileiro',
    primaryUrl,
    template: promptTemplate,
  })

  const rawTemplates = await generateJSON<Array<Record<string, unknown>>>(
    { prompt: utilityPrompt }
  )

  if (!Array.isArray(rawTemplates)) throw new Error('Response is not an array')

  return rawTemplates.map((t, index) => normalizeTemplate(t, index, language, primaryUrl, strategy))
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const routeEnabled = await isAiRouteEnabled('generateUtilityTemplates')
    if (!routeEnabled) {
      return NextResponse.json(
        { error: 'Rota desativada nas configurações de IA.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    console.log('[API ROUTE] Received Body:', JSON.stringify(body, null, 2));

    const validation = validateBodyOrError(GenerateUtilityTemplatesSchema, body)
    if (!validation.success) return validation.response

    const { prompt: userPrompt, quantity, language, strategy } = validation.data

    // Get API key from settings for both Agent and Judge
    let apiKey: string | null = null
    try {
      const settingsResult = await supabase.admin
        ?.from('settings')
        .select('value')
        .eq('key', 'gemini_api_key')
        .single()
      apiKey = settingsResult?.data?.value || process.env.GOOGLE_GENERATIVE_AI_API_KEY || null
    } catch {
      apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || null
    }

    // Detectar URLs no prompt
    const urlRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:\/[^\s]*)?)/gi
    const detectedUrls = userPrompt.match(urlRegex) || []
    const primaryUrl = detectedUrls[0]
      ? (detectedUrls[0].startsWith('http') ? detectedUrls[0] : `https://${detectedUrls[0]}`)
      : null

    const promptsConfig = await getAiPromptsConfig()
    let templates: GeneratedTemplate[]

    // Seleciona o prompt correto baseado na estratégia
    const strategyPromptMap: Record<typeof strategy, string> = {
      marketing: promptsConfig.strategyMarketing,
      utility: promptsConfig.strategyUtility,
      bypass: promptsConfig.strategyBypass,
    }
    const selectedPrompt = strategyPromptMap[strategy] || promptsConfig.utilityGenerationTemplate

    console.log(`[GENERATE] Using strategy "${strategy}" prompt (${selectedPrompt.length} chars)`)
    templates = await generateWithUnifiedPrompt(
      userPrompt,
      quantity,
      language,
      primaryUrl,
      selectedPrompt,
      strategy
    )

    // ========================================================================
    // AI JUDGE - Validar cada template
    // APENAS para UTILITY - verifica se parece neutro/transacional
    // ========================================================================
    let validatedTemplates = templates

    // BYPASS e MARKETING NÃO passam pelo AI Judge:
    // - MARKETING: DEVE ter linguagem promocional direta
    // - BYPASS: USA palavras emocionais no texto fixo ("exclusivo", "especial", "reservado")
    //           Essas palavras são INTENCIONAIS - fazem o bypass funcionar
    // Apenas UTILITY precisa validação de neutralidade
    const shouldRunJudge = strategy === 'utility'

    try {
      if (apiKey && shouldRunJudge) {
        console.log(`[AI_JUDGE] Validating templates... (strategy: ${strategy})`)

        const judgments = await judgeTemplates(
          templates.map(t => ({
            name: t.name,
            header: t.header?.text || null,
            body: t.content
          })),
          { apiKey }
        )

        // Confidence thresholds
        const HIGH_CONFIDENCE = 0.80  // Templates pass directly
        const MIN_CONFIDENCE = 0.70   // Templates need retry below this
        const MAX_RETRIES = 3         // Maximum retry attempts per template

        // Process templates with retry logic for low confidence
        const processedTemplates: typeof templates = []

        for (let i = 0; i < templates.length; i++) {
          const template = templates[i]
          const judgment = judgments[i]

          let currentContent = template.content
          let currentHeader = template.header?.text || null
          let currentJudgment = judgment
          let retryCount = 0

          // Retry loop for low confidence templates
          while (currentJudgment.confidence < MIN_CONFIDENCE && retryCount < MAX_RETRIES) {
            retryCount++
            console.log(`[AI_JUDGE] 🔄 RETRY ${retryCount}/${MAX_RETRIES}: ${template.name} (${Math.round(currentJudgment.confidence * 100)}% too low)`)

            // Use the fixed version if available for retry
            if (currentJudgment.fixedBody) {
              currentContent = currentJudgment.fixedBody
            }
            if (currentJudgment.fixedHeader) {
              currentHeader = currentJudgment.fixedHeader
            }

            // Re-judge the fixed version
            const [retryJudgment] = await judgeTemplates(
              [{ name: template.name, header: currentHeader, body: currentContent }],
              { apiKey }
            )
            currentJudgment = retryJudgment
          }

          // Final decision based on confidence
          const finalConfidence = currentJudgment.confidence
          const isApproved = currentJudgment.approved && finalConfidence >= HIGH_CONFIDENCE
          const isAcceptable = finalConfidence >= MIN_CONFIDENCE && (currentJudgment.approved || currentJudgment.fixedBody)

          if (isApproved) {
            console.log(`[AI_JUDGE] ✅ APPROVED: ${template.name} (${Math.round(finalConfidence * 100)}%)`)
            processedTemplates.push({
              ...template,
              content: currentContent,
              header: currentHeader && template.header ? { ...template.header, text: currentHeader } : template.header,
              judgment: {
                approved: true,
                predictedCategory: currentJudgment.predictedCategory,
                confidence: finalConfidence,
                issues: currentJudgment.issues
              },
              wasFixed: currentContent !== template.content
            })
          } else if (isAcceptable && currentJudgment.fixedBody) {
            console.log(`[AI_JUDGE] 🔧 FIXED: ${template.name} (${Math.round(finalConfidence * 100)}%)`)
            processedTemplates.push({
              ...template,
              content: currentJudgment.fixedBody,
              originalContent: template.content,
              header: currentJudgment.fixedHeader && template.header
                ? { ...template.header, text: currentJudgment.fixedHeader }
                : template.header,
              judgment: {
                approved: false,
                predictedCategory: currentJudgment.predictedCategory,
                confidence: finalConfidence,
                issues: currentJudgment.issues
              },
              wasFixed: true
            })
          } else {
            console.log(`[AI_JUDGE] ⛔ FILTERED: ${template.name} (${Math.round(finalConfidence * 100)}% after ${retryCount} retries)`)
            // Don't add to processedTemplates - filtered out
          }
        }

        validatedTemplates = processedTemplates

        const approved = validatedTemplates.filter(t => t.judgment?.approved).length
        const fixed = validatedTemplates.filter(t => t.wasFixed && !t.judgment?.approved).length
        const filtered = templates.length - validatedTemplates.length
        console.log(`[AI_JUDGE] Final: ${validatedTemplates.length}/${templates.length} templates (${approved} approved, ${fixed} fixed, ${filtered} filtered out)`)
      } else if (!shouldRunJudge) {
        console.log(`[AI_JUDGE] Skipped - strategy "${strategy}" doesn't need UTILITY validation`)
      } else {
        console.log('[AI_JUDGE] Skipped - no API key available')
      }
    } catch (judgeError) {
      console.error('[AI_JUDGE] Validation failed:', judgeError instanceof Error ? judgeError.message : judgeError)
      console.error('[AI_JUDGE] Full error:', judgeError)
      // Continue without validation if it fails
    }

    // ========================================================================
    // GENERATE BATCH TITLE (com timeout de 5s para não travar)
    // ========================================================================
    let batchTitle = 'Submissão em Lote'
    try {
      const titlePromise = generateText({
        prompt: `Resuma em NO MÁXIMO 4 palavras (sem pontuação) o tema: "${userPrompt.substring(0, 200)}". Retorne APENAS as palavras.`,
      })

      // Timeout de 5 segundos - se demorar mais, usa fallback
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Title generation timeout')), 5000)
      )

      const titleResult = await Promise.race([titlePromise, timeoutPromise])
      batchTitle = titleResult.text.trim()
        .replace(/["""''\.]/g, '')
        .substring(0, 40) || 'Submissão em Lote'
    } catch (titleError) {
      console.log('[GENERATE] Title generation failed/timeout, using fallback:', titleError instanceof Error ? titleError.message : 'unknown')
      // Fallback: extrai primeiras palavras do prompt
      const words = userPrompt.split(/\s+/).slice(0, 4).join(' ')
      batchTitle = words.length > 30 ? words.substring(0, 30) + '...' : words
    }

    return NextResponse.json({
      templates: validatedTemplates,
      metadata: {
        prompt: userPrompt,
        quantity: validatedTemplates.length,
        language,
        suggestedTitle: batchTitle,
        aiJudge: {
          enabled: validatedTemplates.some(t => t.judgment),
          approved: validatedTemplates.filter(t => t.judgment?.approved).length,
          fixed: validatedTemplates.filter(t => t.wasFixed).length,
          rejected: validatedTemplates.filter(t => t.judgment && !t.judgment.approved && !t.wasFixed).length
        }
      }
    })

  } catch (error) {
    console.error('AI Error:', error)
    return NextResponse.json(
      { error: 'Falha ao gerar templates com IA' },
      { status: 500 }
    )
  }
}
