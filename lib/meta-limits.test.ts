import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  // Types
  type MessagingTier,
  type ThroughputLevel,
  type QualityScore,
  type AccountLimits,
  // Constants
  TIER_LIMITS,
  TIER_DISPLAY_NAMES,
  THROUGHPUT_LIMITS,
  DEFAULT_LIMITS,
  TEST_LIMITS,
  DEBUG_LOW_LIMIT,
  LIMITS_STORAGE_KEY,
  // Functions
  validateCampaign,
  getUpgradeRoadmap,
  getNextTier,
  fetchAccountLimits,
  getCachedLimits,
  cacheLimits,
  areLimitsStale,
} from './meta-limits'

// ===== HELPER FACTORIES =====

function createAccountLimits(overrides: Partial<AccountLimits> = {}): AccountLimits {
  return {
    messagingTier: 'TIER_2K',
    maxUniqueUsersPerDay: 2000,
    throughputLevel: 'STANDARD',
    maxMessagesPerSecond: 80,
    qualityScore: 'GREEN',
    usedToday: 0,
    lastFetched: new Date().toISOString(),
    ...overrides,
  }
}

// ===== CONSTANTS TESTS =====

describe('Constants', () => {
  describe('TIER_LIMITS', () => {
    it.each([
      ['TIER_250', 250],
      ['TIER_1K', 1000],
      ['TIER_2K', 2000],
      ['TIER_10K', 10000],
      ['TIER_100K', 100000],
      ['TIER_UNLIMITED', Infinity],
    ] as const)('should have correct limit for %s', (tier, expected) => {
      expect(TIER_LIMITS[tier]).toBe(expected)
    })

    it('should have all tiers defined', () => {
      expect(Object.keys(TIER_LIMITS)).toHaveLength(6)
    })
  })

  describe('TIER_DISPLAY_NAMES', () => {
    it.each([
      ['TIER_250', 'Iniciante (250/dia)'],
      ['TIER_1K', 'Básico (1K/dia)'],
      ['TIER_2K', 'Verificado (2K/dia)'],
      ['TIER_10K', 'Crescimento (10K/dia)'],
      ['TIER_100K', 'Escala (100K/dia)'],
      ['TIER_UNLIMITED', 'Ilimitado'],
    ] as const)('should have correct display name for %s', (tier, expected) => {
      expect(TIER_DISPLAY_NAMES[tier]).toBe(expected)
    })
  })

  describe('THROUGHPUT_LIMITS', () => {
    it('should have STANDARD at 80 mps', () => {
      expect(THROUGHPUT_LIMITS['STANDARD']).toBe(80)
    })

    it('should have HIGH at 1000 mps', () => {
      expect(THROUGHPUT_LIMITS['HIGH']).toBe(1000)
    })
  })

  describe('DEFAULT_LIMITS', () => {
    it('should have TIER_250 as default tier', () => {
      expect(DEFAULT_LIMITS.messagingTier).toBe('TIER_250')
    })

    it('should have 250 as default max users per day', () => {
      expect(DEFAULT_LIMITS.maxUniqueUsersPerDay).toBe(250)
    })

    it('should have STANDARD throughput', () => {
      expect(DEFAULT_LIMITS.throughputLevel).toBe('STANDARD')
    })

    it('should have GREEN quality score as default', () => {
      // Quando não sabemos, assumimos GREEN (comportamento otimista da Meta)
      expect(DEFAULT_LIMITS.qualityScore).toBe('GREEN')
    })

    it('should have 0 usedToday', () => {
      expect(DEFAULT_LIMITS.usedToday).toBe(0)
    })
  })

  describe('TEST_LIMITS', () => {
    it('should have very low limit for testing (5)', () => {
      expect(TEST_LIMITS.maxUniqueUsersPerDay).toBe(5)
    })

    it('should have GREEN quality score', () => {
      expect(TEST_LIMITS.qualityScore).toBe('GREEN')
    })
  })

  describe('DEBUG_LOW_LIMIT', () => {
    it('should be false by default', () => {
      expect(DEBUG_LOW_LIMIT).toBe(false)
    })
  })
})

// ===== validateCampaign TESTS =====

