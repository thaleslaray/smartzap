import { describe, it, expect } from 'vitest'

import type { AppSettings } from '@/types'
import type { HealthServices } from '@/types/settings.types'
import {
  getHealthIssues,
  getHealthIssueMessages,
  computeScoreFromIssues,
  computeHealthScore,
  getHealthStatus,
  canSendWithSettings,
  areServicesHealthy,
  getCriticalServiceIssue,
  HEALTH_THRESHOLDS,
  SCORE_PENALTIES,
  HealthIssue,
} from './health'

// =============================================================================
// FIXTURES
// =============================================================================

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    phoneNumberId: '123456',
    businessAccountId: '789012',
    accessToken: 'token-abc',
    isConnected: true,
    testContact: { phone: '+5511999999999' },
    ...overrides,
  }
}

function makeHealthySettings(): AppSettings {
  return makeSettings()
}

function makeUnhealthySettings(): AppSettings {
  return makeSettings({
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    isConnected: false,
    testContact: undefined,
  })
}

// =============================================================================
// getHealthIssues
// =============================================================================

describe('getHealthIssues', () => {
  it('returns empty array for fully healthy settings', () => {
    const issues = getHealthIssues(makeHealthySettings())
    expect(issues).toEqual([])
  })

  it('detects disconnected state', () => {
    const issues = getHealthIssues(makeSettings({ isConnected: false }))
    const codes = issues.map((i) => i.code)
    expect(codes).toContain('DISCONNECTED')
  })

  it('detects missing phoneNumberId', () => {
    const issues = getHealthIssues(makeSettings({ phoneNumberId: '' }))
    const codes = issues.map((i) => i.code)
    expect(codes).toContain('MISSING_PHONE_NUMBER_ID')
  })

  it('detects missing businessAccountId', () => {
    const issues = getHealthIssues(makeSettings({ businessAccountId: '' }))
    const codes = issues.map((i) => i.code)
    expect(codes).toContain('MISSING_BUSINESS_ACCOUNT_ID')
  })

  it('detects missing accessToken', () => {
    const issues = getHealthIssues(makeSettings({ accessToken: '' }))
    const codes = issues.map((i) => i.code)
    expect(codes).toContain('MISSING_ACCESS_TOKEN')
  })

  it('detects LOW quality rating when connected', () => {
    const issues = getHealthIssues(makeSettings({ qualityRating: 'LOW' }))
    const codes = issues.map((i) => i.code)
    expect(codes).toContain('LOW_QUALITY_RATING')
  })

  it('detects RED quality rating when connected', () => {
    const issues = getHealthIssues(makeSettings({ qualityRating: 'RED' }))
    const codes = issues.map((i) => i.code)
    expect(codes).toContain('LOW_QUALITY_RATING')
  })

  it('ignores quality rating when disconnected', () => {
    const issues = getHealthIssues(makeSettings({ isConnected: false, qualityRating: 'LOW' }))
    const codes = issues.map((i) => i.code)
    expect(codes).not.toContain('LOW_QUALITY_RATING')
  })

  it('does not flag HIGH quality rating', () => {
    const issues = getHealthIssues(makeSettings({ qualityRating: 'HIGH' }))
    const codes = issues.map((i) => i.code)
    expect(codes).not.toContain('LOW_QUALITY_RATING')
  })

  it('detects missing test contact', () => {
    const issues = getHealthIssues(makeSettings({ testContact: undefined }))
    const codes = issues.map((i) => i.code)
    expect(codes).toContain('NO_TEST_CONTACT')
  })

  it('detects test contact with empty phone', () => {
    const issues = getHealthIssues(makeSettings({ testContact: { phone: '' } }))
    const codes = issues.map((i) => i.code)
    expect(codes).toContain('NO_TEST_CONTACT')
  })

  it('returns multiple issues for completely unconfigured settings', () => {
    const issues = getHealthIssues(makeUnhealthySettings())
    expect(issues.length).toBeGreaterThanOrEqual(4)
  })

  it('issues have correct severity levels', () => {
    const issues = getHealthIssues(makeUnhealthySettings())
    const disconnected = issues.find((i) => i.code === 'DISCONNECTED')
    expect(disconnected?.severity).toBe('critical')

    const noTest = issues.find((i) => i.code === 'NO_TEST_CONTACT')
    expect(noTest?.severity).toBe('info')
  })

  it('quality rating check is case-insensitive', () => {
    const issues = getHealthIssues(makeSettings({ qualityRating: 'low' }))
    const codes = issues.map((i) => i.code)
    expect(codes).toContain('LOW_QUALITY_RATING')
  })
})

// =============================================================================
// getHealthIssueMessages
// =============================================================================

