import { describe, it, expect } from 'vitest'
import {
  shouldAutoSuppressFailureCode,
  computeAutoSuppressionTtlDaysFromConfig,
  type AutoSuppressionConfig,
} from './auto-suppression'

// ---------------------------------------------------------------------------
// shouldAutoSuppressFailureCode
// ---------------------------------------------------------------------------
describe('shouldAutoSuppressFailureCode', () => {
  it('returns true for 131026', () => {
    expect(shouldAutoSuppressFailureCode(131026)).toBe(true)
  })

  it('returns false for 131042 (payment error)', () => {
    expect(shouldAutoSuppressFailureCode(131042)).toBe(false)
  })

  it('returns false for 0', () => {
    expect(shouldAutoSuppressFailureCode(0)).toBe(false)
  })

  it('returns false for random error code', () => {
    expect(shouldAutoSuppressFailureCode(999999)).toBe(false)
  })

  it('returns false for negative code', () => {
    expect(shouldAutoSuppressFailureCode(-1)).toBe(false)
  })

  it('returns false for 131056 (pair rate limit)', () => {
    expect(shouldAutoSuppressFailureCode(131056)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// computeAutoSuppressionTtlDaysFromConfig
// ---------------------------------------------------------------------------
describe('computeAutoSuppressionTtlDaysFromConfig', () => {
  const cfg: AutoSuppressionConfig = {
    enabled: true,
    undeliverable131026: {
      enabled: true,
      windowDays: 30,
      threshold: 1,
      ttlBaseDays: 90,
      ttl2Days: 180,
      ttl3Days: 365,
    },
  }

  it('returns 0 for non-131026 failure code', () => {
    expect(computeAutoSuppressionTtlDaysFromConfig({ cfg, failureCode: 131042, recentCount: 5 })).toBe(0)
  })

  it('returns ttl3Days when recentCount >= 3', () => {
    expect(computeAutoSuppressionTtlDaysFromConfig({ cfg, failureCode: 131026, recentCount: 3 })).toBe(365)
  })

  it('returns ttl3Days when recentCount is much greater than 3', () => {
    expect(computeAutoSuppressionTtlDaysFromConfig({ cfg, failureCode: 131026, recentCount: 100 })).toBe(365)
  })

  it('returns ttl2Days when recentCount >= 2 and < 3', () => {
    expect(computeAutoSuppressionTtlDaysFromConfig({ cfg, failureCode: 131026, recentCount: 2 })).toBe(180)
  })

  it('returns ttlBaseDays when recentCount < 2', () => {
    expect(computeAutoSuppressionTtlDaysFromConfig({ cfg, failureCode: 131026, recentCount: 1 })).toBe(90)
  })

  it('returns ttlBaseDays when recentCount is 0', () => {
    expect(computeAutoSuppressionTtlDaysFromConfig({ cfg, failureCode: 131026, recentCount: 0 })).toBe(90)
  })

  it('uses custom config values correctly', () => {
    const customCfg: AutoSuppressionConfig = {
      enabled: true,
      undeliverable131026: {
        enabled: true,
        windowDays: 7,
        threshold: 2,
        ttlBaseDays: 30,
        ttl2Days: 60,
        ttl3Days: 120,
      },
    }

    expect(computeAutoSuppressionTtlDaysFromConfig({ cfg: customCfg, failureCode: 131026, recentCount: 1 })).toBe(30)
    expect(computeAutoSuppressionTtlDaysFromConfig({ cfg: customCfg, failureCode: 131026, recentCount: 2 })).toBe(60)
    expect(computeAutoSuppressionTtlDaysFromConfig({ cfg: customCfg, failureCode: 131026, recentCount: 3 })).toBe(120)
  })
})
