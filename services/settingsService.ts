import type { AiFallbackConfig, AiPromptsConfig, AiRoutesConfig } from '../lib/ai/ai-center-defaults';
import { api } from '@/lib/api';
import { storage } from '../lib/storage';
import { AppSettings, CalendarBookingConfig, WorkflowExecutionConfig } from '../types';

// =============================================================================
// OCR CONFIGURATION TYPES
// =============================================================================

export type OCRProviderType = 'gemini' | 'mistral'

export interface OCRConfig {
  provider: OCRProviderType
  geminiModel: string
  mistralStatus: {
    isConfigured: boolean
    source: 'database' | 'env' | 'none'
    tokenPreview: string | null
  }
}

// =============================================================================
// CONSOLIDATED SETTINGS - Fetch all independent settings in one request
// =============================================================================

export interface AllSettingsResponse {
  credentials: {
    source: 'db' | 'env_fallback' | 'db_error' | 'none'
    phoneNumberId?: string
    businessAccountId?: string
    displayPhoneNumber?: string
    verifiedName?: string
    hasToken?: boolean
    isConnected: boolean
    warning?: string
  }
  ai: {
    provider: string
    model: string
    providers: Record<string, { isConfigured: boolean; source: string; tokenPreview: string | null }>
    isConfigured: boolean
    source: string
    tokenPreview: string | null
    routes: any
    fallback: any
    prompts: any
  }
  metaApp: {
    source: 'db' | 'env' | 'none'
    appId: string | null
    hasAppSecret: boolean
    isConfigured: boolean
  }
  testContact: { name?: string; phone: string } | null
  domains: {
    domains: Array<{ value: string; label: string; isPrimary: boolean }>
    webhookPath: string
    currentSelection: string | null
  }
  calendarBooking: { ok: boolean; source: 'db' | 'default'; config: CalendarBookingConfig }
  workflowExecution: { ok: boolean; source: 'db' | 'env'; config: WorkflowExecutionConfig }
  upstashConfig: { configured: boolean; email: string; hasApiKey: boolean }
  timestamp: string
}