describe('getHealthIssueMessages', () => {
  it('returns empty array for healthy settings', () => {
    expect(getHealthIssueMessages(makeHealthySettings())).toEqual([])
  })

  it('returns message strings', () => {
    const messages = getHealthIssueMessages(makeSettings({ isConnected: false }))
    expect(messages.length).toBeGreaterThan(0)
    expect(typeof messages[0]).toBe('string')
  })
})

// =============================================================================
// computeScoreFromIssues
// =============================================================================

describe('computeScoreFromIssues', () => {
  it('returns 100 when no issues', () => {
    expect(computeScoreFromIssues([])).toBe(100)
  })

  it('subtracts penalties from 100', () => {
    const issues: HealthIssue[] = [
      { code: 'TEST', message: '', severity: 'warning', scorePenalty: 20 },
    ]
    expect(computeScoreFromIssues(issues)).toBe(80)
  })

  it('sums multiple penalties', () => {
    const issues: HealthIssue[] = [
      { code: 'A', message: '', severity: 'critical', scorePenalty: 30 },
      { code: 'B', message: '', severity: 'warning', scorePenalty: 15 },
    ]
    expect(computeScoreFromIssues(issues)).toBe(55)
  })

  it('clamps to minimum of 0', () => {
    const issues: HealthIssue[] = [
      { code: 'A', message: '', severity: 'critical', scorePenalty: 60 },
      { code: 'B', message: '', severity: 'critical', scorePenalty: 60 },
    ]
    expect(computeScoreFromIssues(issues)).toBe(0)
  })

  it('clamps to maximum of 100', () => {
    const issues: HealthIssue[] = [
      { code: 'A', message: '', severity: 'info', scorePenalty: -20 },
    ]
    // 100 - (-20) = 120, clamped to 100
    expect(computeScoreFromIssues(issues)).toBe(100)
  })
})

// =============================================================================
// computeHealthScore
// =============================================================================