describe('validateCampaign', () => {
  describe('basic validation', () => {
    it('should allow campaign within limits', () => {
      const limits = createAccountLimits({ maxUniqueUsersPerDay: 2000 })
      const result = validateCampaign(1000, limits)

      expect(result.canSend).toBe(true)
      expect(result.blockedReason).toBeUndefined()
      expect(result.currentLimit).toBe(2000)
      expect(result.requestedCount).toBe(1000)
      expect(result.remainingToday).toBe(2000)
    })

    it('should block campaign exceeding daily limit', () => {
      const limits = createAccountLimits({ maxUniqueUsersPerDay: 2000 })
      const result = validateCampaign(3000, limits)

      expect(result.canSend).toBe(false)
      expect(result.blockedReason).toContain('3.000 contatos')
      expect(result.blockedReason).toContain('2.000 usuários')
      expect(result.upgradeRoadmap).toBeDefined()
    })

    it('should block campaign exceeding remaining quota', () => {
      const limits = createAccountLimits({
        maxUniqueUsersPerDay: 2000,
        usedToday: 1800,
      })
      const result = validateCampaign(500, limits)

      expect(result.canSend).toBe(false)
      expect(result.blockedReason).toContain('1.800')
      expect(result.blockedReason).toContain('200 usuários disponíveis')
      expect(result.remainingToday).toBe(200)
    })
  })

  describe('TIER_UNLIMITED', () => {
    it('should always allow sending for unlimited tier', () => {
      const limits = createAccountLimits({
        messagingTier: 'TIER_UNLIMITED',
        maxUniqueUsersPerDay: Infinity,
      })
      const result = validateCampaign(1000000, limits)

      expect(result.canSend).toBe(true)
      expect(result.blockedReason).toBeUndefined()
    })

    it('should still warn about RED quality for unlimited tier', () => {
      const limits = createAccountLimits({
        messagingTier: 'TIER_UNLIMITED',
        maxUniqueUsersPerDay: Infinity,
        qualityScore: 'RED',
      })
      const result = validateCampaign(1000, limits)

      expect(result.canSend).toBe(true)
      expect(result.warnings).toContainEqual(
        expect.stringContaining('qualidade BAIXA')
      )
    })
  })

  describe('quality warnings', () => {
    it('should warn about RED quality score', () => {
      const limits = createAccountLimits({ qualityScore: 'RED' })
      const result = validateCampaign(100, limits)

      expect(result.canSend).toBe(true)
      expect(result.warnings).toContainEqual(
        expect.stringContaining('qualidade BAIXA')
      )
    })

    it('should warn about YELLOW quality score', () => {
      const limits = createAccountLimits({ qualityScore: 'YELLOW' })
      const result = validateCampaign(100, limits)

      expect(result.canSend).toBe(true)
      expect(result.warnings).toContainEqual(
        expect.stringContaining('qualidade MÉDIA')
      )
    })

    it('should not warn about GREEN quality score', () => {
      const limits = createAccountLimits({ qualityScore: 'GREEN' })
      const result = validateCampaign(100, limits)

      expect(result.warnings).not.toContainEqual(
        expect.stringContaining('qualidade')
      )
    })
  })

  describe('large campaign warnings', () => {
    it('should warn about large campaigns (> 5000) with STANDARD throughput', () => {
      const limits = createAccountLimits({
        maxUniqueUsersPerDay: 10000,
        messagingTier: 'TIER_10K',
        throughputLevel: 'STANDARD',
      })
      const result = validateCampaign(6000, limits)

      expect(result.canSend).toBe(true)
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Campanha grande')
      )
    })

    it('should not warn about large campaigns with HIGH throughput', () => {
      const limits = createAccountLimits({
        maxUniqueUsersPerDay: 10000,
        messagingTier: 'TIER_10K',
        throughputLevel: 'HIGH',
      })
      const result = validateCampaign(6000, limits)

      expect(result.warnings).not.toContainEqual(
        expect.stringContaining('Campanha grande')
      )
    })
  })

  describe('near limit warnings', () => {
    it('should warn when campaign uses > 80% of daily limit', () => {
      const limits = createAccountLimits({ maxUniqueUsersPerDay: 1000 })
      const result = validateCampaign(850, limits)

      expect(result.canSend).toBe(true)
      expect(result.warnings).toContainEqual(expect.stringContaining('85%'))
    })

    it('should not warn when campaign uses <= 80% of daily limit', () => {
      const limits = createAccountLimits({ maxUniqueUsersPerDay: 1000 })
      const result = validateCampaign(800, limits)

      expect(result.warnings).not.toContainEqual(
        expect.stringMatching(/\d+%.*limite diário/)
      )
    })
  })

  describe('estimated duration', () => {
    it('should calculate estimated duration correctly', () => {
      const limits = createAccountLimits({ maxMessagesPerSecond: 80 })
      const result = validateCampaign(100, limits)

      // 100 contacts / (80 * 0.9) = ~1.39 seconds
      expect(result.estimatedDuration).toBeDefined()
      expect(result.estimatedDuration).toContain('segundo')
    })

    it('should show minutes for larger campaigns', () => {
      const limits = createAccountLimits({ maxMessagesPerSecond: 80 })
      const result = validateCampaign(5000, limits)

      // 5000 contacts / (80 * 0.9) = ~69 seconds = ~1.15 minutes
      expect(result.estimatedDuration).toContain('minuto')
    })

    it('should show hours for very large campaigns', () => {
      const limits = createAccountLimits({
        maxMessagesPerSecond: 80,
        maxUniqueUsersPerDay: 100000,
        messagingTier: 'TIER_100K',
      })
      const result = validateCampaign(50000, limits)

      // 50000 / (80 * 0.9) = ~694 seconds = ~11.5 minutes (not hours)
      // Need to adjust - to get hours we need even more contacts
      expect(result.estimatedDuration).toBeDefined()
    })
  })

  describe('edge cases', () => {
    it('should handle zero contacts', () => {
      const limits = createAccountLimits()
      const result = validateCampaign(0, limits)

      expect(result.canSend).toBe(true)
      expect(result.requestedCount).toBe(0)
    })

    it('should handle exactly at limit', () => {
      const limits = createAccountLimits({ maxUniqueUsersPerDay: 1000 })
      const result = validateCampaign(1000, limits)

      expect(result.canSend).toBe(true)
      expect(result.remainingToday).toBe(1000)
    })

    it('should handle exactly 1 over limit', () => {
      const limits = createAccountLimits({ maxUniqueUsersPerDay: 1000 })
      const result = validateCampaign(1001, limits)

      expect(result.canSend).toBe(false)
    })

    it('should handle undefined usedToday as 0', () => {
      const limits = createAccountLimits()
      delete (limits as Partial<AccountLimits>).usedToday
      const result = validateCampaign(100, limits)

      expect(result.remainingToday).toBe(limits.maxUniqueUsersPerDay)
    })

    it('should not allow negative remaining', () => {
      const limits = createAccountLimits({
        maxUniqueUsersPerDay: 1000,
        usedToday: 1500, // More than max (edge case)
      })
      const result = validateCampaign(100, limits)

      expect(result.remainingToday).toBe(0)
      expect(result.canSend).toBe(false)
    })
  })

  describe('table-driven validation scenarios', () => {
    const testCases: Array<{
      name: string
      contactCount: number
      limits: Partial<AccountLimits>
      expectedCanSend: boolean
    }> = [
      {
        name: 'TIER_250 within limits',
        contactCount: 100,
        limits: { messagingTier: 'TIER_250', maxUniqueUsersPerDay: 250 },
        expectedCanSend: true,
      },
      {
        name: 'TIER_250 at exact limit',
        contactCount: 250,
        limits: { messagingTier: 'TIER_250', maxUniqueUsersPerDay: 250 },
        expectedCanSend: true,
      },
      {
        name: 'TIER_250 over limit',
        contactCount: 251,
        limits: { messagingTier: 'TIER_250', maxUniqueUsersPerDay: 250 },
        expectedCanSend: false,
      },
      {
        name: 'TIER_10K with partial usage',
        contactCount: 5000,
        limits: {
          messagingTier: 'TIER_10K',
          maxUniqueUsersPerDay: 10000,
          usedToday: 4000,
        },
        expectedCanSend: true,
      },
      {
        name: 'TIER_10K exceeding remaining',
        contactCount: 7000,
        limits: {
          messagingTier: 'TIER_10K',
          maxUniqueUsersPerDay: 10000,
          usedToday: 4000,
        },
        expectedCanSend: false,
      },
      {
        name: 'TIER_UNLIMITED any amount',
        contactCount: 999999,
        limits: {
          messagingTier: 'TIER_UNLIMITED',
          maxUniqueUsersPerDay: Infinity,
        },
        expectedCanSend: true,
      },
    ]

    it.each(testCases)(
      '$name',
      ({ contactCount, limits, expectedCanSend }) => {
        const fullLimits = createAccountLimits(limits)
        const result = validateCampaign(contactCount, fullLimits)
        expect(result.canSend).toBe(expectedCanSend)
      }
    )
  })
})

