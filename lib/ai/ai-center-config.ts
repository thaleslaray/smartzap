import { supabase } from '@/lib/supabase'
import {
  DEFAULT_AI_DIRECT,
  DEFAULT_AI_PROMPTS,
  DEFAULT_AI_ROUTES,
  type AiDirectConfig,
  type AiProviderType,
  type AiPromptsConfig,
  type AiRoutesConfig,
} from './ai-center-defaults'

const SETTINGS_KEYS = {
  routes: 'ai_routes',
  direct: 'ai_direct',
  prompts: 'ai_prompts',
  googleApiKey: 'google_api_key',
  // Chaves individuais para prompts de estratégia (fonte única de verdade: banco)
  strategyMarketing: 'strategyMarketing',
  strategyUtility: 'strategyUtility',
  strategyBypass: 'strategyBypass',
} as const

const CACHE_TTL = 60000
let cacheTime = 0
let cachedRoutes: AiRoutesConfig | null = null
let cachedDirect: AiDirectConfig | null = null
let cachedPrompts: AiPromptsConfig | null = null

function parseJsonSetting<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function normalizeRoutes(input?: Partial<AiRoutesConfig> | null): AiRoutesConfig {
  const next = { ...DEFAULT_AI_ROUTES, ...(input || {}) }
  return {
    generateUtilityTemplates: !!next.generateUtilityTemplates,
    generateFlowForm: !!next.generateFlowForm,
  }
}

function normalizeDirect(
  input?: Partial<Pick<AiDirectConfig, 'provider' | 'model'>> | null,
  googleApiKey?: string | null,
): AiDirectConfig {
  // Sempre usa google — único provider suportado
  const provider: AiProviderType = DEFAULT_AI_DIRECT.provider

  const model =
    typeof input?.model === 'string' && input.model.trim()
      ? input.model.trim()
      : DEFAULT_AI_DIRECT.model

  return {
    provider,
    model,
    ...(googleApiKey ? { googleApiKey } : {}),
  }
}

// Normaliza prompts gerais (usa defaults do código como fallback)
function normalizeBasePrompts(input?: Partial<AiPromptsConfig> | null): Omit<AiPromptsConfig, 'strategyMarketing' | 'strategyUtility' | 'strategyBypass'> {
  const next = { ...DEFAULT_AI_PROMPTS, ...(input || {}) }
  return {
    utilityGenerationTemplate: next.utilityGenerationTemplate || DEFAULT_AI_PROMPTS.utilityGenerationTemplate,
    utilityJudgeTemplate: next.utilityJudgeTemplate || DEFAULT_AI_PROMPTS.utilityJudgeTemplate,
    flowFormTemplate: next.flowFormTemplate || DEFAULT_AI_PROMPTS.flowFormTemplate,
  }
}

// Normaliza prompts de estratégia (banco tem prioridade, código é fallback)
function normalizeStrategyPrompts(strategies: {
  marketing: string | null
  utility: string | null
  bypass: string | null
}): Pick<AiPromptsConfig, 'strategyMarketing' | 'strategyUtility' | 'strategyBypass'> {
  return {
    strategyMarketing: strategies.marketing || DEFAULT_AI_PROMPTS.strategyMarketing,
    strategyUtility: strategies.utility || DEFAULT_AI_PROMPTS.strategyUtility,
    strategyBypass: strategies.bypass || DEFAULT_AI_PROMPTS.strategyBypass,
  }
}

// Função de compatibilidade para preparar updates
function normalizePrompts(input?: Partial<AiPromptsConfig> | null): AiPromptsConfig {
  const next = { ...DEFAULT_AI_PROMPTS, ...(input || {}) }
  return {
    utilityGenerationTemplate: next.utilityGenerationTemplate || DEFAULT_AI_PROMPTS.utilityGenerationTemplate,
    utilityJudgeTemplate: next.utilityJudgeTemplate || DEFAULT_AI_PROMPTS.utilityJudgeTemplate,
    flowFormTemplate: next.flowFormTemplate || DEFAULT_AI_PROMPTS.flowFormTemplate,
    strategyMarketing: next.strategyMarketing || '',
    strategyUtility: next.strategyUtility || '',
    strategyBypass: next.strategyBypass || '',
  }
}