describe('computeHealthScore', () => {
  it('returns healthy result for full settings', () => {
    const result = computeHealthScore(makeHealthySettings())
    expect(result.isHealthy).toBe(true)
    expect(result.score).toBe(100)
    expect(result.issues).toEqual([])
  })

  it('returns unhealthy result for missing credentials', () => {
    const result = computeHealthScore(makeUnhealthySettings())
    expect(result.isHealthy).toBe(false)
    expect(result.score).toBeLessThan(HEALTH_THRESHOLDS.HEALTHY)
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('score reflects total penalties', () => {
    // Missing just phoneNumberId = -30 penalty => score 70
    // Also missing testContact adds -5 => score 65
    const result = computeHealthScore(makeSettings({ phoneNumberId: '', testContact: undefined }))
    expect(result.score).toBe(100 - SCORE_PENALTIES.MISSING_CREDENTIALS - SCORE_PENALTIES.NO_TEST_CONTACT)
  })
})

// =============================================================================
// getHealthStatus
// =============================================================================

describe('getHealthStatus', () => {
  it('returns healthy for score >= 80', () => {
    expect(getHealthStatus(80)).toBe('healthy')
    expect(getHealthStatus(100)).toBe('healthy')
  })

  it('returns degraded for score >= 50 and < 80', () => {
    expect(getHealthStatus(50)).toBe('degraded')
    expect(getHealthStatus(79)).toBe('degraded')
  })

  it('returns unhealthy for score < 50', () => {
    expect(getHealthStatus(0)).toBe('unhealthy')
    expect(getHealthStatus(49)).toBe('unhealthy')
  })

  it('boundary: 80 is healthy, 79 is degraded', () => {
    expect(getHealthStatus(80)).toBe('healthy')
    expect(getHealthStatus(79)).toBe('degraded')
  })

  it('boundary: 50 is degraded, 49 is unhealthy', () => {
    expect(getHealthStatus(50)).toBe('degraded')
    expect(getHealthStatus(49)).toBe('unhealthy')
  })
})

// =============================================================================
// canSendWithSettings
// =============================================================================

describe('canSendWithSettings', () => {
  it('can send with valid settings', () => {
    const result = canSendWithSettings(makeHealthySettings())
    expect(result.canSend).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('cannot send when disconnected', () => {
    const result = canSendWithSettings(makeSettings({ isConnected: false }))
    expect(result.canSend).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('cannot send without phoneNumberId', () => {
    const result = canSendWithSettings(makeSettings({ phoneNumberId: '' }))
    expect(result.canSend).toBe(false)
  })

  it('cannot send without accessToken', () => {
    const result = canSendWithSettings(makeSettings({ accessToken: '' }))
    expect(result.canSend).toBe(false)
  })

  it('cannot send with RED quality rating', () => {
    const result = canSendWithSettings(makeSettings({ qualityRating: 'RED' }))
    expect(result.canSend).toBe(false)
    expect(result.reason).toContain('RED')
  })

  it('can send with LOW quality rating (only RED blocks)', () => {
    const result = canSendWithSettings(makeSettings({ qualityRating: 'LOW' }))
    expect(result.canSend).toBe(true)
  })

  it('quality rating check is case-insensitive', () => {
    const result = canSendWithSettings(makeSettings({ qualityRating: 'red' }))
    expect(result.canSend).toBe(false)
  })

  it('can send without businessAccountId (not checked)', () => {
    const result = canSendWithSettings(makeSettings({ businessAccountId: '' }))
    expect(result.canSend).toBe(true)
  })
})

// =============================================================================
// areServicesHealthy
// =============================================================================

describe('areServicesHealthy', () => {
  it('returns true when all services are ok', () => {
    const services: HealthServices = {
      qstash: { status: 'ok' },
      database: { status: 'ok' },
      whatsapp: { status: 'ok' },
    }
    expect(areServicesHealthy(services)).toBe(true)
  })

  it('returns false when qstash is not ok', () => {
    const services: HealthServices = {
      qstash: { status: 'error' },
      database: { status: 'ok' },
      whatsapp: { status: 'ok' },
    }
    expect(areServicesHealthy(services)).toBe(false)
  })

  it('returns false when qstash is not_configured', () => {
    const services: HealthServices = {
      qstash: { status: 'not_configured' },
      database: { status: 'ok' },
      whatsapp: { status: 'ok' },
    }
    expect(areServicesHealthy(services)).toBe(false)
  })

  it('returns false when database is error', () => {
    const services: HealthServices = {
      qstash: { status: 'ok' },
      database: { status: 'error' },
      whatsapp: { status: 'ok' },
    }
    expect(areServicesHealthy(services)).toBe(false)
  })

  it('returns true when database is not_configured (not error)', () => {
    const services: HealthServices = {
      qstash: { status: 'ok' },
      database: { status: 'not_configured' },
      whatsapp: { status: 'ok' },
    }
    expect(areServicesHealthy(services)).toBe(true)
  })
})

// =============================================================================
// getCriticalServiceIssue
// =============================================================================

describe('getCriticalServiceIssue', () => {
  it('returns null when all services healthy', () => {
    const services: HealthServices = {
      qstash: { status: 'ok' },
      database: { status: 'ok' },
      whatsapp: { status: 'ok' },
    }
    expect(getCriticalServiceIssue(services)).toBeNull()
  })

  it('returns message for qstash not_configured', () => {
    const services: HealthServices = {
      qstash: { status: 'not_configured' },
      database: { status: 'ok' },
      whatsapp: { status: 'ok' },
    }
    const issue = getCriticalServiceIssue(services)
    expect(issue).toContain('QStash')
  })

  it('returns message for qstash error', () => {
    const services: HealthServices = {
      qstash: { status: 'error', message: 'Connection refused' },
      database: { status: 'ok' },
      whatsapp: { status: 'ok' },
    }
    expect(getCriticalServiceIssue(services)).toBe('Connection refused')
  })

  it('returns default message for qstash error without message', () => {
    const services: HealthServices = {
      qstash: { status: 'error' },
      database: { status: 'ok' },
      whatsapp: { status: 'ok' },
    }
    const issue = getCriticalServiceIssue(services)
    expect(issue).toContain('QStash')
  })

  it('returns message for database error', () => {
    const services: HealthServices = {
      qstash: { status: 'ok' },
      database: { status: 'error', message: 'DB down' },
      whatsapp: { status: 'ok' },
    }
    expect(getCriticalServiceIssue(services)).toBe('DB down')
  })

  it('returns default message for database error without message', () => {
    const services: HealthServices = {
      qstash: { status: 'ok' },
      database: { status: 'error' },
      whatsapp: { status: 'ok' },
    }
    const issue = getCriticalServiceIssue(services)
    expect(issue).toContain('banco de dados')
  })

  it('qstash not_configured takes priority over database error', () => {
    const services: HealthServices = {
      qstash: { status: 'not_configured' },
      database: { status: 'error', message: 'DB down' },
      whatsapp: { status: 'ok' },
    }
    const issue = getCriticalServiceIssue(services)
    expect(issue).toContain('QStash')
  })
})

// =============================================================================
// Constants
// =============================================================================

describe('constants', () => {
  it('HEALTH_THRESHOLDS has correct values', () => {
    expect(HEALTH_THRESHOLDS.HEALTHY).toBe(80)
    expect(HEALTH_THRESHOLDS.DEGRADED).toBe(50)
  })

  it('SCORE_PENALTIES has expected keys', () => {
    expect(SCORE_PENALTIES.MISSING_CREDENTIALS).toBe(30)
    expect(SCORE_PENALTIES.DISCONNECTED).toBe(40)
    expect(SCORE_PENALTIES.MISSING_OPTIONAL).toBe(10)
    expect(SCORE_PENALTIES.LOW_QUALITY).toBe(15)
    expect(SCORE_PENALTIES.NO_TEST_CONTACT).toBe(5)
  })
})
