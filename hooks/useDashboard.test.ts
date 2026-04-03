import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHookWithProviders, waitFor } from '@/tests/helpers/hook-test-utils'

// Mock Supabase Realtime (useRealtimeQuery depende)
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

// Mock dashboardService
const mockGetStats = vi.fn()
const mockGetRecentCampaigns = vi.fn()

vi.mock('@/services/dashboardService', () => ({
  dashboardService: {
    getStats: (...args: unknown[]) => mockGetStats(...args),
    getRecentCampaigns: (...args: unknown[]) => mockGetRecentCampaigns(...args),
  },
}))

// Import hook DEPOIS dos mocks
import { useDashboardController } from './useDashboard'

// =============================================================================
// FIXTURES
// =============================================================================

const mockStats = {
  totalSent: 1500,
  deliveryRate: 95.5,
  activeCampaigns: 3,
  failedMessages: 12,
}

const mockRecentCampaigns = [
  { id: '1', name: 'Black Friday', status: 'COMPLETED', created_at: '2026-01-15' },
  { id: '2', name: 'Promo Janeiro', status: 'SENDING', created_at: '2026-01-20' },
]

// =============================================================================
// TESTES
// =============================================================================

describe('useDashboardController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetStats.mockResolvedValue(mockStats)
    mockGetRecentCampaigns.mockResolvedValue(mockRecentCampaigns)
  })

  // ---------------------------------------------------------------------------
  // Loading / Initial State
  // ---------------------------------------------------------------------------

  describe('estado inicial', () => {
    it('deve começar com isLoading true', () => {
      const { result } = renderHookWithProviders(() => useDashboardController())

      expect(result.current.isLoading).toBe(true)
    })

    it('deve retornar stats e recentCampaigns undefined enquanto carrega', () => {
      const { result } = renderHookWithProviders(() => useDashboardController())

      expect(result.current.stats).toBeUndefined()
      expect(result.current.recentCampaigns).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  describe('data fetching', () => {
    it('deve carregar stats com sucesso', async () => {
      const { result } = renderHookWithProviders(() => useDashboardController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.stats).toEqual(mockStats)
      expect(mockGetStats).toHaveBeenCalledOnce()
    })

    it('deve carregar campanhas recentes com sucesso', async () => {
      const { result } = renderHookWithProviders(() => useDashboardController())

      await waitFor(() => {
        expect(result.current.recentCampaigns).toBeDefined()
      })

      expect(result.current.recentCampaigns).toEqual(mockRecentCampaigns)
      expect(mockGetRecentCampaigns).toHaveBeenCalledOnce()
    })

    it('deve aceitar initialData para evitar loading', async () => {
      const initialData = { stats: mockStats, recentCampaigns: mockRecentCampaigns }
      const { result } = renderHookWithProviders(
        () => useDashboardController(initialData)
      )

      // Com initialData, não deve começar em loading
      expect(result.current.isLoading).toBe(false)
      expect(result.current.stats).toEqual(mockStats)
      expect(result.current.recentCampaigns).toEqual(mockRecentCampaigns)
    })
  })

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------

  describe('error handling', () => {
    it('deve reportar isError quando stats falha', async () => {
      mockGetStats.mockRejectedValue(new Error('Network error'))

      const { result } = renderHookWithProviders(() => useDashboardController())

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })
    })

    it('deve reportar isError quando recentCampaigns falha', async () => {
      mockGetRecentCampaigns.mockRejectedValue(new Error('Network error'))

      const { result } = renderHookWithProviders(() => useDashboardController())

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Refetch
  // ---------------------------------------------------------------------------

  describe('refetch', () => {
    it('deve ter função refetch', async () => {
      const { result } = renderHookWithProviders(() => useDashboardController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(typeof result.current.refetch).toBe('function')
    })

    it('deve chamar ambas queries ao refetch', async () => {
      const { result } = renderHookWithProviders(() => useDashboardController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Limpa contadores
      mockGetStats.mockClear()
      mockGetRecentCampaigns.mockClear()

      await result.current.refetch()

      expect(mockGetStats).toHaveBeenCalled()
      expect(mockGetRecentCampaigns).toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // Return Shape
  // ---------------------------------------------------------------------------

  describe('return shape', () => {
    it('deve retornar todas as propriedades esperadas', async () => {
      const { result } = renderHookWithProviders(() => useDashboardController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current).toHaveProperty('stats')
      expect(result.current).toHaveProperty('recentCampaigns')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('isFetching')
      expect(result.current).toHaveProperty('isError')
      expect(result.current).toHaveProperty('refetch')
    })
  })
})
