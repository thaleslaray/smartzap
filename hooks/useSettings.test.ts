import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHookWithProviders, waitFor, act } from '@/tests/helpers/hook-test-utils'

// Mock Supabase Realtime
vi.mock('@/lib/supabase-realtime', () => ({
  createRealtimeChannel: vi.fn(),
  subscribeToTable: vi.fn(),
  activateChannel: vi.fn(),
  removeChannel: vi.fn(),
}))

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    message: vi.fn(),
  },
}))

// Mock business/settings
vi.mock('@/lib/business/settings', () => ({
  DEFAULT_WEBHOOK_PATH: '/api/webhook',
}))

// Mock account-health
const mockCheckAccountHealth = vi.fn()
const mockQuickHealthCheck = vi.fn()
const mockGetHealthSummary = vi.fn()

vi.mock('@/lib/account-health', () => ({
  checkAccountHealth: (...args: unknown[]) => mockCheckAccountHealth(...args),
  quickHealthCheck: (...args: unknown[]) => mockQuickHealthCheck(...args),
  getHealthSummary: (...args: unknown[]) => mockGetHealthSummary(...args),
}))

// Mock useAccountLimits
const mockRefreshLimits = vi.fn()

vi.mock('@/hooks/useAccountLimits', () => ({
  useAccountLimits: () => ({
    limits: null,
    refreshLimits: mockRefreshLimits,
    tierName: 'Tier 250',
    isError: false,
    errorMessage: null,
    isLoading: false,
    hasLimits: false,
  }),
}))

// Mock settingsService
const mockGetAll = vi.fn()
const mockSave = vi.fn()
const mockSaveAIConfig = vi.fn()
const mockRemoveAIKey = vi.fn()
const mockSaveTestContact = vi.fn()
const mockRemoveTestContact = vi.fn()
const mockTestConnection = vi.fn()
const mockFetchPhoneDetails = vi.fn()
const mockGetWhatsAppThrottle = vi.fn()
const mockSaveWhatsAppThrottle = vi.fn()
const mockGetAutoSuppression = vi.fn()
const mockSaveAutoSuppression = vi.fn()
const mockSaveCalendarBookingConfig = vi.fn()
const mockSaveWorkflowExecutionConfig = vi.fn()
const mockSaveUpstashConfig = vi.fn()
const mockRemoveUpstashConfig = vi.fn()

vi.mock('@/services/settingsService', () => ({
  settingsService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    save: (...args: unknown[]) => mockSave(...args),
    saveAIConfig: (...args: unknown[]) => mockSaveAIConfig(...args),
    removeAIKey: (...args: unknown[]) => mockRemoveAIKey(...args),
    saveTestContact: (...args: unknown[]) => mockSaveTestContact(...args),
    removeTestContact: (...args: unknown[]) => mockRemoveTestContact(...args),
    testConnection: (...args: unknown[]) => mockTestConnection(...args),
    fetchPhoneDetails: (...args: unknown[]) => mockFetchPhoneDetails(...args),
    getWhatsAppThrottle: (...args: unknown[]) => mockGetWhatsAppThrottle(...args),
    saveWhatsAppThrottle: (...args: unknown[]) => mockSaveWhatsAppThrottle(...args),
    getAutoSuppression: (...args: unknown[]) => mockGetAutoSuppression(...args),
    saveAutoSuppression: (...args: unknown[]) => mockSaveAutoSuppression(...args),
    saveCalendarBookingConfig: (...args: unknown[]) => mockSaveCalendarBookingConfig(...args),
    saveWorkflowExecutionConfig: (...args: unknown[]) => mockSaveWorkflowExecutionConfig(...args),
    saveUpstashConfig: (...args: unknown[]) => mockSaveUpstashConfig(...args),
    removeUpstashConfig: (...args: unknown[]) => mockRemoveUpstashConfig(...args),
  },
}))

import { useSettingsController } from './useSettings'

// =============================================================================
// FIXTURES
// =============================================================================

