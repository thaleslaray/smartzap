'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AI_PROVIDERS, type AIProvider } from '@/lib/ai/providers'
import { useDevMode } from '@/components/providers/DevModeProvider'
import { DEFAULT_MODEL_ID } from '@/lib/ai/model'
import {
  DEFAULT_AI_FALLBACK,
  DEFAULT_AI_PROMPTS,
  DEFAULT_AI_ROUTES,
  type AiFallbackConfig,
  type AiPromptsConfig,
  type AiRoutesConfig,
} from '@/lib/ai/ai-center-defaults'
import { settingsService, type OCRConfig, type OCRProviderType } from '@/services/settingsService'
import { toast } from 'sonner'

type ProviderStatus = {
  isConfigured: boolean
  source: 'database' | 'env' | 'none'
  tokenPreview?: string | null
}

type AIConfigResponse = {
  provider: AIProvider
  model: string
  providers: {
    google: ProviderStatus
    openai: ProviderStatus
    anthropic: ProviderStatus
  }
  routes: AiRoutesConfig
  prompts: AiPromptsConfig
  fallback: AiFallbackConfig
  ocr?: OCRConfig
}

const DEFAULT_OCR_CONFIG: OCRConfig = {
  provider: 'gemini',
  geminiModel: 'gemini-3-flash-preview',
  mistralStatus: {
    isConfigured: false,
    source: 'none',
    tokenPreview: null,
  },
}

const EMPTY_PROVIDER_STATUS: ProviderStatus = {
  isConfigured: false,
  source: 'none',
  tokenPreview: null,
}

const getProviderConfig = (providerId: AIProvider) =>
  AI_PROVIDERS.find((provider) => provider.id === providerId)

const getProviderLabel = (providerId: AIProvider) =>
  getProviderConfig(providerId)?.name ?? providerId

const getDefaultModelId = (providerId: AIProvider) => {
  // Para Google, usa a constante DEFAULT_MODEL_ID (Flash)
  // Para outros providers, usa o primeiro modelo da lista
  if (providerId === 'google') {
    return DEFAULT_MODEL_ID
  }
  return getProviderConfig(providerId)?.models[0]?.id ?? ''
}

const getModelLabel = (providerId: AIProvider, modelId: string) => {
  const provider = getProviderConfig(providerId)
  return provider?.models.find((model) => model.id === modelId)?.name ?? modelId
}

const getSafeProvider = (provider?: string): AIProvider =>
  getProviderConfig(provider as AIProvider)?.id ?? 'google'

const getModelOptions = (providerId: AIProvider, currentModelId: string) => {
  const provider = getProviderConfig(providerId)
  const models = provider?.models ?? []
  if (currentModelId && !models.some((model) => model.id === currentModelId)) {
    return [...models, { id: currentModelId, name: currentModelId }]
  }
  return models
}

const normalizeProviderOrder = (order: AIProvider[]) => {
  const uniqueOrder = Array.from(new Set(order))
  const missing = AI_PROVIDERS.map((provider) => provider.id).filter(
    (provider) => !uniqueOrder.includes(provider)
  )
  return [...uniqueOrder, ...missing]
}