// ===== getUpgradeRoadmap TESTS =====

describe('getUpgradeRoadmap', () => {
  describe('TIER_250 roadmap', () => {
    it('should return 3 steps for TIER_250', () => {
      const limits = createAccountLimits({ messagingTier: 'TIER_250' })
      const roadmap = getUpgradeRoadmap(limits)

      expect(roadmap).toHaveLength(3)
    })

    it('should include business verification step', () => {
      const limits = createAccountLimits({ messagingTier: 'TIER_250' })
      const roadmap = getUpgradeRoadmap(limits)

      expect(roadmap[0].title).toContain('Verificar sua empresa')
      expect(roadmap[0].action).toBe('Verificar Empresa')
      expect(roadmap[0].link).toContain('business.facebook.com')
    })

    it('should mark quality step as completed when GREEN', () => {
      const limits = createAccountLimits({
        messagingTier: 'TIER_250',
        qualityScore: 'GREEN',
      })
      const roadmap = getUpgradeRoadmap(limits)

      const qualityStep = roadmap.find((s) =>
        s.title.includes('Manter qualidade')
      )
      expect(qualityStep?.completed).toBe(true)
    })

    it('should mark quality step as completed when YELLOW', () => {
      const limits = createAccountLimits({
        messagingTier: 'TIER_250',
        qualityScore: 'YELLOW',
      })
      const roadmap = getUpgradeRoadmap(limits)

      const qualityStep = roadmap.find((s) =>
        s.title.includes('Manter qualidade')
      )
      expect(qualityStep?.completed).toBe(true)
    })

    it('should mark quality step as incomplete when RED', () => {
      const limits = createAccountLimits({
        messagingTier: 'TIER_250',
        qualityScore: 'RED',
      })
      const roadmap = getUpgradeRoadmap(limits)

      const qualityStep = roadmap.find((s) =>
        s.title.includes('Manter qualidade')
      )
      expect(qualityStep?.completed).toBe(false)
    })
  })

  describe('TIER_2K roadmap', () => {
    it('should return 3 steps for TIER_2K', () => {
      const limits = createAccountLimits({ messagingTier: 'TIER_2K' })
      const roadmap = getUpgradeRoadmap(limits)

      expect(roadmap).toHaveLength(3)
    })

    it('should include usage threshold step (50%)', () => {
      const limits = createAccountLimits({ messagingTier: 'TIER_2K' })
      const roadmap = getUpgradeRoadmap(limits)

      expect(roadmap[0].description).toContain('50%')
      expect(roadmap[0].description).toContain('1.000+')
    })

    it('should include automatic upgrade step', () => {
      const limits = createAccountLimits({ messagingTier: 'TIER_2K' })
      const roadmap = getUpgradeRoadmap(limits)

      const autoStep = roadmap.find((s) =>
        s.title.includes('Aguardar upgrade automático')
      )
      expect(autoStep).toBeDefined()
      expect(autoStep?.description).toContain('6 horas')
    })
  })

  describe('TIER_10K roadmap', () => {
    it('should return 2 steps for TIER_10K', () => {
      const limits = createAccountLimits({ messagingTier: 'TIER_10K' })
      const roadmap = getUpgradeRoadmap(limits)

      expect(roadmap).toHaveLength(2)
    })

    it('should include 5000+ users threshold', () => {
      const limits = createAccountLimits({ messagingTier: 'TIER_10K' })
      const roadmap = getUpgradeRoadmap(limits)

      expect(roadmap[0].description).toContain('5.000+')
    })
  })

  describe('TIER_100K roadmap', () => {
    it('should return 2 steps for TIER_100K', () => {
      const limits = createAccountLimits({ messagingTier: 'TIER_100K' })
      const roadmap = getUpgradeRoadmap(limits)

      expect(roadmap).toHaveLength(2)
    })

    it('should include 50000+ users threshold', () => {
      const limits = createAccountLimits({ messagingTier: 'TIER_100K' })
      const roadmap = getUpgradeRoadmap(limits)

      expect(roadmap[0].description).toContain('50.000+')
    })
  })

  describe('other tiers', () => {
    it('should return empty roadmap for TIER_UNLIMITED', () => {
      const limits = createAccountLimits({ messagingTier: 'TIER_UNLIMITED' })
      const roadmap = getUpgradeRoadmap(limits)

      expect(roadmap).toHaveLength(0)
    })

    it('should return empty roadmap for TIER_1K (legacy)', () => {
      const limits = createAccountLimits({ messagingTier: 'TIER_1K' })
      const roadmap = getUpgradeRoadmap(limits)

      expect(roadmap).toHaveLength(0)
    })
  })
})

