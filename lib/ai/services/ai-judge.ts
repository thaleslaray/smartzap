import { generateText, Output } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { JudgmentSchema, type Judgment } from '../schemas/template-schemas'
import { buildUtilityJudgePrompt } from '../prompts/utility-judge'
import { getAiDirectConfig, getAiPromptsConfig } from '../ai-center-config'
import { DEFAULT_MODEL_ID } from '../model'

// ============================================================================
// AI JUDGE SERVICE
// Usa LLM para analisar se template será aprovado como UTILITY pela Meta
// Usa Google Gemini com chave do banco
// ============================================================================

export interface JudgeOptions {
    apiKey?: string
    model?: string
}

/**
 * Analisa um template usando IA para prever se será aprovado como UTILITY
 */
export async function judgeTemplate(
    template: { name?: string; header: string | null; body: string },
    options: JudgeOptions,
    promptTemplate?: string
): Promise<Judgment> {
    const config = await getAiDirectConfig()
    const targetModelId = options.model || config.model || DEFAULT_MODEL_ID

    if (!config.googleApiKey) throw new Error('Chave Google não configurada. Acesse Configurações → IA.')
    const google = createGoogleGenerativeAI({ apiKey: config.googleApiKey })
    const model = google(targetModelId)

    console.log(`[AI_JUDGE] Using model: ${targetModelId} (provider: ${config.provider})`)

    const prompt = buildUtilityJudgePrompt(template.header, template.body, promptTemplate)
    const templateName = template.name || 'unknown'

    console.log(`[AI_JUDGE] Analyzing: ${templateName}`)

    const { output: judgment } = await generateText({
        model,
        output: Output.object({ schema: JudgmentSchema }),
        prompt,
    })

    const status = judgment.approved ? '✅ APPROVED' : '❌ REJECTED'
    console.log(`[AI_JUDGE] ${templateName}: ${status} as ${judgment.predictedCategory} (${Math.round(judgment.confidence * 100)}%)`)

    if (judgment.issues.length > 0) {
        console.log(`[AI_JUDGE] ${templateName} issues: ${judgment.issues.map(i => i.word).join(', ')}`)
    }

    if (judgment.fixedBody) {
        console.log(`[AI_JUDGE] ${templateName}: Fixed body provided`)
    }

    return judgment
}

/**
 * Analisa múltiplos templates em paralelo
 */
export async function judgeTemplates(
    templates: Array<{ name?: string; header: string | null; body: string }>,
    options: JudgeOptions
): Promise<Judgment[]> {
    console.log(`[AI_JUDGE] Analyzing ${templates.length} templates...`)

    const promptsConfig = await getAiPromptsConfig()

    const judgments = await Promise.all(
        templates.map(t => judgeTemplate(t, options, promptsConfig.utilityJudgeTemplate))
    )

    const approved = judgments.filter(j => j.approved).length
    const fixed = judgments.filter(j => j.fixedBody).length
    const rejected = judgments.filter(j => !j.approved && !j.fixedBody).length

    console.log(`[AI_JUDGE] Summary: ${approved} approved, ${fixed} fixed, ${rejected} rejected (total: ${templates.length})`)

    return judgments
}
