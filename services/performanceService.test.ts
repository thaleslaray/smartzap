import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { performanceService, SettingsPerformanceResponse } from './performanceService'

import { createMockFetchResponse, setupFetchMock } from '@/tests/helpers'

const mockPerformance: SettingsPerformanceResponse = {
  source: 'run_metrics',
  rangeDays: 30,
  since: '2024-01-01T00:00:00.000Z',
  totals: {
    runs: 10,
    throughput_mps: { median: 5.2, p90: 8.1, samples: 10 },
    meta_avg_ms: { median: 120, samples: 10 },
    db_avg_ms: { median: 15, samples: 10 },
    throughput_429_rate: 0.05,
  },
  byConfig: [],
  runs: [],
}

describe('performanceService', () => {
  const mockFetch = setupFetchMock()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  // ===========================================================================
  // GET SETTINGS PERFORMANCE
  // ===========================================================================
  describe('getSettingsPerformance', () => {
    it('deve buscar performance com parametros padrao', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockPerformance))

      const result = await performanceService.getSettingsPerformance()

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/settings/performance?rangeDays=30&limit=200',
        {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        }
      )
      expect(result).toEqual(mockPerformance)
    })

    it('deve buscar performance com parametros customizados', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockPerformance))

      const result = await performanceService.getSettingsPerformance({
        rangeDays: 7,
        limit: 50,
      })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/settings/performance?rangeDays=7&limit=50',
        {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        }
      )
      expect(result).toEqual(mockPerformance)
    })

    it('deve lancar erro quando fetch falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(
          { error: 'Dados insuficientes' },
          { ok: false, status: 500 }
        )
      )

      await expect(
        performanceService.getSettingsPerformance()
      ).rejects.toThrow('Dados insuficientes')
    })
  })
})