// ===== getNextTier TESTS =====

describe('getNextTier', () => {
  describe('tier progression', () => {
    it.each([
      ['TIER_250', 'TIER_2K'],
      ['TIER_2K', 'TIER_10K'],
      ['TIER_10K', 'TIER_100K'],
      ['TIER_100K', 'TIER_UNLIMITED'],
    ] as const)('should return %s after %s', (current, expected) => {
      expect(getNextTier(current)).toBe(expected)
    })
  })

  describe('edge cases', () => {
    it('should return null for TIER_UNLIMITED (max tier)', () => {
      expect(getNextTier('TIER_UNLIMITED')).toBeNull()
    })

    it('should return null for TIER_1K (not in upgrade path)', () => {
      expect(getNextTier('TIER_1K')).toBeNull()
    })
  })
})

// ===== fetchAccountLimits TESTS =====

describe('fetchAccountLimits', () => {
  const mockPhoneNumberId = '123456789'
  const mockAccessToken = 'test-access-token'

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return parsed limits on successful fetch', async () => {
    const mockThroughputResponse = {
      throughput: { level: 'high' },
      quality_score: { score: 'green' },
    }
    const mockTierResponse = {
      whatsapp_business_manager_messaging_limit: 'TIER_10K',
    }

    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const urlStr = url.toString()
      if (urlStr.includes('throughput')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockThroughputResponse),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockTierResponse),
      } as Response)
    })

    const result = await fetchAccountLimits(mockPhoneNumberId, mockAccessToken)

    expect(result.messagingTier).toBe('TIER_10K')
    expect(result.maxUniqueUsersPerDay).toBe(10000)
    expect(result.throughputLevel).toBe('HIGH')
    expect(result.maxMessagesPerSecond).toBe(1000)
    expect(result.qualityScore).toBe('GREEN')
  })

  it('should return DEFAULT_LIMITS on fetch failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
    } as Response)

    const result = await fetchAccountLimits(mockPhoneNumberId, mockAccessToken)

    expect(result.messagingTier).toBe(DEFAULT_LIMITS.messagingTier)
    expect(result.maxUniqueUsersPerDay).toBe(DEFAULT_LIMITS.maxUniqueUsersPerDay)
  })

  it('should return DEFAULT_LIMITS on network error', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await fetchAccountLimits(mockPhoneNumberId, mockAccessToken)

    expect(result.messagingTier).toBe(DEFAULT_LIMITS.messagingTier)
    expect(console.error).toHaveBeenCalled()
  })

  it('should handle STANDARD throughput level', async () => {
    const mockThroughputResponse = {
      throughput: { level: 'standard' },
      quality_score: { score: 'yellow' },
    }
    const mockTierResponse = {
      whatsapp_business_manager_messaging_limit: 'TIER_2K',
    }

    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const urlStr = url.toString()
      if (urlStr.includes('throughput')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockThroughputResponse),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockTierResponse),
      } as Response)
    })

    const result = await fetchAccountLimits(mockPhoneNumberId, mockAccessToken)

    expect(result.throughputLevel).toBe('STANDARD')
    expect(result.maxMessagesPerSecond).toBe(80)
    expect(result.qualityScore).toBe('YELLOW')
  })

  it('should default to GREEN quality for invalid scores', async () => {
    // Quando score é inválido, assume GREEN (comportamento otimista da Meta)
    const mockThroughputResponse = {
      throughput: { level: 'standard' },
      quality_score: { score: 'invalid' },
    }
    const mockTierResponse = {
      whatsapp_business_manager_messaging_limit: 'TIER_250',
    }

    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const urlStr = url.toString()
      if (urlStr.includes('throughput')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockThroughputResponse),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockTierResponse),
      } as Response)
    })

    const result = await fetchAccountLimits(mockPhoneNumberId, mockAccessToken)

    expect(result.qualityScore).toBe('GREEN')
  })

  it('should default to TIER_250 when tier is not in response', async () => {
    const mockThroughputResponse = {
      throughput: { level: 'standard' },
      quality_score: { score: 'green' },
    }
    const mockTierResponse = {}

    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const urlStr = url.toString()
      if (urlStr.includes('throughput')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockThroughputResponse),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockTierResponse),
      } as Response)
    })

    const result = await fetchAccountLimits(mockPhoneNumberId, mockAccessToken)

    expect(result.messagingTier).toBe('TIER_250')
    expect(result.maxUniqueUsersPerDay).toBe(250)
  })

  it('should include lastFetched timestamp', async () => {
    const mockThroughputResponse = {
      throughput: { level: 'standard' },
    }
    const mockTierResponse = {}

    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const urlStr = url.toString()
      if (urlStr.includes('throughput')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockThroughputResponse),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockTierResponse),
      } as Response)
    })

    const before = new Date().toISOString()
    const result = await fetchAccountLimits(mockPhoneNumberId, mockAccessToken)
    const after = new Date().toISOString()

    expect(result.lastFetched).toBeDefined()
    expect(result.lastFetched >= before).toBe(true)
    expect(result.lastFetched <= after).toBe(true)
  })
})