export const settingsService = {
  /**
   * Get ALL independent settings in a single request
   * Reduces 8+ API calls to 1 for Settings page
   */
  getAll: (): Promise<AllSettingsResponse> =>
    api.get<AllSettingsResponse>('/api/settings/all', { cache: 'no-store' }),

  /**
   * Get settings - combines local storage (UI state) with server credentials
   */
  get: async (): Promise<AppSettings> => {
    // 1. Get local settings (UI state like testContact)
    const localSettings = storage.settings.get();

    // 2. Get server credentials
    try {
      const response = await fetch('/api/settings/credentials');
      if (response.ok) {
        const serverData = await response.json();
        if (serverData.isConnected) {
          return {
            ...localSettings,
            phoneNumberId: serverData.phoneNumberId,
            businessAccountId: serverData.businessAccountId,
            displayPhoneNumber: serverData.displayPhoneNumber,
            verifiedName: serverData.verifiedName,
            isConnected: true,
            // Don't expose full token to frontend
            accessToken: serverData.hasToken ? '***configured***' : '',
          };
        }
      }
    } catch (error) {
      console.error('Error fetching server credentials:', error);
    }

    return localSettings;
  },

  // =============================================================================
  // WORKFLOW BUILDER DEFAULT
  // =============================================================================

  getWorkflowBuilderDefault: (): Promise<{ defaultWorkflowId: string }> =>
    api.get<{ defaultWorkflowId: string }>('/api/settings/workflow-builder'),

  saveWorkflowBuilderDefault: (defaultWorkflowId: string): Promise<void> =>
    api.post<void>('/api/settings/workflow-builder', { defaultWorkflowId }),

  // =============================================================================
  // WORKFLOW EXECUTION SETTINGS
  // =============================================================================

  getWorkflowExecutionConfig: (): Promise<{
    ok: boolean;
    source: 'db' | 'env';
    config: WorkflowExecutionConfig;
  }> => api.get('/api/settings/workflow-execution', { cache: 'no-store' }),

  saveWorkflowExecutionConfig: async (data: Partial<WorkflowExecutionConfig>): Promise<WorkflowExecutionConfig> => {
    const response = await fetch('/api/settings/workflow-execution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((json as any)?.error || 'Failed to save workflow execution config')
    }
    return (json as any)?.config as WorkflowExecutionConfig
  },

  // =============================================================================
  // META APP (opcional) — debug_token e diagnóstico avançado
  // =============================================================================

  getMetaAppConfig: (): Promise<{
    source: 'db' | 'env' | 'none'
    appId: string | null
    hasAppSecret: boolean
    isConfigured: boolean
  }> => api.get('/api/settings/meta-app', { cache: 'no-store' }),

  saveMetaAppConfig: (data: { appId: string; appSecret: string }): Promise<void> =>
    api.post<void>('/api/settings/meta-app', data),

  removeMetaAppConfig: (): Promise<void> =>
    api.del('/api/settings/meta-app'),

  /**
   * Save settings - credentials go to server, UI state stays local
   */
  save: async (settings: AppSettings): Promise<AppSettings> => {
    // 1. Save UI state locally (testContact, etc.)
    const uiSettings = {
      ...settings,
      // Don't save credentials locally
      accessToken: '',
    };
    storage.settings.save(uiSettings);

    // 2. If we have real credentials, save to server
    if (settings.accessToken && settings.accessToken !== '***configured***') {
      try {
        const response = await fetch('/api/settings/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumberId: settings.phoneNumberId,
            businessAccountId: settings.businessAccountId,
            accessToken: settings.accessToken,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to save credentials');
        }

        const result = await response.json();
        return {
          ...settings,
          displayPhoneNumber: result.displayPhoneNumber,
          verifiedName: result.verifiedName,
          isConnected: true,
        };
      } catch (error) {
        console.error('Error saving credentials to server:', error);
        throw error;
      }
    }

    return settings;
  },

  /**
   * Disconnect - remove credentials from server
   */
  disconnect: async (): Promise<void> => {
    try {
      await fetch('/api/settings/credentials', { method: 'DELETE' });
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  },

  /**
   * Fetch phone details from Meta API
   */
  fetchPhoneDetails: (credentials: { phoneNumberId: string, accessToken: string }) =>
    api.post<{ display_phone_number?: string; quality_rating?: string; verified_name?: string; [key: string]: unknown }>('/api/settings/phone-number', credentials),

  /**
   * Get system health status
   */
  getHealth: () => api.get('/api/health'),

  // =============================================================================
  // TEST CONNECTION (sem salvar)
  // =============================================================================

  /**
   * Testa conexão com a Meta Graph API.
   * - Se o token vier mascarado (ex: '***configured***'), o backend usa credenciais salvas.
   * - Não persiste nada; apenas valida.
   */
  testConnection: async (data?: {
    phoneNumberId?: string
    businessAccountId?: string
    accessToken?: string
  }): Promise<{
    ok: boolean
    error?: string
    code?: number
    errorSubcode?: number
    details?: any
    phoneNumberId?: string
    businessAccountId?: string | null
    displayPhoneNumber?: string | null
    verifiedName?: string | null
    qualityRating?: string | null
    wabaId?: string | null
    usedStoredCredentials?: boolean
  }> => {
    const response = await fetch('/api/settings/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {}),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const msg = (payload as any)?.error || 'Falha ao testar conexão'
      const err: any = new Error(msg)
      err.details = payload
      throw err
    }

    return payload
  },

  /**
   * Get AI settings
   */
  getAIConfig: () => api.get('/api/settings/ai'),

  /**
   * Save AI settings (including OCR configuration)
   */
  saveAIConfig: (data: {
    provider?: string;
    model?: string;
    routes?: AiRoutesConfig;
    prompts?: AiPromptsConfig;
    fallback?: AiFallbackConfig;
    // OCR fields
    ocr_provider?: OCRProviderType;
    ocr_gemini_model?: string;
    mistral_api_key?: string;
  }) => api.post('/api/settings/ai', data),

  /**
   * Remove API key for a specific provider (including mistral for OCR)
   */
  removeAIKey: async (provider: 'mistral') => {
    const response = await fetch(`/api/settings/ai?provider=${provider}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove AI key');
    }

    return response.json();
  },

  // =============================================================================
  // TEST CONTACT - Persisted in Supabase
  // =============================================================================

  /**
   * Get test contact from Supabase
   */
  getTestContact: (): Promise<{ name?: string; phone: string } | null> =>
    api.safeGet<{ name?: string; phone: string } | null>('/api/settings/test-contact', null),

  /**
   * Save test contact to Supabase
   */
  saveTestContact: (contact: { name?: string; phone: string }): Promise<void> =>
    api.post<void>('/api/settings/test-contact', contact),

  /**
   * Remove test contact from Supabase
   */
  removeTestContact: (): Promise<void> =>
    api.del('/api/settings/test-contact'),

  // =============================================================================
  // WHATSAPP TURBO (Adaptive Throttle) - Persisted in Supabase settings
  // =============================================================================

  getWhatsAppThrottle: (): Promise<any> =>
    api.get('/api/settings/whatsapp-throttle'),

  saveWhatsAppThrottle: (data: {
    enabled?: boolean
    sendConcurrency?: number
    batchSize?: number
    startMps?: number
    maxMps?: number
    minMps?: number
    cooldownSec?: number
    minIncreaseGapSec?: number
    sendFloorDelayMs?: number
    resetState?: boolean
  }): Promise<any> => api.post('/api/settings/whatsapp-throttle', data),

  // =============================================================================
  // AUTO-SUPPRESSÃO (Proteção de Qualidade) - Persisted in Supabase settings
  // =============================================================================

  getAutoSuppression: (): Promise<any> =>
    api.get('/api/settings/auto-suppression'),

  saveAutoSuppression: (data: any): Promise<any> =>
    api.post('/api/settings/auto-suppression', data),

  // =============================================================================
  // CALENDAR BOOKING CONFIG (Google Calendar)
  // =============================================================================

  getCalendarBookingConfig: (): Promise<{
    ok: boolean;
    source: 'db' | 'default';
    config: CalendarBookingConfig;
  }> => api.get('/api/settings/calendar-booking', { cache: 'no-store' }),

  saveCalendarBookingConfig: (data: Partial<CalendarBookingConfig>): Promise<void> =>
    api.post<void>('/api/settings/calendar-booking', data),

  // =============================================================================
  // UPSTASH CONFIG (Métricas de uso do QStash)
  // =============================================================================

  getUpstashConfig: (): Promise<{
    configured: boolean;
    email: string;
    hasApiKey: boolean;
  }> => api.get('/api/settings/upstash', { cache: 'no-store' }),

  saveUpstashConfig: (data: { email: string; apiKey: string }): Promise<void> =>
    api.post<void>('/api/settings/upstash', data),

  removeUpstashConfig: (): Promise<void> =>
    api.del('/api/settings/upstash'),
};
