import { FLOW_FORM_PROMPT_TEMPLATE } from './prompts/flow-form'
import { UTILITY_GENERATION_PROMPT_TEMPLATE } from './prompts/utility-generator'
import { UTILITY_JUDGE_PROMPT_TEMPLATE } from './prompts/utility-judge'
import { MARKETING_PROMPT } from './prompts/marketing'
import { UTILITY_PROMPT } from './prompts/utility'
import { BYPASS_PROMPT } from './prompts/bypass'

export type AiRoutesConfig = {
  generateUtilityTemplates: boolean
  generateFlowForm: boolean
}

/** Provider de IA suportado pelo SmartZap. */
export type AiProviderType = 'google'

/**
 * Configuração de provider direto.
 *
 * O SmartZap usa as chaves do próprio usuário, armazenadas no Supabase.
 * Cada cliente paga diretamente ao provider (Google).
 */
export type AiDirectConfig = {
  /** Provider ativo. */
  provider: AiProviderType
  /** Model ID no formato bare, sem prefixo de provider (ex: 'gemini-2.5-flash', 'gpt-5.4'). */
  model: string
  /** Chave API do Google Gemini (lida do Supabase). */
  googleApiKey?: string
}

export type AiPromptsConfig = {
  utilityGenerationTemplate: string
  utilityJudgeTemplate: string
  flowFormTemplate: string
  // Estratégias de geração de templates
  strategyMarketing: string
  strategyUtility: string
  strategyBypass: string
}

export const DEFAULT_AI_ROUTES: AiRoutesConfig = {
  generateUtilityTemplates: true,
  generateFlowForm: true,
}

/** Default: Google Gemini 2.5 Flash. Requer `google_api_key` configurado no Supabase. */
export const DEFAULT_AI_DIRECT: AiDirectConfig = {
  provider: 'google',
  model: 'gemini-2.5-flash',
}

export const DEFAULT_AI_PROMPTS: AiPromptsConfig = {
  utilityGenerationTemplate: UTILITY_GENERATION_PROMPT_TEMPLATE,
  utilityJudgeTemplate: UTILITY_JUDGE_PROMPT_TEMPLATE,
  flowFormTemplate: FLOW_FORM_PROMPT_TEMPLATE,
  // Estratégias de geração de templates
  strategyMarketing: MARKETING_PROMPT,
  strategyUtility: UTILITY_PROMPT,
  strategyBypass: BYPASS_PROMPT,
}