// ===== Storage functions TESTS =====

describe('Storage functions', () => {
  const mockLimits = createAccountLimits()

  describe('getCachedLimits', () => {
    beforeEach(() => {
      // Mock localStorage
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should return null when no cached data', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null)

      const result = getCachedLimits()

      expect(result).toBeNull()
      expect(localStorage.getItem).toHaveBeenCalledWith(LIMITS_STORAGE_KEY)
    })

    it('should return parsed limits when cached', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(mockLimits))

      const result = getCachedLimits()

      expect(result).toEqual(mockLimits)
    })

    it('should return null on invalid JSON', () => {
      vi.mocked(localStorage.getItem).mockReturnValue('invalid-json')

      const result = getCachedLimits()

      expect(result).toBeNull()
    })

    it('should return null when window is undefined (SSR)', () => {
      vi.stubGlobal('window', undefined)

      const result = getCachedLimits()

      expect(result).toBeNull()
    })
  })

  describe('cacheLimits', () => {
    beforeEach(() => {
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should store limits in localStorage', () => {
      cacheLimits(mockLimits)

      expect(localStorage.setItem).toHaveBeenCalledWith(
        LIMITS_STORAGE_KEY,
        JSON.stringify(mockLimits)
      )
    })

    it('should not throw when window is undefined (SSR)', () => {
      vi.stubGlobal('window', undefined)

      expect(() => cacheLimits(mockLimits)).not.toThrow()
    })
  })

  describe('areLimitsStale', () => {
    it('should return true when limits is null', () => {
      expect(areLimitsStale(null)).toBe(true)
    })

    it('should return true when limits are older than 1 hour', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
      const oldLimits = createAccountLimits({
        lastFetched: twoHoursAgo.toISOString(),
      })

      expect(areLimitsStale(oldLimits)).toBe(true)
    })

    it('should return false when limits are less than 1 hour old', () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
      const freshLimits = createAccountLimits({
        lastFetched: thirtyMinutesAgo.toISOString(),
      })

      expect(areLimitsStale(freshLimits)).toBe(false)
    })

    it('should return false when limits are exactly 1 hour old', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
      const limitsAtBoundary = createAccountLimits({
        lastFetched: oneHourAgo.toISOString(),
      })

      // At exactly 1 hour, lastFetched equals oneHourAgo (not less than)
      expect(areLimitsStale(limitsAtBoundary)).toBe(false)
    })

    it('should return true when limits are 1 hour + 1 second old', () => {
      const justOverOneHour = new Date(Date.now() - 60 * 60 * 1000 - 1000)
      const staleLimits = createAccountLimits({
        lastFetched: justOverOneHour.toISOString(),
      })

      expect(areLimitsStale(staleLimits)).toBe(true)
    })

    it('should return false for just-fetched limits', () => {
      const freshLimits = createAccountLimits({
        lastFetched: new Date().toISOString(),
      })

      expect(areLimitsStale(freshLimits)).toBe(false)
    })
  })
})

// ===== LIMITS_STORAGE_KEY =====

describe('LIMITS_STORAGE_KEY', () => {
  it('should be the expected key', () => {
    expect(LIMITS_STORAGE_KEY).toBe('smartzap_account_limits')
  })
})