export const useSettingsAIController = () => {
  const { isDevMode } = useDevMode()

  const [providerStatuses, setProviderStatuses] = useState<AIConfigResponse['providers']>({
    google: EMPTY_PROVIDER_STATUS,
    openai: EMPTY_PROVIDER_STATUS,
    anthropic: EMPTY_PROVIDER_STATUS,
  })
  const [provider, setProvider] = useState<AIProvider>('google')
  const [model, setModel] = useState(() => getDefaultModelId('google'))
  const [routes, setRoutes] = useState<AiRoutesConfig>(DEFAULT_AI_ROUTES)
  const [prompts, setPrompts] = useState<AiPromptsConfig>(DEFAULT_AI_PROMPTS)
  const [fallback, setFallback] = useState<AiFallbackConfig>(DEFAULT_AI_FALLBACK)
  const [inlineKeyProvider, setInlineKeyProvider] = useState<AIProvider | null>(null)
  const [apiKeyDrafts, setApiKeyDrafts] = useState<Record<AIProvider, string>>({
    google: '',
    openai: '',
    anthropic: '',
  })
  const [isSavingKey, setIsSavingKey] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // OCR State
  const [ocrConfig, setOcrConfig] = useState<OCRConfig>(DEFAULT_OCR_CONFIG)
  const [mistralKeyDraft, setMistralKeyDraft] = useState('')
  const [isSavingOcr, setIsSavingOcr] = useState(false)
  const [showMistralKeyInput, setShowMistralKeyInput] = useState(false)

  // Collapsible sections
  const [isStrategiesOpen, setIsStrategiesOpen] = useState(false)

  const orderedProviders = useMemo(() => {
    const allProviders = normalizeProviderOrder(fallback.order)
    // Só mostra OpenAI e Anthropic no modo desenvolvedor
    if (!isDevMode) {
      return allProviders.filter(p => p === 'google')
    }
    return allProviders
  }, [fallback.order, isDevMode])
  const configuredProvidersCount = useMemo(() => {
    return Object.values(providerStatuses).filter(s => s.isConfigured).length
  }, [providerStatuses])
  const hasAnyKey = configuredProvidersCount > 0
  const hasSecondaryKey = useMemo(() => {
    return Object.entries(providerStatuses).some(([providerId, status]) => {
      return providerId !== provider && status.isConfigured
    })
  }, [providerStatuses, provider])
  const primaryProviderLabel = useMemo(() => getProviderLabel(provider), [provider])
  const primaryModelLabel = useMemo(
    () => (model ? getModelLabel(provider, model) : '—'),
    [provider, model]
  )
  const primaryProviderStatus = providerStatuses[provider] ?? EMPTY_PROVIDER_STATUS
  const primaryProviderConfigured = primaryProviderStatus.isConfigured

  const fallbackSummary = useMemo(() => {
    if (!fallback.enabled || orderedProviders.length === 0) {
      return 'Desativado'
    }
    return orderedProviders.map((item) => getProviderLabel(item)).join(' -> ')
  }, [fallback.enabled, orderedProviders])

  const primaryModelOptions = useMemo(
    () => getModelOptions(provider, model),
    [provider, model]
  )

  const loadConfig = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const data = (await settingsService.getAIConfig()) as AIConfigResponse
      const nextProvider = getSafeProvider(data.provider)
      const nextModel = data.model?.trim() ? data.model : getDefaultModelId(nextProvider)
      const fallbackFromApi = data.fallback ?? DEFAULT_AI_FALLBACK
      const allowedProviders = AI_PROVIDERS.map((item) => item.id)
      const fallbackOrder = Array.isArray(fallbackFromApi.order)
        ? fallbackFromApi.order.filter((item) => allowedProviders.includes(item))
        : []
      const normalizedFallbackOrder = normalizeProviderOrder(
        fallbackOrder.length > 0 ? fallbackOrder : DEFAULT_AI_FALLBACK.order
      )
      const fallbackModels = {
        ...DEFAULT_AI_FALLBACK.models,
        ...(fallbackFromApi.models || {}),
      }

      setProvider(nextProvider)
      setModel(nextModel)
      setRoutes({ ...DEFAULT_AI_ROUTES, ...(data.routes ?? {}) })
      setPrompts({ ...DEFAULT_AI_PROMPTS, ...(data.prompts ?? {}) })
      setFallback({
        ...DEFAULT_AI_FALLBACK,
        ...fallbackFromApi,
        order: normalizedFallbackOrder,
        models: fallbackModels,
      })
      setProviderStatuses({
        google: data.providers?.google ?? EMPTY_PROVIDER_STATUS,
        openai: data.providers?.openai ?? EMPTY_PROVIDER_STATUS,
        anthropic: data.providers?.anthropic ?? EMPTY_PROVIDER_STATUS,
      })

      // Load OCR configuration
      if (data.ocr) {
        setOcrConfig(data.ocr)
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro ao carregar configuracoes de IA'
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  useEffect(() => {
    if (!hasSecondaryKey && fallback.enabled) {
      setFallback((current) => ({ ...current, enabled: false }))
    }
  }, [hasSecondaryKey, fallback.enabled])

  const handleProviderSelect = (nextProvider: AIProvider) => {
    setProvider(nextProvider)
    // Usa o modelo já configurado no fallback (se existir) ou o padrão
    const savedModel = fallback.models?.[nextProvider]
    const nextModel = savedModel || getDefaultModelId(nextProvider)
    setModel(nextModel)
    setFallback((current) => {
      const currentOrder = normalizeProviderOrder(current.order)
      return {
        ...current,
        order: [nextProvider, ...currentOrder.filter((item) => item !== nextProvider)],
      }
    })
  }

  const handleFallbackMove = (target: AIProvider, direction: -1 | 1) => {
    setFallback((current) => {
      const currentOrder = normalizeProviderOrder(current.order)
      const index = currentOrder.indexOf(target)
      if (index < 0) return current
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= currentOrder.length) return current
      const nextOrder = [...currentOrder]
      ;[nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[index]]
      return { ...current, order: nextOrder }
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    setErrorMessage(null)
    try {
      await settingsService.saveAIConfig({
        provider,
        model,
        routes,
        prompts,
        fallback,
      })
      toast.success('Configuracoes salvas')
      await loadConfig()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro ao salvar configuracoes'
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveKey = async (targetProvider: AIProvider) => {
    const apiKey = apiKeyDrafts[targetProvider].trim()
    if (!apiKey) {
      toast.error('Informe a chave de API')
      return
    }
    setIsSavingKey(true)
    try {
      await settingsService.saveAIConfig({
        apiKey,
        apiKeyProvider: targetProvider,
      })
      setApiKeyDrafts((current) => ({ ...current, [targetProvider]: '' }))
      setInlineKeyProvider(null)
      toast.success('Chave atualizada')
      await loadConfig()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar chave'
      toast.error(message)
    } finally {
      setIsSavingKey(false)
    }
  }

  // OCR Handlers
  const handleOcrProviderChange = async (newProvider: OCRProviderType) => {
    setIsSavingOcr(true)
    try {
      await settingsService.saveAIConfig({ ocr_provider: newProvider })
      setOcrConfig((current) => ({ ...current, provider: newProvider }))
      toast.success('Provider de OCR atualizado')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar provider OCR'
      toast.error(message)
    } finally {
      setIsSavingOcr(false)
    }
  }

  const handleOcrGeminiModelChange = async (newModel: string) => {
    setIsSavingOcr(true)
    try {
      await settingsService.saveAIConfig({ ocr_gemini_model: newModel })
      setOcrConfig((current) => ({ ...current, geminiModel: newModel }))
      toast.success('Modelo OCR atualizado')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar modelo OCR'
      toast.error(message)
    } finally {
      setIsSavingOcr(false)
    }
  }

  const handleSaveMistralKey = async () => {
    const apiKey = mistralKeyDraft.trim()
    if (!apiKey) {
      toast.error('Informe a chave de API do Mistral')
      return
    }
    setIsSavingOcr(true)
    try {
      await settingsService.saveAIConfig({ mistral_api_key: apiKey })
      setMistralKeyDraft('')
      setShowMistralKeyInput(false)
      toast.success('Chave Mistral salva')
      await loadConfig()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar chave Mistral'
      toast.error(message)
    } finally {
      setIsSavingOcr(false)
    }
  }

  const handleRemoveMistralKey = async () => {
    setIsSavingOcr(true)
    try {
      await settingsService.removeAIKey('mistral')
      toast.success('Chave Mistral removida')
      await loadConfig()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao remover chave Mistral'
      toast.error(message)
    } finally {
      setIsSavingOcr(false)
    }
  }

  const handleModelChange = (nextModel: string) => {
    setModel(nextModel)
    setFallback((current) => ({
      ...current,
      models: {
        ...current.models,
        [provider]: nextModel,
      },
    }))
  }

  const handleFallbackToggle = (next: boolean) => {
    setFallback((current) => ({ ...current, enabled: next }))
  }

  const handleInlineKeyToggle = (providerId: AIProvider) => {
    setInlineKeyProvider((current) => (current === providerId ? null : providerId))
  }

  const handleApiKeyDraftChange = (providerId: AIProvider, value: string) => {
    setApiKeyDrafts((current) => ({
      ...current,
      [providerId]: value,
    }))
  }

  const handlePromptChange = (key: keyof AiPromptsConfig, value: string) => {
    setPrompts((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const handleRouteToggle = (key: keyof AiRoutesConfig, next: boolean) => {
    setRoutes((current) => ({
      ...current,
      [key]: next,
    }))
  }

  const handleMistralKeyInputToggle = () => {
    setShowMistralKeyInput((prev) => !prev)
  }

  const handleStrategiesToggle = () => {
    setIsStrategiesOpen((prev) => !prev)
  }

  return {
    // Dev mode
    isDevMode,

    // Provider state
    provider,
    model,
    providerStatuses,
    orderedProviders,
    configuredProvidersCount,
    hasAnyKey,
    hasSecondaryKey,
    primaryProviderLabel,
    primaryModelLabel,
    primaryProviderStatus,
    primaryProviderConfigured,
    primaryModelOptions,
    inlineKeyProvider,
    apiKeyDrafts,

    // Fallback
    fallback,
    fallbackSummary,

    // Routes & Prompts
    routes,
    prompts,

    // Loading & Saving
    isLoading,
    isSaving,
    isSavingKey,
    errorMessage,

    // OCR
    ocrConfig,
    mistralKeyDraft,
    isSavingOcr,
    showMistralKeyInput,

    // Collapsible sections
    isStrategiesOpen,

    // Handlers
    handleSave,
    handleProviderSelect,
    handleFallbackMove,
    handleFallbackToggle,
    handleModelChange,
    handleInlineKeyToggle,
    handleApiKeyDraftChange,
    handleSaveKey,
    handleOcrProviderChange,
    handleOcrGeminiModelChange,
    handleSaveMistralKey,
    handleRemoveMistralKey,
    handleMistralKeyInputToggle,
    handlePromptChange,
    handleRouteToggle,
    handleStrategiesToggle,
    setMistralKeyDraft,

    // Utility functions (exposed for view)
    getProviderConfig,
    getModelLabel,
  }
}

// Re-export types needed by the view
export type { ProviderStatus }
