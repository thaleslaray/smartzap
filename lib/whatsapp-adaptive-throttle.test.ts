import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AdaptiveThrottleConfig,
  AdaptiveThrottleConfigWithSource,
  AdaptiveThrottleState,
} from '@/lib/whatsapp-adaptive-throttle'

// Mock settingsDb
const mockSettingsDb = {
  get: vi.fn<(key: string) => Promise<string | null>>(),
  set: vi.fn<(key: string, value: string) => Promise<void>>(),
}

vi.mock('@/lib/supabase-db', () => ({
  settingsDb: mockSettingsDb,
}))

// Constants from rate-limiter
const MIN_RATE_LIMIT = 1
const MAX_RATE_LIMIT = 1000

// Import after mocking
const {
  getAdaptiveThrottleConfig,
  getAdaptiveThrottleConfigWithSource,
  getAdaptiveThrottleState,
  setAdaptiveThrottleState,
  recordStableBatch,
  recordThroughputExceeded,
} = await import('@/lib/whatsapp-adaptive-throttle')

describe('whatsapp-adaptive-throttle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'))
    // Reset env vars
    delete process.env.WHATSAPP_ADAPTIVE_THROTTLE
    delete process.env.WHATSAPP_SEND_CONCURRENCY
    delete process.env.WHATSAPP_WORKFLOW_BATCH_SIZE
    delete process.env.WHATSAPP_ADAPTIVE_START_MPS
    delete process.env.WHATSAPP_ADAPTIVE_MAX_MPS
    delete process.env.WHATSAPP_ADAPTIVE_MIN_MPS
    delete process.env.WHATSAPP_ADAPTIVE_COOLDOWN_SEC
    delete process.env.WHATSAPP_ADAPTIVE_MIN_INCREASE_GAP_SEC
    delete process.env.WHATSAPP_SEND_FLOOR_DELAY_MS
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getAdaptiveThrottleConfig', () => {
    it('retorna config do env quando DB nao tem config', async () => {
      mockSettingsDb.get.mockResolvedValue(null)
      process.env.WHATSAPP_ADAPTIVE_THROTTLE = '1'
      process.env.WHATSAPP_ADAPTIVE_START_MPS = '25'
      process.env.WHATSAPP_ADAPTIVE_MAX_MPS = '100'
      process.env.WHATSAPP_ADAPTIVE_MIN_MPS = '10'

      const config = await getAdaptiveThrottleConfig()

      expect(config.enabled).toBe(true)
      expect(config.startMps).toBe(25)
      expect(config.maxMps).toBe(100)
      expect(config.minMps).toBe(10)
    })

    it('retorna config do DB quando presente e valido', async () => {
      mockSettingsDb.get.mockResolvedValue(
        JSON.stringify({
          enabled: true,
          startMps: 40,
          maxMps: 120,
          minMps: 5,
          cooldownSec: 60,
          minIncreaseGapSec: 15,
        })
      )

      const config = await getAdaptiveThrottleConfig()

      expect(config.enabled).toBe(true)
      expect(config.startMps).toBe(40)
      expect(config.maxMps).toBe(120)
      expect(config.minMps).toBe(5)
      expect(config.cooldownSec).toBe(60)
      expect(config.minIncreaseGapSec).toBe(15)
    })

    it('retorna config do env quando DB tem JSON invalido', async () => {
      mockSettingsDb.get.mockResolvedValue('invalid json {{{')
      process.env.WHATSAPP_ADAPTIVE_START_MPS = '30'

      const config = await getAdaptiveThrottleConfig()

      expect(config.startMps).toBe(30)
    })

    it('aplica clamp nos valores fora dos limites', async () => {
      mockSettingsDb.get.mockResolvedValue(
        JSON.stringify({
          enabled: true,
          startMps: 5000, // acima do MAX_RATE_LIMIT
          minMps: -10, // abaixo do MIN_RATE_LIMIT
          cooldownSec: 9999, // acima do limite
        })
      )

      const config = await getAdaptiveThrottleConfig()

      expect(config.startMps).toBeLessThanOrEqual(MAX_RATE_LIMIT)
      expect(config.minMps).toBeGreaterThanOrEqual(MIN_RATE_LIMIT)
      expect(config.cooldownSec).toBeLessThanOrEqual(600)
    })

    it('garante que startMps esta entre minMps e maxMps', async () => {
      mockSettingsDb.get.mockResolvedValue(
        JSON.stringify({
          enabled: true,
          startMps: 200,
          maxMps: 100,
          minMps: 50,
        })
      )

      const config = await getAdaptiveThrottleConfig()

      // startMps deve ser ajustado para estar dentro do range
      expect(config.startMps).toBeLessThanOrEqual(config.maxMps)
      expect(config.startMps).toBeGreaterThanOrEqual(config.minMps)
    })
  })

  describe('getAdaptiveThrottleConfigWithSource', () => {
    it('indica source "db" quando config vem do DB', async () => {
      mockSettingsDb.get.mockResolvedValue(JSON.stringify({ enabled: true }))

      const result = await getAdaptiveThrottleConfigWithSource()

      expect(result.source).toBe('db')
      expect(result.rawPresent).toBe(true)
    })

    it('indica source "env" quando config vem do env', async () => {
      mockSettingsDb.get.mockResolvedValue(null)

      const result = await getAdaptiveThrottleConfigWithSource()

      expect(result.source).toBe('env')
      expect(result.rawPresent).toBe(false)
    })

    it('indica rawPresent true mesmo quando parse falha', async () => {
      mockSettingsDb.get.mockResolvedValue('invalid json')

      const result = await getAdaptiveThrottleConfigWithSource()

      expect(result.source).toBe('env')
      expect(result.rawPresent).toBe(true)
    })
  })

  describe('getAdaptiveThrottleState', () => {
    it('retorna state existente do DB', async () => {
      const existingState: AdaptiveThrottleState = {
        targetMps: 50,
        cooldownUntil: null,
        lastIncreaseAt: '2024-01-15T11:00:00.000Z',
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T11:00:00.000Z',
      }
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(existingState)
        }
        return null
      })

      const state = await getAdaptiveThrottleState('phone123')

      expect(state.targetMps).toBe(50)
      expect(state.lastIncreaseAt).toBe('2024-01-15T11:00:00.000Z')
    })

    it('cria state inicial quando nao existe', async () => {
      mockSettingsDb.get.mockResolvedValue(null)
      process.env.WHATSAPP_ADAPTIVE_START_MPS = '35'

      const state = await getAdaptiveThrottleState('phone123')

      expect(state.targetMps).toBe(35)
      expect(state.cooldownUntil).toBeNull()
      expect(mockSettingsDb.set).toHaveBeenCalled()
    })

    it('usa startMps da config do DB quando disponivel', async () => {
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key === 'whatsapp_adaptive_throttle_config') {
          return JSON.stringify({ enabled: true, startMps: 45 })
        }
        return null
      })

      const state = await getAdaptiveThrottleState('phone123')

      expect(state.targetMps).toBe(45)
    })

    it('aplica clamp no targetMps ao parsear', async () => {
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify({ targetMps: 99999 })
        }
        return null
      })

      const state = await getAdaptiveThrottleState('phone123')

      expect(state.targetMps).toBeLessThanOrEqual(MAX_RATE_LIMIT)
    })
  })

  describe('setAdaptiveThrottleState', () => {
    it('salva state no DB com updatedAt atualizado', async () => {
      mockSettingsDb.set.mockResolvedValue(undefined)

      await setAdaptiveThrottleState('phone123', {
        targetMps: 60,
        cooldownUntil: null,
        lastIncreaseAt: null,
        lastDecreaseAt: null,
      })

      expect(mockSettingsDb.set).toHaveBeenCalledWith(
        'whatsapp_adaptive_mps_state:phone123',
        expect.stringContaining('"targetMps":60')
      )
      expect(mockSettingsDb.set).toHaveBeenCalledWith(
        'whatsapp_adaptive_mps_state:phone123',
        expect.stringContaining('"updatedAt"')
      )
    })

    it('aplica clamp no targetMps ao salvar', async () => {
      mockSettingsDb.set.mockResolvedValue(undefined)

      await setAdaptiveThrottleState('phone123', {
        targetMps: 5000, // acima do limite
        cooldownUntil: null,
        lastIncreaseAt: null,
        lastDecreaseAt: null,
      })

      const savedValue = JSON.parse(mockSettingsDb.set.mock.calls[0][1])
      expect(savedValue.targetMps).toBeLessThanOrEqual(MAX_RATE_LIMIT)
    })
  })

  describe('recordStableBatch (AIMD additive increase)', () => {
    it('aumenta targetMps quando estavel e fora do cooldown', async () => {
      const existingState: AdaptiveThrottleState = {
        targetMps: 50,
        cooldownUntil: null,
        lastIncreaseAt: null,
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T10:00:00.000Z',
      }
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(existingState)
        }
        if (key === 'whatsapp_adaptive_throttle_config') {
          return JSON.stringify({ enabled: true, maxMps: 100, minIncreaseGapSec: 10 })
        }
        return null
      })
      mockSettingsDb.set.mockResolvedValue(undefined)

      const result = await recordStableBatch('phone123')

      expect(result.changed).toBe(true)
      expect(result.reason).toBe('increase')
      expect(result.next.targetMps).toBeGreaterThan(result.previous.targetMps)
    })

    it('nao aumenta quando em cooldown', async () => {
      const futureTime = new Date(Date.now() + 60000).toISOString()
      const existingState: AdaptiveThrottleState = {
        targetMps: 50,
        cooldownUntil: futureTime, // em cooldown
        lastIncreaseAt: null,
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T10:00:00.000Z',
      }
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(existingState)
        }
        return null
      })

      const result = await recordStableBatch('phone123')

      expect(result.changed).toBe(false)
      expect(result.reason).toBe('noop')
      expect(result.next.targetMps).toBe(result.previous.targetMps)
    })

    it('nao aumenta quando ultimo aumento foi muito recente', async () => {
      const recentTime = new Date(Date.now() - 2000).toISOString() // 2 segundos atras
      const existingState: AdaptiveThrottleState = {
        targetMps: 50,
        cooldownUntil: null,
        lastIncreaseAt: recentTime,
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T10:00:00.000Z',
      }
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(existingState)
        }
        if (key === 'whatsapp_adaptive_throttle_config') {
          return JSON.stringify({ enabled: true, minIncreaseGapSec: 10 })
        }
        return null
      })

      const result = await recordStableBatch('phone123')

      expect(result.changed).toBe(false)
      expect(result.reason).toBe('noop')
    })

    it('respeita o limite maximo (maxMps)', async () => {
      const existingState: AdaptiveThrottleState = {
        targetMps: 99, // proximo do limite
        cooldownUntil: null,
        lastIncreaseAt: null,
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T10:00:00.000Z',
      }
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(existingState)
        }
        if (key === 'whatsapp_adaptive_throttle_config') {
          return JSON.stringify({ enabled: true, maxMps: 100, minIncreaseGapSec: 1 })
        }
        return null
      })
      mockSettingsDb.set.mockResolvedValue(undefined)

      const result = await recordStableBatch('phone123')

      expect(result.next.targetMps).toBeLessThanOrEqual(100)
    })

    it('retorna noop quando ja esta no maximo', async () => {
      const existingState: AdaptiveThrottleState = {
        targetMps: 100,
        cooldownUntil: null,
        lastIncreaseAt: null,
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T10:00:00.000Z',
      }
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(existingState)
        }
        if (key === 'whatsapp_adaptive_throttle_config') {
          return JSON.stringify({ enabled: true, maxMps: 100, minIncreaseGapSec: 1 })
        }
        return null
      })

      const result = await recordStableBatch('phone123')

      expect(result.changed).toBe(false)
      expect(result.reason).toBe('noop')
    })

    it('usa minSecondsBetweenIncreases quando fornecido', async () => {
      const recentTime = new Date(Date.now() - 5000).toISOString() // 5 segundos atras
      const existingState: AdaptiveThrottleState = {
        targetMps: 50,
        cooldownUntil: null,
        lastIncreaseAt: recentTime,
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T10:00:00.000Z',
      }
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(existingState)
        }
        if (key === 'whatsapp_adaptive_throttle_config') {
          return JSON.stringify({ enabled: true, minIncreaseGapSec: 3 })
        }
        return null
      })
      mockSettingsDb.set.mockResolvedValue(undefined)

      // 5s > 3s, entao deve aumentar
      const result = await recordStableBatch('phone123', { minSecondsBetweenIncreases: 3 })

      expect(result.changed).toBe(true)
      expect(result.reason).toBe('increase')
    })

    it('calcula step como 5% do targetMps atual (minimo 1)', async () => {
      const existingState: AdaptiveThrottleState = {
        targetMps: 100,
        cooldownUntil: null,
        lastIncreaseAt: null,
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T10:00:00.000Z',
      }
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(existingState)
        }
        if (key === 'whatsapp_adaptive_throttle_config') {
          return JSON.stringify({ enabled: true, maxMps: 200, minIncreaseGapSec: 1 })
        }
        return null
      })
      mockSettingsDb.set.mockResolvedValue(undefined)

      const result = await recordStableBatch('phone123')

      // 5% de 100 = 5, entao esperamos 105
      expect(result.next.targetMps).toBe(105)
    })

    it('garante step minimo de 1 para valores baixos', async () => {
      const existingState: AdaptiveThrottleState = {
        targetMps: 10,
        cooldownUntil: null,
        lastIncreaseAt: null,
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T10:00:00.000Z',
      }
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(existingState)
        }
        if (key === 'whatsapp_adaptive_throttle_config') {
          return JSON.stringify({ enabled: true, maxMps: 100, minIncreaseGapSec: 1 })
        }
        return null
      })
      mockSettingsDb.set.mockResolvedValue(undefined)

      const result = await recordStableBatch('phone123')

      // 5% de 10 = 0.5, arredonda para 1
      expect(result.next.targetMps).toBe(11)
    })
  })

  describe('recordThroughputExceeded (AIMD multiplicative decrease)', () => {
    it('reduz targetMps em 40% (multiplicador 0.6)', async () => {
      const existingState: AdaptiveThrottleState = {
        targetMps: 100,
        cooldownUntil: null,
        lastIncreaseAt: null,
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T10:00:00.000Z',
      }
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(existingState)
        }
        if (key === 'whatsapp_adaptive_throttle_config') {
          return JSON.stringify({ enabled: true, minMps: 5, cooldownSec: 30 })
        }
        return null
      })
      mockSettingsDb.set.mockResolvedValue(undefined)

      const result = await recordThroughputExceeded('phone123')

      expect(result.changed).toBe(true)
      expect(result.reason).toBe('decrease')
      expect(result.next.targetMps).toBe(60) // 100 * 0.6
    })

    it('aplica cooldown mesmo quando ja esta no minimo', async () => {
      const existingState: AdaptiveThrottleState = {
        targetMps: 5,
        cooldownUntil: null,
        lastIncreaseAt: null,
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T10:00:00.000Z',
      }
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(existingState)
        }
        if (key === 'whatsapp_adaptive_throttle_config') {
          return JSON.stringify({ enabled: true, minMps: 5, cooldownSec: 30 })
        }
        return null
      })
      mockSettingsDb.set.mockResolvedValue(undefined)

      const result = await recordThroughputExceeded('phone123')

      // changed = false porque targetMps nao mudou (5 * 0.6 = 3, mas minMps = 5)
      expect(result.changed).toBe(false)
      expect(result.reason).toBe('decrease')
      expect(result.next.cooldownUntil).not.toBeNull()
    })

    it('respeita o limite minimo (minMps)', async () => {
      const existingState: AdaptiveThrottleState = {
        targetMps: 10,
        cooldownUntil: null,
        lastIncreaseAt: null,
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T10:00:00.000Z',
      }
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(existingState)
        }
        if (key === 'whatsapp_adaptive_throttle_config') {
          return JSON.stringify({ enabled: true, minMps: 8, cooldownSec: 30 })
        }
        return null
      })
      mockSettingsDb.set.mockResolvedValue(undefined)

      const result = await recordThroughputExceeded('phone123')

      // 10 * 0.6 = 6, mas minMps = 8, entao deve ser 8
      expect(result.next.targetMps).toBe(8)
    })

    it('usa cooldownSeconds quando fornecido', async () => {
      const existingState: AdaptiveThrottleState = {
        targetMps: 50,
        cooldownUntil: null,
        lastIncreaseAt: null,
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T10:00:00.000Z',
      }
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(existingState)
        }
        if (key === 'whatsapp_adaptive_throttle_config') {
          return JSON.stringify({ enabled: true, minMps: 5, cooldownSec: 30 })
        }
        return null
      })
      mockSettingsDb.set.mockResolvedValue(undefined)

      const result = await recordThroughputExceeded('phone123', { cooldownSeconds: 60 })

      const cooldownUntil = new Date(result.next.cooldownUntil!).getTime()
      const expectedCooldown = Date.now() + 60 * 1000
      expect(cooldownUntil).toBe(expectedCooldown)
    })

    it('atualiza lastDecreaseAt', async () => {
      const existingState: AdaptiveThrottleState = {
        targetMps: 50,
        cooldownUntil: null,
        lastIncreaseAt: null,
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T10:00:00.000Z',
      }
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(existingState)
        }
        return null
      })
      mockSettingsDb.set.mockResolvedValue(undefined)

      const result = await recordThroughputExceeded('phone123')

      expect(result.next.lastDecreaseAt).toBe('2024-01-15T12:00:00.000Z')
    })
  })

  describe('boundary conditions', () => {
    it('clampInt retorna min para NaN/Infinity', async () => {
      mockSettingsDb.get.mockResolvedValue(
        JSON.stringify({
          enabled: true,
          startMps: NaN,
          maxMps: Infinity,
        })
      )

      const config = await getAdaptiveThrottleConfig()

      expect(config.startMps).toBeGreaterThanOrEqual(MIN_RATE_LIMIT)
      expect(config.maxMps).toBeLessThanOrEqual(MAX_RATE_LIMIT)
    })

    it('clampInt aplica floor para valores decimais', async () => {
      mockSettingsDb.get.mockResolvedValue(
        JSON.stringify({
          enabled: true,
          startMps: 25.9,
          cooldownSec: 30.7,
        })
      )

      const config = await getAdaptiveThrottleConfig()

      expect(config.startMps).toBe(25)
      expect(config.cooldownSec).toBe(30)
    })

    it('parseConfig aceita enabled como string "true"', async () => {
      mockSettingsDb.get.mockResolvedValue(
        JSON.stringify({
          enabled: 'true',
        })
      )

      const config = await getAdaptiveThrottleConfig()

      expect(config.enabled).toBe(true)
    })

    it('parseConfig aceita enabled como string "1"', async () => {
      mockSettingsDb.get.mockResolvedValue(
        JSON.stringify({
          enabled: '1',
        })
      )

      const config = await getAdaptiveThrottleConfig()

      expect(config.enabled).toBe(true)
    })

    it('parseConfig aceita enabled como string "on"', async () => {
      mockSettingsDb.get.mockResolvedValue(
        JSON.stringify({
          enabled: 'on',
        })
      )

      const config = await getAdaptiveThrottleConfig()

      expect(config.enabled).toBe(true)
    })

    it('parseJsonState retorna null para objeto invalido', async () => {
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(null)
        }
        return null
      })

      const state = await getAdaptiveThrottleState('phone123')

      // Deve criar um novo state default
      expect(state.targetMps).toBeGreaterThanOrEqual(MIN_RATE_LIMIT)
      expect(mockSettingsDb.set).toHaveBeenCalled()
    })

    it('isInCooldown retorna false para cooldownUntil invalido', async () => {
      const existingState: AdaptiveThrottleState = {
        targetMps: 50,
        cooldownUntil: 'invalid-date',
        lastIncreaseAt: null,
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T10:00:00.000Z',
      }
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(existingState)
        }
        if (key === 'whatsapp_adaptive_throttle_config') {
          return JSON.stringify({ enabled: true, maxMps: 100, minIncreaseGapSec: 1 })
        }
        return null
      })
      mockSettingsDb.set.mockResolvedValue(undefined)

      const result = await recordStableBatch('phone123')

      // Deve aumentar porque cooldown invalido eh ignorado
      expect(result.changed).toBe(true)
    })

    it('isInCooldown retorna false quando cooldownUntil ja passou', async () => {
      const pastTime = new Date(Date.now() - 60000).toISOString() // 1 minuto atras
      const existingState: AdaptiveThrottleState = {
        targetMps: 50,
        cooldownUntil: pastTime,
        lastIncreaseAt: null,
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T10:00:00.000Z',
      }
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(existingState)
        }
        if (key === 'whatsapp_adaptive_throttle_config') {
          return JSON.stringify({ enabled: true, maxMps: 100, minIncreaseGapSec: 1 })
        }
        return null
      })
      mockSettingsDb.set.mockResolvedValue(undefined)

      const result = await recordStableBatch('phone123')

      // Deve aumentar porque cooldown ja passou
      expect(result.changed).toBe(true)
    })
  })

  describe('configuration defaults', () => {
    it('usa valores default quando env vars nao estao definidas', async () => {
      mockSettingsDb.get.mockResolvedValue(null)

      const config = await getAdaptiveThrottleConfig()

      // Defaults: ativado por padrão com valores conservadores (Balanced profile)
      expect(config.enabled).toBe(true)
      expect(config.sendConcurrency).toBe(2)
      expect(config.batchSize).toBe(40)
      expect(config.startMps).toBe(20)
      expect(config.maxMps).toBe(80)
      expect(config.minMps).toBe(5)
      expect(config.cooldownSec).toBe(30)
      expect(config.minIncreaseGapSec).toBe(10)
      expect(config.sendFloorDelayMs).toBe(0)
    })

    it('respeita limites de sendConcurrency (1-50)', async () => {
      mockSettingsDb.get.mockResolvedValue(
        JSON.stringify({
          enabled: true,
          sendConcurrency: 100, // acima do limite
        })
      )

      const config = await getAdaptiveThrottleConfig()

      expect(config.sendConcurrency).toBeLessThanOrEqual(50)
    })

    it('respeita limites de batchSize (1-200)', async () => {
      mockSettingsDb.get.mockResolvedValue(
        JSON.stringify({
          enabled: true,
          batchSize: 500, // acima do limite
        })
      )

      const config = await getAdaptiveThrottleConfig()

      expect(config.batchSize).toBeLessThanOrEqual(200)
    })

    it('respeita limites de sendFloorDelayMs (0-5000)', async () => {
      mockSettingsDb.get.mockResolvedValue(
        JSON.stringify({
          enabled: true,
          sendFloorDelayMs: 10000, // acima do limite
        })
      )

      const config = await getAdaptiveThrottleConfig()

      expect(config.sendFloorDelayMs).toBeLessThanOrEqual(5000)
    })
  })

  describe('AIMD algorithm behavior', () => {
    it('demonstra aumento gradual seguido de reducao rapida', async () => {
      let currentState: AdaptiveThrottleState = {
        targetMps: 50,
        cooldownUntil: null,
        lastIncreaseAt: null,
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T10:00:00.000Z',
      }

      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(currentState)
        }
        if (key === 'whatsapp_adaptive_throttle_config') {
          // minIncreaseGapSec is subject to Math.max(3, ...) in the code, so minimum is 3 seconds
          return JSON.stringify({ enabled: true, maxMps: 100, minMps: 5, cooldownSec: 1, minIncreaseGapSec: 3 })
        }
        return null
      })

      mockSettingsDb.set.mockImplementation(async (key, value) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          currentState = JSON.parse(value)
        }
      })

      // Primeiro batch estavel - aumento gradual
      const result1 = await recordStableBatch('phone123')
      const firstIncrease = result1.next.targetMps
      expect(firstIncrease).toBeGreaterThan(50) // Deve ter aumentado

      // Avanca o tempo para poder aumentar novamente (mais de 3 segundos)
      vi.setSystemTime(new Date('2024-01-15T12:00:05.000Z'))

      const result2 = await recordStableBatch('phone123')
      const secondIncrease = result2.next.targetMps
      expect(secondIncrease).toBeGreaterThan(firstIncrease) // Deve ter aumentado mais

      // Throughput excedido - reducao rapida (40% de reducao, ou seja, 60% do valor)
      vi.setSystemTime(new Date('2024-01-15T12:00:10.000Z'))
      const result3 = await recordThroughputExceeded('phone123')
      const afterDecrease = result3.next.targetMps

      // A reducao deve ser aproximadamente 60% do valor anterior
      expect(afterDecrease).toBeLessThan(secondIncrease)
      expect(afterDecrease).toBe(Math.floor(secondIncrease * 0.6))
    })

    it('step de aumento eh limitado a 50', async () => {
      const existingState: AdaptiveThrottleState = {
        targetMps: 900,
        cooldownUntil: null,
        lastIncreaseAt: null,
        lastDecreaseAt: null,
        updatedAt: '2024-01-15T10:00:00.000Z',
      }
      mockSettingsDb.get.mockImplementation(async (key) => {
        if (key.startsWith('whatsapp_adaptive_mps_state:')) {
          return JSON.stringify(existingState)
        }
        if (key === 'whatsapp_adaptive_throttle_config') {
          return JSON.stringify({ enabled: true, maxMps: 1000, minIncreaseGapSec: 1 })
        }
        return null
      })
      mockSettingsDb.set.mockResolvedValue(undefined)

      const result = await recordStableBatch('phone123')

      // 5% de 900 = 45, que esta dentro do limite
      expect(result.next.targetMps).toBe(945)
    })
  })
})