async function getSettingValue(key: string): Promise<string | null> {
  const { data, error } = await supabase.admin
    ?.from('settings')
    .select('value')
    .eq('key', key)
    .single() || { data: null, error: null }

  if (error || !data) return null
  return data.value
}

function isCacheValid(): boolean {
  return Date.now() - cacheTime < CACHE_TTL
}

export async function getAiRoutesConfig(): Promise<AiRoutesConfig> {
  if (cachedRoutes && isCacheValid()) return cachedRoutes
  const raw = await getSettingValue(SETTINGS_KEYS.routes)
  const parsed = parseJsonSetting<Partial<AiRoutesConfig>>(raw, DEFAULT_AI_ROUTES)
  cachedRoutes = normalizeRoutes(parsed)
  cacheTime = Date.now()
  return cachedRoutes
}

/**
 * Retorna a configuração de provider direto, incluindo as chaves de API do Supabase.
 * As chaves não são expostas na UI — apenas presença é verificada.
 */
export async function getAiDirectConfig(): Promise<AiDirectConfig> {
  if (cachedDirect && isCacheValid()) return cachedDirect

  const [rawDirect, googleApiKey, geminiApiKeyLegacy] = await Promise.all([
    getSettingValue(SETTINGS_KEYS.direct),
    getSettingValue(SETTINGS_KEYS.googleApiKey),
    getSettingValue('gemini_api_key'), // retrocompatibilidade: chave pode estar salva com nome antigo
  ])

  const parsed = parseJsonSetting<Partial<Pick<AiDirectConfig, 'provider' | 'model'>>>(rawDirect, {})
  cachedDirect = normalizeDirect(parsed, googleApiKey || geminiApiKeyLegacy)
  cacheTime = Date.now()
  return cachedDirect
}

export async function getAiPromptsConfig(): Promise<AiPromptsConfig> {
  if (cachedPrompts && isCacheValid()) return cachedPrompts

  const rawBase = await getSettingValue(SETTINGS_KEYS.prompts)
  const parsedBase = parseJsonSetting<Partial<AiPromptsConfig>>(rawBase, {})
  const basePrompts = normalizeBasePrompts(parsedBase)

  const [marketing, utility, bypass] = await Promise.all([
    getSettingValue(SETTINGS_KEYS.strategyMarketing),
    getSettingValue(SETTINGS_KEYS.strategyUtility),
    getSettingValue(SETTINGS_KEYS.strategyBypass),
  ])
  const strategyPrompts = normalizeStrategyPrompts({ marketing, utility, bypass })

  cachedPrompts = { ...basePrompts, ...strategyPrompts }
  cacheTime = Date.now()
  return cachedPrompts
}

export async function isAiRouteEnabled(routeKey: keyof AiRoutesConfig): Promise<boolean> {
  const routes = await getAiRoutesConfig()
  return routes[routeKey]
}

export function prepareAiRoutesUpdate(input?: Partial<AiRoutesConfig> | null): AiRoutesConfig {
  return normalizeRoutes(input)
}

export function prepareAiDirectUpdate(input?: Partial<Pick<AiDirectConfig, 'provider' | 'model'>> | null): Pick<AiDirectConfig, 'provider' | 'model'> {
  return normalizeDirect(input)
}

export function prepareAiPromptsUpdate(input?: Partial<AiPromptsConfig> | null): AiPromptsConfig {
  return normalizePrompts(input)
}

export function clearAiCenterCache() {
  cacheTime = 0
  cachedRoutes = null
  cachedDirect = null
  cachedPrompts = null
}
