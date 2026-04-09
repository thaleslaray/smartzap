'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AIProvider } from '@/lib/ai/providers'
import { useDevMode } from '@/components/providers/DevModeProvider'
import { DEFAULT_MODEL_ID } from '@/lib/ai/model'
import {
  DEFAULT_AI_PROMPTS,
  DEFAULT_AI_ROUTES,
  type AiPromptsConfig,
  type AiRoutesConfig,
  type AiProviderType,
} from '@/lib/ai/ai-center-defaults'
import { settingsService, type OCRConfig } from '@/services/settingsService'
import type { AIModelInfo } from '@/app/api/ai/models/route'
import { toast } from 'sonner'

// =============================================================================
// TIPOS
// =============================================================================

type KeyStatus = 'unknown' | 'valid' | 'invalid' | 'saving'

type KeyState = {
  isConfigured: boolean
  tokenPreview: string | null
  status: KeyStatus
}

type AIConfigResponse = {
  provider: AiProviderType
  model: string
  routes: AiRoutesConfig
  prompts: AiPromptsConfig
  keys: {
    google: { isConfigured: boolean; source: string; tokenPreview: string | null }
  }
  ocr?: OCRConfig
}

const DEFAULT_KEY_STATE: KeyState = {
  isConfigured: false,
  tokenPreview: null,
  status: 'unknown',
}

const DEFAULT_OCR_CONFIG: OCRConfig = {
  provider: 'gemini',
  geminiModel: 'gemini-2.5-flash',
}

// =============================================================================
// CONTROLLER HOOK
// =============================================================================

export const useSettingsAIController = () => {
  const { isDevMode } = useDevMode()

  const [provider, setProvider] = useState<AiProviderType>('google')
  const [model, setModel] = useState(DEFAULT_MODEL_ID)
  const [routes, setRoutes] = useState<AiRoutesConfig>(DEFAULT_AI_ROUTES)
  const [prompts, setPrompts] = useState<AiPromptsConfig>(DEFAULT_AI_PROMPTS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // API keys
  const [googleKey, setGoogleKey] = useState<KeyState>(DEFAULT_KEY_STATE)
  const [googleKeyDraft, setGoogleKeyDraft] = useState('')

  // Modelos dinâmicos do provider
  const [models, setModels] = useState<AIModelInfo[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)

  // OCR State
  const [ocrConfig, setOcrConfig] = useState<OCRConfig>(DEFAULT_OCR_CONFIG)
  const [isSavingOcr, setIsSavingOcr] = useState(false)

  // Collapsible sections
  const [isStrategiesOpen, setIsStrategiesOpen] = useState(false)

  // =============================================================================
  // LOAD CONFIG
  // =============================================================================

  const loadConfig = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const data = (await settingsService.getAIConfig()) as AIConfigResponse
      // Único provider suportado: google
      const nextProvider: AiProviderType = 'google'
      const nextModel = data.model?.trim() ? data.model : DEFAULT_MODEL_ID

      setProvider(nextProvider)
      setModel(nextModel)
      setRoutes({ ...DEFAULT_AI_ROUTES, ...(data.routes ?? {}) })
      setPrompts({ ...DEFAULT_AI_PROMPTS, ...(data.prompts ?? {}) })

      setGoogleKey({
        isConfigured: data.keys?.google?.isConfigured ?? false,
        tokenPreview: data.keys?.google?.tokenPreview ?? null,
        status: 'unknown',
      })

      if (data.ocr) setOcrConfig(data.ocr)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro ao carregar configurações de IA'
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  // =============================================================================
  // FETCH MODELS (lazy — apenas quando painel expande)
  // =============================================================================

  const fetchModels = useCallback(
    async (targetProvider: AiProviderType) => {
      setModelsLoading(true)
      try {
        const res = await fetch(`/api/ai/models?provider=${targetProvider}`)
        if (res.ok) {
          const data = await res.json()
          setModels(data.models ?? [])
        }
      } catch {
        // silencioso — usa lista vazia
      } finally {
        setModelsLoading(false)
      }
    },
    []
  )

  // =============================================================================
  // HANDLERS — chaves de API
  // =============================================================================

  const handleSaveGoogleKey = async () => {
    const apiKey = googleKeyDraft.trim()
    if (!apiKey) {
      toast.error('Informe a chave do Google')
      return
    }
    setGoogleKey((k) => ({ ...k, status: 'saving' }))
    try {
      await settingsService.saveAIConfig({ google_api_key: apiKey })
      setGoogleKeyDraft('')
      toast.success('Chave Google salva')
      await loadConfig()
      // Recarrega modelos com a nova chave
      void fetchModels('google')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar chave Google'
      setGoogleKey((k) => ({ ...k, status: 'invalid' }))
      toast.error(message)
    }
  }

  const handleRemoveKey = async () => {
    try {
      await settingsService.removeAIKey('google')
      toast.success('Chave Google removida')
      setModels([])
      await loadConfig()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao remover chave'
      toast.error(message)
    }
  }

  // =============================================================================
  // HANDLERS — model / config
  // =============================================================================

  const handleModelChange = (nextModel: string) => {
    setModel(nextModel)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setErrorMessage(null)
    try {
      await settingsService.saveAIConfig({ model, routes, prompts })
      toast.success('Configurações salvas')
      await loadConfig()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro ao salvar configurações'
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  // OCR Handlers
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

  const handlePromptChange = (key: keyof AiPromptsConfig, value: string) => {
    setPrompts((current) => ({ ...current, [key]: value }))
  }

  const handleRouteToggle = (key: keyof AiRoutesConfig, next: boolean) => {
    setRoutes((current) => ({ ...current, [key]: next }))
  }

  const handleStrategiesToggle = () => {
    setIsStrategiesOpen((prev) => !prev)
  }

  // =============================================================================
  // RETURN
  // =============================================================================

  return {
    // Dev mode
    isDevMode,

    // Provider + model
    provider,
    model,
    models,
    modelsLoading,

    // API keys
    googleKey,
    googleKeyDraft,

    // Routes & Prompts
    routes,
    prompts,

    // Loading & Saving
    isLoading,
    isSaving,
    errorMessage,

    // OCR
    ocrConfig,
    isSavingOcr,

    // Collapsible
    isStrategiesOpen,

    // Handlers
    handleSave,
    handleModelChange,
    handleSaveGoogleKey,
    handleRemoveKey,
    fetchModels,
    handleOcrGeminiModelChange,
    handlePromptChange,
    handleRouteToggle,
    handleStrategiesToggle,
    setGoogleKeyDraft,
  }
}

// Tipo AIProvider é mantido para retrocompatibilidade com imports existentes
export type { AIProvider }