const mockAllSettings = {
  credentials: {
    source: 'db' as const,
    phoneNumberId: '123456789',
    businessAccountId: '987654321',
    displayPhoneNumber: '+55 11 99999-9999',
    verifiedName: 'SmartZap Testes',
    hasToken: true,
    isConnected: true,
  },
  ai: {
    provider: 'google',
    model: 'gemini-2.0-flash',
    providers: { google: { isConfigured: true, source: 'db', tokenPreview: 'AIza***' } },
    isConfigured: true,
    source: 'db',
    tokenPreview: 'AIza***',
    routes: {},
    fallback: {},
    prompts: {},
  },
  metaApp: {
    source: 'db' as const,
    appId: 'app-123',
    hasAppSecret: true,
    isConfigured: true,
  },
  testContact: { name: 'Contato Teste', phone: '+5511988887777' },
  domains: {
    domains: [
      { value: 'https://smartzap.app', label: 'Production', isPrimary: true },
      { value: 'https://smartzap.vercel.app', label: 'Vercel', isPrimary: false },
    ],
    webhookPath: '/api/webhook',
    currentSelection: 'https://smartzap.app',
  },
  calendarBooking: {
    ok: true,
    source: 'db' as const,
    config: { timezone: 'America/Sao_Paulo', slotDurationMinutes: 30, slotBufferMinutes: 10, workingHours: [] },
  },
  workflowExecution: {
    ok: true,
    source: 'db' as const,
    config: { retryCount: 3, retryDelayMs: 1000, timeoutMs: 30000 },
  },
  upstashConfig: { configured: true, email: 'user@test.com', hasApiKey: true },
  timestamp: '2026-02-08T12:00:00Z',
}

const mockThrottleConfig = {
  enabled: true,
  sendConcurrency: 5,
  batchSize: 50,
  startMps: 10,
  maxMps: 80,
  minMps: 1,
}

const mockAutoSuppressionConfig = {
  enabled: true,
  threshold: 5,
  windowHours: 24,
  suppressionDays: 7,
}

const mockWebhookInfo = {
  webhookUrl: 'https://smartzap.app/api/webhook',
  webhookToken: 'token-xyz',
  stats: { lastEventAt: '2026-02-08T11:00:00Z', todayDelivered: 100, todayRead: 50, todayFailed: 2 },
}

const mockSystemHealth = {
  health: {
    overall: 'healthy',
    services: {
      database: { status: 'ok', provider: 'supabase', latency: 12 },
      qstash: { status: 'ok' },
      whatsapp: { status: 'ok', source: 'db', phoneNumber: '+5511999999999' },
    },
  },
  vercel: { dashboardUrl: null, storesUrl: null, env: 'production' },
  timestamp: '2026-02-08T12:00:00Z',
}

// Helper: cria um mock fetch baseado em URL
function createFetchMock(overrides?: Record<string, unknown>) {
  return vi.fn().mockImplementation((url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url

    // Resposta padrão
    const defaultResponse = (data: unknown) => ({
      ok: true,
      json: () => Promise.resolve(data),
    })

    if (urlStr === '/api/webhook/info') {
      return Promise.resolve(defaultResponse(overrides?.webhookInfo ?? mockWebhookInfo))
    }
    if (urlStr === '/api/meta/webhooks/subscription') {
      const method = init?.method || 'GET'
      if (method === 'POST') {
        return Promise.resolve(defaultResponse(overrides?.subscriptionPost ?? { ok: true }))
      }
      if (method === 'DELETE') {
        return Promise.resolve(defaultResponse(overrides?.subscriptionDelete ?? { ok: true }))
      }
      return Promise.resolve(defaultResponse(overrides?.subscription ?? { ok: true, messagesSubscribed: true }))
    }
    if (urlStr === '/api/phone-numbers') {
      return Promise.resolve(defaultResponse(overrides?.phoneNumbers ?? []))
    }
    if (urlStr === '/api/system') {
      return Promise.resolve(defaultResponse(overrides?.system ?? mockSystemHealth))
    }
    if (urlStr === '/api/settings/credentials' && init?.method === 'DELETE') {
      return Promise.resolve(defaultResponse(overrides?.disconnectResponse ?? {}))
    }
    if (urlStr.includes('/webhook/override')) {
      return Promise.resolve(defaultResponse(overrides?.webhookOverride ?? { ok: true }))
    }

    // Fallback genérico
    return Promise.resolve(defaultResponse({}))
  })
}

// =============================================================================
// TESTES
// =============================================================================

describe('useSettingsController', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()

    // Salva fetch original e substitui por mock
    originalFetch = globalThis.fetch
    globalThis.fetch = createFetchMock()

    // Configura service mocks
    mockGetAll.mockResolvedValue(mockAllSettings)
    mockGetWhatsAppThrottle.mockResolvedValue(mockThrottleConfig)
    mockGetAutoSuppression.mockResolvedValue(mockAutoSuppressionConfig)
    mockSave.mockResolvedValue(mockAllSettings.credentials)
    mockSaveAIConfig.mockResolvedValue({})
    mockRemoveAIKey.mockResolvedValue({})
    mockSaveTestContact.mockResolvedValue(undefined)
    mockRemoveTestContact.mockResolvedValue(undefined)
    mockSaveWhatsAppThrottle.mockResolvedValue({})
    mockSaveAutoSuppression.mockResolvedValue({})
    mockSaveCalendarBookingConfig.mockResolvedValue(undefined)
    mockSaveWorkflowExecutionConfig.mockResolvedValue({})
    mockSaveUpstashConfig.mockResolvedValue(undefined)
    mockRemoveUpstashConfig.mockResolvedValue(undefined)
    mockTestConnection.mockResolvedValue({
      ok: true,
      phoneNumberId: '123',
      displayPhoneNumber: '+5511999999999',
      verifiedName: 'SmartZap',
    })
    mockFetchPhoneDetails.mockResolvedValue({
      display_phone_number: '+55 11 99999-9999',
      quality_rating: 'GREEN',
      verified_name: 'SmartZap',
    })

    // Health check mocks
    mockCheckAccountHealth.mockResolvedValue({
      isHealthy: true,
      status: 'healthy',
      checks: [],
      lastChecked: new Date(),
    })
    mockGetHealthSummary.mockReturnValue({
      title: 'Conta saudável',
      description: 'Tudo funcionando',
    })
    mockQuickHealthCheck.mockResolvedValue({ canSend: true })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  // ---------------------------------------------------------------------------
  // Data Loading
  // ---------------------------------------------------------------------------

  describe('carregamento de dados', () => {
    it('deve chamar settingsService.getAll', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockGetAll).toHaveBeenCalledOnce()
    })

    it('deve derivar settings.phoneNumberId de allSettings.credentials', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.settings.phoneNumberId).toBe('123456789')
      expect(result.current.settings.businessAccountId).toBe('987654321')
    })

    it('deve mascarar accessToken com ★★★configured★★★', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.settings.accessToken).toBe('***configured***')
    })

    it('deve derivar aiSettings de allSettings.ai', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.aiSettings).toEqual(mockAllSettings.ai)
    })

    it('deve derivar metaApp de allSettings.metaApp', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.metaApp).toEqual(mockAllSettings.metaApp)
    })

    it('deve derivar testContact de allSettings.testContact', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.testContact).toEqual(mockAllSettings.testContact)
    })

    it('deve derivar availableDomains com formato DomainOption', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.availableDomains).toEqual([
        { url: 'https://smartzap.app', source: 'production', recommended: true },
        { url: 'https://smartzap.vercel.app', source: 'vercel', recommended: false },
      ])
    })

    it('deve derivar calendarBooking de allSettings', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.calendarBooking).toEqual(mockAllSettings.calendarBooking)
    })

    it('deve derivar workflowExecution de allSettings', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.workflowExecution).toEqual(mockAllSettings.workflowExecution)
    })

    it('deve derivar upstashConfig de allSettings', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.upstashConfig).toEqual(mockAllSettings.upstashConfig)
    })

    it('deve retornar webhookPath do allSettings ou default', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.webhookPath).toBe('/api/webhook')
    })

    it('deve retornar selectedDomain', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.selectedDomain).toBe('https://smartzap.app')
    })
  })

  // ---------------------------------------------------------------------------
  // Form Sync
  // ---------------------------------------------------------------------------

  describe('sincronização do formulário', () => {
    it('deve sincronizar formSettings quando dados carregam', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.settings.phoneNumberId).toBe('123456789')
      })

      // isConnected deve refletir os dados carregados
      expect(result.current.settings.isConnected).toBe(true)
    })

    it('deve permitir atualizar settings via setSettings', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.setSettings({
          phoneNumberId: 'new-id',
          businessAccountId: 'new-biz',
          accessToken: 'new-token',
          isConnected: false,
        })
      })

      expect(result.current.settings.phoneNumberId).toBe('new-id')
    })
  })

  // ---------------------------------------------------------------------------
  // Dependent Queries
  // ---------------------------------------------------------------------------

  describe('queries dependentes de isConnected', () => {
    it('deve buscar whatsAppThrottle quando conectado', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.whatsappThrottle).toEqual(mockThrottleConfig)
      })

      expect(mockGetWhatsAppThrottle).toHaveBeenCalled()
    })

    it('deve buscar autoSuppression quando conectado', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.autoSuppression).toEqual(mockAutoSuppressionConfig)
      })

      expect(mockGetAutoSuppression).toHaveBeenCalled()
    })

    it('não deve buscar throttle quando desconectado', async () => {
      mockGetAll.mockResolvedValue({
        ...mockAllSettings,
        credentials: { ...mockAllSettings.credentials, isConnected: false },
      })

      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockGetWhatsAppThrottle).not.toHaveBeenCalled()
      expect(result.current.whatsappThrottle).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // System Health
  // ---------------------------------------------------------------------------

  describe('system health', () => {
    it('deve carregar systemHealth via fetch /api/system', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.systemHealth).not.toBeNull()
      })

      expect(result.current.systemHealth).toHaveProperty('services')
    })

    it('deve ter função refreshSystemHealth', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(typeof result.current.refreshSystemHealth).toBe('function')
    })
  })

  // ---------------------------------------------------------------------------
  // Account Limits (delegated to useAccountLimits)
  // ---------------------------------------------------------------------------

  describe('account limits', () => {
    it('deve expor tierName do useAccountLimits', () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      expect(result.current.tierName).toBe('Tier 250')
    })

    it('deve expor refreshLimits', () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      expect(typeof result.current.refreshLimits).toBe('function')
    })
  })

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  describe('mutations', () => {
    it('deve salvar AI config via saveAIConfig', async () => {
      mockSaveAIConfig.mockResolvedValue({ ok: true })

      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.saveAIConfig({ apiKey: 'test-key', provider: 'google' })
      })

      expect(mockSaveAIConfig.mock.calls[0][0]).toEqual({ apiKey: 'test-key', provider: 'google' })
    })

    it('deve remover AI key via removeAIKey', async () => {
      mockRemoveAIKey.mockResolvedValue({ ok: true })

      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.removeAIKey('google')
      })

      expect(mockRemoveAIKey.mock.calls[0][0]).toBe('google')
    })

    it('deve salvar test contact via saveTestContact', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.saveTestContact({ name: 'Novo', phone: '+5511999999999' })
      })

      expect(mockSaveTestContact.mock.calls[0][0]).toEqual({ name: 'Novo', phone: '+5511999999999' })
    })

    it('deve remover test contact via removeTestContact', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.removeTestContact()
      })

      expect(mockRemoveTestContact).toHaveBeenCalled()
    })

    it('deve salvar whatsapp throttle', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const config = { enabled: true, maxMps: 100 }

      await act(async () => {
        await result.current.saveWhatsAppThrottle(config)
      })

      expect(mockSaveWhatsAppThrottle.mock.calls[0][0]).toEqual(config)
    })

    it('deve salvar auto suppression', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const config = { enabled: true, threshold: 10 }

      await act(async () => {
        await result.current.saveAutoSuppression(config)
      })

      expect(mockSaveAutoSuppression.mock.calls[0][0]).toEqual(config)
    })

    it('deve salvar calendar booking config', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const config = { timezone: 'America/Sao_Paulo' }

      await act(async () => {
        await result.current.saveCalendarBooking(config)
      })

      expect(mockSaveCalendarBookingConfig.mock.calls[0][0]).toEqual(config)
    })

    it('deve salvar workflow execution config', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const config = { retryCount: 5 }

      await act(async () => {
        await result.current.saveWorkflowExecution(config)
      })

      expect(mockSaveWorkflowExecutionConfig.mock.calls[0][0]).toEqual(config)
    })

    it('deve salvar upstash config', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const config = { email: 'user@test.com', apiKey: 'key-123' }

      await act(async () => {
        await result.current.saveUpstashConfig(config)
      })

      expect(mockSaveUpstashConfig.mock.calls[0][0]).toEqual(config)
    })

    it('deve remover upstash config', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.removeUpstashConfig()
      })

      expect(mockRemoveUpstashConfig).toHaveBeenCalled()
    })

    it('deve expor isSaving states', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.isSaving).toBe(false)
      expect(result.current.isSavingAI).toBe(false)
      expect(result.current.isSavingTestContact).toBe(false)
      expect(result.current.isSavingWhatsAppThrottle).toBe(false)
      expect(result.current.isSavingAutoSuppression).toBe(false)
      expect(result.current.isSavingCalendarBooking).toBe(false)
      expect(result.current.isSavingWorkflowExecution).toBe(false)
      expect(result.current.isSavingUpstashConfig).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Handle Save (connect to Meta)
  // ---------------------------------------------------------------------------

  describe('onSave (conectar Meta)', () => {
    it('deve buscar detalhes do telefone e salvar', async () => {
      mockFetchPhoneDetails.mockResolvedValue({
        display_phone_number: '+55 11 99999-9999',
        quality_rating: 'GREEN',
        verified_name: 'SmartZap',
      })
      mockSave.mockResolvedValue({
        phoneNumberId: '123456789',
        isConnected: true,
      })

      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.onSave()
      })

      expect(mockFetchPhoneDetails).toHaveBeenCalled()
      expect(mockSave).toHaveBeenCalled()
    })

    it('deve exibir toast de erro ao falhar fetchPhoneDetails', async () => {
      mockFetchPhoneDetails.mockRejectedValue(new Error('Invalid credentials'))
      const { toast } = await import('sonner')

      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await expect(
        act(async () => {
          await result.current.onSave()
        })
      ).rejects.toThrow()

      expect(toast.error).toHaveBeenCalledWith(
        'Erro ao conectar com a Meta API. Verifique as credenciais.'
      )
    })
  })

  // ---------------------------------------------------------------------------
  // Handle Disconnect
  // ---------------------------------------------------------------------------

  describe('onDisconnect', () => {
    it('deve limpar form e chamar DELETE /api/settings/credentials', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.settings.isConnected).toBe(true)
      })

      await act(async () => {
        await result.current.onDisconnect()
      })

      // Verifica que fetch foi chamado com DELETE
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      const deleteCall = fetchMock.mock.calls.find(
        (call: unknown[]) => call[0] === '/api/settings/credentials' && (call[1] as RequestInit)?.method === 'DELETE'
      )
      expect(deleteCall).toBeDefined()

      // Form deve estar limpo
      expect(result.current.settings.phoneNumberId).toBe('')
      expect(result.current.settings.isConnected).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Test Connection
  // ---------------------------------------------------------------------------

  describe('onTestConnection', () => {
    it('deve chamar settingsService.testConnection', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.onTestConnection()
      })

      expect(mockTestConnection).toHaveBeenCalled()
      expect(result.current.isTestingConnection).toBe(false)
    })

    it('deve auto-preencher WABA quando vazio e backend retorna wabaId', async () => {
      // Simula settings sem businessAccountId preenchido
      mockGetAll.mockResolvedValue({
        ...mockAllSettings,
        credentials: { ...mockAllSettings.credentials, businessAccountId: '' },
      })

      mockTestConnection.mockResolvedValue({
        ok: true,
        displayPhoneNumber: '+5511999999999',
        verifiedName: 'SmartZap',
        wabaId: 'auto-waba-123',
      })

      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.onTestConnection()
      })

      // businessAccountId deve ter sido auto-preenchido
      expect(result.current.settings.businessAccountId).toBe('auto-waba-123')
    })
  })

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------

  describe('health check', () => {
    it('deve verificar saúde da conta via onCheckHealth', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.onCheckHealth()
      })

      expect(mockCheckAccountHealth).toHaveBeenCalledOnce()
      expect(result.current.accountHealth).not.toBeNull()
      expect(result.current.isCheckingHealth).toBe(false)
    })

    it('deve expor canSendCampaign que usa quickHealthCheck', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const canSend = await result.current.canSendCampaign()
      expect(canSend).toEqual({ canSend: true })
      expect(mockQuickHealthCheck).toHaveBeenCalled()
    })

    it('deve expor getHealthSummary quando accountHealth disponível', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Antes de check, getHealthSummary é null
      expect(result.current.getHealthSummary).toBeNull()

      // Após check
      await act(async () => {
        await result.current.onCheckHealth()
      })

      expect(result.current.getHealthSummary).not.toBeNull()
      expect(typeof result.current.getHealthSummary).toBe('function')
    })
  })

  // ---------------------------------------------------------------------------
  // Setup Wizard
  // ---------------------------------------------------------------------------

  describe('setup wizard', () => {
    it('deve gerar setupSteps com base no systemHealth', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.systemHealth).not.toBeNull()
      })

      expect(result.current.setupSteps).toBeDefined()
      expect(result.current.setupSteps.length).toBe(2)
      expect(result.current.setupSteps[0].id).toBe('qstash')
      expect(result.current.setupSteps[1].id).toBe('whatsapp')
    })

    it('deve marcar step como configured quando serviço OK', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.systemHealth).not.toBeNull()
      })

      expect(result.current.setupSteps[0].status).toBe('configured') // qstash ok
      expect(result.current.setupSteps[1].status).toBe('configured') // whatsapp ok
    })

    it('deve indicar needsSetup=false quando QStash está OK', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.systemHealth).not.toBeNull()
      })

      expect(result.current.needsSetup).toBe(false)
    })

    it('deve indicar needsSetup=true quando QStash falha', async () => {
      // Override systemHealth com QStash em erro
      globalThis.fetch = createFetchMock({
        system: {
          health: {
            overall: 'unhealthy',
            services: {
              database: { status: 'ok' },
              qstash: { status: 'error', message: 'Token inválido' },
              whatsapp: { status: 'ok' },
            },
          },
          timestamp: '2026-02-08T12:00:00Z',
        },
      })

      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.systemHealth).not.toBeNull()
      })

      expect(result.current.needsSetup).toBe(true)
    })

    it('deve indicar infrastructureReady quando QStash OK', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.systemHealth).not.toBeNull()
      })

      expect(result.current.infrastructureReady).toBe(true)
    })

    it('deve indicar allConfigured quando todos os steps configurados', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.systemHealth).not.toBeNull()
      })

      expect(result.current.allConfigured).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Webhook Management
  // ---------------------------------------------------------------------------

  describe('webhook management', () => {
    it('deve expor webhookUrl e webhookToken', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.webhookUrl).toBeDefined()
      })

      expect(result.current.webhookUrl).toBe('https://smartzap.app/api/webhook')
      expect(result.current.webhookToken).toBe('token-xyz')
    })

    it('deve expor phoneNumbers quando conectado', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // phoneNumbers é array (pode ser vazio se mock retorna [])
      expect(Array.isArray(result.current.phoneNumbers)).toBe(true)
    })

    it('deve ter funções de webhook override', () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      expect(typeof result.current.setWebhookOverride).toBe('function')
      expect(typeof result.current.removeWebhookOverride).toBe('function')
    })

    it('deve ter função refreshPhoneNumbers', () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      expect(typeof result.current.refreshPhoneNumbers).toBe('function')
    })

    it('deve ter funções de webhook subscription', () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      expect(typeof result.current.subscribeWebhookMessages).toBe('function')
      expect(typeof result.current.unsubscribeWebhookMessages).toBe('function')
      expect(typeof result.current.refreshWebhookSubscription).toBe('function')
    })
  })

  // ---------------------------------------------------------------------------
  // Return Shape
  // ---------------------------------------------------------------------------

  describe('return shape', () => {
    it('deve retornar todas as propriedades esperadas', async () => {
      const { result } = renderHookWithProviders(() => useSettingsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Core settings
      expect(result.current).toHaveProperty('settings')
      expect(result.current).toHaveProperty('setSettings')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('isSaving')
      expect(result.current).toHaveProperty('onSave')
      expect(result.current).toHaveProperty('onSaveSettings')
      expect(result.current).toHaveProperty('onDisconnect')

      // Test connection
      expect(result.current).toHaveProperty('onTestConnection')
      expect(result.current).toHaveProperty('isTestingConnection')

      // Account limits
      expect(result.current).toHaveProperty('accountLimits')
      expect(result.current).toHaveProperty('refreshLimits')
      expect(result.current).toHaveProperty('tierName')
      expect(result.current).toHaveProperty('hasLimits')

      // Account health
      expect(result.current).toHaveProperty('accountHealth')
      expect(result.current).toHaveProperty('isCheckingHealth')
      expect(result.current).toHaveProperty('onCheckHealth')
      expect(result.current).toHaveProperty('canSendCampaign')

      // Webhook
      expect(result.current).toHaveProperty('webhookUrl')
      expect(result.current).toHaveProperty('webhookToken')
      expect(result.current).toHaveProperty('webhookStats')
      expect(result.current).toHaveProperty('webhookSubscription')
      expect(result.current).toHaveProperty('subscribeWebhookMessages')
      expect(result.current).toHaveProperty('unsubscribeWebhookMessages')

      // Phone numbers
      expect(result.current).toHaveProperty('phoneNumbers')
      expect(result.current).toHaveProperty('setWebhookOverride')
      expect(result.current).toHaveProperty('removeWebhookOverride')

      // Domains
      expect(result.current).toHaveProperty('availableDomains')
      expect(result.current).toHaveProperty('webhookPath')
      expect(result.current).toHaveProperty('selectedDomain')

      // System health
      expect(result.current).toHaveProperty('systemHealth')
      expect(result.current).toHaveProperty('systemHealthLoading')
      expect(result.current).toHaveProperty('refreshSystemHealth')

      // Setup wizard
      expect(result.current).toHaveProperty('setupSteps')
      expect(result.current).toHaveProperty('needsSetup')
      expect(result.current).toHaveProperty('infrastructureReady')
      expect(result.current).toHaveProperty('allConfigured')

      // AI
      expect(result.current).toHaveProperty('aiSettings')
      expect(result.current).toHaveProperty('saveAIConfig')
      expect(result.current).toHaveProperty('removeAIKey')
      expect(result.current).toHaveProperty('isSavingAI')

      // Meta App
      expect(result.current).toHaveProperty('metaApp')
      expect(result.current).toHaveProperty('refreshMetaApp')

      // Test Contact
      expect(result.current).toHaveProperty('testContact')
      expect(result.current).toHaveProperty('saveTestContact')
      expect(result.current).toHaveProperty('removeTestContact')

      // WhatsApp Turbo
      expect(result.current).toHaveProperty('whatsappThrottle')
      expect(result.current).toHaveProperty('saveWhatsAppThrottle')

      // Auto-suppression
      expect(result.current).toHaveProperty('autoSuppression')
      expect(result.current).toHaveProperty('saveAutoSuppression')

      // Calendar Booking
      expect(result.current).toHaveProperty('calendarBooking')
      expect(result.current).toHaveProperty('saveCalendarBooking')

      // Workflow Execution
      expect(result.current).toHaveProperty('workflowExecution')
      expect(result.current).toHaveProperty('saveWorkflowExecution')

      // Upstash Config
      expect(result.current).toHaveProperty('upstashConfig')
      expect(result.current).toHaveProperty('saveUpstashConfig')
      expect(result.current).toHaveProperty('removeUpstashConfig')
    })
  })
})
