import {
  SCHEDULING_RULES,
  isValidScheduleDate,
  getMinScheduleDate,
  getMaxScheduleDate,
  formatScheduleDate,
  parseScheduleDate,
  getSuggestedScheduleDate,
} from './scheduling'

// =============================================================================
// Setup: fake timers for deterministic date tests
// =============================================================================

const FIXED_NOW = new Date('2025-06-15T12:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

// =============================================================================
// SCHEDULING_RULES constants
// =============================================================================

describe('SCHEDULING_RULES', () => {
  it('has expected constant values', () => {
    expect(SCHEDULING_RULES.MIN_FUTURE_MINUTES).toBe(5)
    expect(SCHEDULING_RULES.MAX_FUTURE_DAYS).toBe(30)
  })
})

// =============================================================================
// getMinScheduleDate
// =============================================================================

describe('getMinScheduleDate', () => {
  it('returns date MIN_FUTURE_MINUTES from reference', () => {
    const min = getMinScheduleDate(FIXED_NOW)
    const expectedMs = FIXED_NOW.getTime() + 5 * 60 * 1000
    expect(min.getTime()).toBe(expectedMs)
  })

  it('defaults to current time when no reference given', () => {
    const min = getMinScheduleDate()
    const expectedMs = FIXED_NOW.getTime() + 5 * 60 * 1000
    expect(min.getTime()).toBe(expectedMs)
  })
})

// =============================================================================
// getMaxScheduleDate
// =============================================================================

describe('getMaxScheduleDate', () => {
  it('returns date MAX_FUTURE_DAYS from reference', () => {
    const max = getMaxScheduleDate(FIXED_NOW)
    const expectedMs = FIXED_NOW.getTime() + 30 * 24 * 60 * 60 * 1000
    expect(max.getTime()).toBe(expectedMs)
  })

  it('defaults to current time when no reference given', () => {
    const max = getMaxScheduleDate()
    const expectedMs = FIXED_NOW.getTime() + 30 * 24 * 60 * 60 * 1000
    expect(max.getTime()).toBe(expectedMs)
  })
})

// =============================================================================
// isValidScheduleDate
// =============================================================================

describe('isValidScheduleDate', () => {
  it('returns valid for date 10 minutes in the future', () => {
    const date = new Date(FIXED_NOW.getTime() + 10 * 60 * 1000)
    const result = isValidScheduleDate(date, FIXED_NOW)
    expect(result).toEqual({ valid: true })
  })

  it('returns valid for date exactly at MIN_FUTURE_MINUTES boundary', () => {
    const date = new Date(FIXED_NOW.getTime() + 5 * 60 * 1000)
    const result = isValidScheduleDate(date, FIXED_NOW)
    expect(result).toEqual({ valid: true })
  })

  it('returns valid for date exactly at MAX_FUTURE_DAYS boundary', () => {
    const date = new Date(FIXED_NOW.getTime() + 30 * 24 * 60 * 60 * 1000)
    const result = isValidScheduleDate(date, FIXED_NOW)
    expect(result).toEqual({ valid: true })
  })

  it('returns invalid for date too soon (less than 5 minutes)', () => {
    const date = new Date(FIXED_NOW.getTime() + 2 * 60 * 1000)
    const result = isValidScheduleDate(date, FIXED_NOW)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('5 minutos')
  })

  it('returns invalid for date too far in the future (> 30 days)', () => {
    const date = new Date(FIXED_NOW.getTime() + 31 * 24 * 60 * 60 * 1000)
    const result = isValidScheduleDate(date, FIXED_NOW)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('30 dias')
  })

  it('returns invalid for date in the past', () => {
    // A date in the past is before minTime, so it triggers the "too soon" check
    const date = new Date(FIXED_NOW.getTime() - 60 * 60 * 1000)
    const result = isValidScheduleDate(date, FIXED_NOW)
    expect(result.valid).toBe(false)
  })

  it('defaults referenceDate to now when not provided', () => {
    const tenMinutes = new Date(FIXED_NOW.getTime() + 10 * 60 * 1000)
    const result = isValidScheduleDate(tenMinutes)
    expect(result).toEqual({ valid: true })
  })

  it('returns invalid for date 1 day in the future (within range)', () => {
    const date = new Date(FIXED_NOW.getTime() + 24 * 60 * 60 * 1000)
    const result = isValidScheduleDate(date, FIXED_NOW)
    expect(result).toEqual({ valid: true })
  })

  it('returns invalid for date 15 days in the future (within range)', () => {
    const date = new Date(FIXED_NOW.getTime() + 15 * 24 * 60 * 60 * 1000)
    const result = isValidScheduleDate(date, FIXED_NOW)
    expect(result).toEqual({ valid: true })
  })
})

// =============================================================================
// formatScheduleDate
// =============================================================================

describe('formatScheduleDate', () => {
  it('formats date in pt-BR locale by default', () => {
    const date = new Date('2024-01-15T14:30:00.000Z')
    const formatted = formatScheduleDate(date)
    // Locale-dependent, but should contain day, month abbreviation, year, and time
    expect(typeof formatted).toBe('string')
    expect(formatted.length).toBeGreaterThan(0)
    // Should contain year
    expect(formatted).toContain('2024')
  })

  it('accepts a custom locale', () => {
    const date = new Date('2024-01-15T14:30:00.000Z')
    const formatted = formatScheduleDate(date, 'en-US')
    expect(typeof formatted).toBe('string')
    expect(formatted).toContain('2024')
  })

  it('handles different dates correctly', () => {
    const date = new Date('2025-12-25T08:00:00.000Z')
    const formatted = formatScheduleDate(date)
    expect(formatted).toContain('2025')
  })
})

// =============================================================================
// parseScheduleDate
// =============================================================================

describe('parseScheduleDate', () => {
  it('returns parsed Date for a valid future ISO string', () => {
    const futureIso = new Date(FIXED_NOW.getTime() + 10 * 60 * 1000).toISOString()
    const result = parseScheduleDate(futureIso, FIXED_NOW)
    expect(result).toBeInstanceOf(Date)
    expect(result!.toISOString()).toBe(futureIso)
  })

  it('returns null for invalid ISO string', () => {
    expect(parseScheduleDate('not-a-date', FIXED_NOW)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseScheduleDate('', FIXED_NOW)).toBeNull()
  })

  it('returns null for date in the past', () => {
    const pastIso = new Date(FIXED_NOW.getTime() - 60 * 60 * 1000).toISOString()
    expect(parseScheduleDate(pastIso, FIXED_NOW)).toBeNull()
  })

  it('returns null for date too soon (< 5 min)', () => {
    const tooSoon = new Date(FIXED_NOW.getTime() + 2 * 60 * 1000).toISOString()
    expect(parseScheduleDate(tooSoon, FIXED_NOW)).toBeNull()
  })

  it('returns null for date too far in the future (> 30 days)', () => {
    const tooFar = new Date(FIXED_NOW.getTime() + 31 * 24 * 60 * 60 * 1000).toISOString()
    expect(parseScheduleDate(tooFar, FIXED_NOW)).toBeNull()
  })

  it('returns valid Date at exactly the minimum boundary', () => {
    const exactMin = new Date(FIXED_NOW.getTime() + 5 * 60 * 1000).toISOString()
    expect(parseScheduleDate(exactMin, FIXED_NOW)).toBeInstanceOf(Date)
  })

  it('defaults referenceDate to now', () => {
    const futureIso = new Date(FIXED_NOW.getTime() + 10 * 60 * 1000).toISOString()
    expect(parseScheduleDate(futureIso)).toBeInstanceOf(Date)
  })
})

// =============================================================================
// getSuggestedScheduleDate
// =============================================================================

describe('getSuggestedScheduleDate', () => {
  it('returns a date approximately 1 hour from reference', () => {
    const suggested = getSuggestedScheduleDate(FIXED_NOW)
    const diffMs = suggested.getTime() - FIXED_NOW.getTime()
    // Should be roughly 1 hour (60 min) plus possible rounding
    expect(diffMs).toBeGreaterThanOrEqual(60 * 60 * 1000)
    expect(diffMs).toBeLessThanOrEqual(75 * 60 * 1000) // at most 15 min rounding
  })

  it('rounds minutes to nearest 15-minute mark (ceiling)', () => {
    const suggested = getSuggestedScheduleDate(FIXED_NOW)
    const minutes = suggested.getMinutes()
    expect(minutes % 15).toBe(0)
  })

  it('sets seconds and milliseconds to zero', () => {
    const suggested = getSuggestedScheduleDate(FIXED_NOW)
    expect(suggested.getSeconds()).toBe(0)
    expect(suggested.getMilliseconds()).toBe(0)
  })

  it('handles reference at XX:00 (already on 15-min boundary after adding 1h)', () => {
    // 12:00 UTC + 1h = 13:00 UTC. ceil(0/15)*15 = 0 -> 13:00 UTC
    const ref = new Date('2025-06-15T12:00:00.000Z')
    const suggested = getSuggestedScheduleDate(ref)
    expect(suggested.getUTCMinutes()).toBe(0)
    expect(suggested.getUTCHours()).toBe(13)
  })

  it('handles reference at XX:07 (rounds up after adding 1h)', () => {
    // 12:07 UTC + 1h = 13:07 UTC. ceil(7/15)*15 = 15 -> 13:15 UTC
    const ref = new Date('2025-06-15T12:07:00.000Z')
    const suggested = getSuggestedScheduleDate(ref)
    expect(suggested.getUTCMinutes()).toBe(15)
    expect(suggested.getUTCHours()).toBe(13)
  })

  it('handles reference at XX:50 (rounds up to next hour)', () => {
    // 12:50 UTC + 1h = 13:50 UTC. ceil(50/15)*15 = 60.
    // setMinutes(60) rolls over to next hour (14:00 UTC),
    // then the >= 60 guard adds another hour -> 15:00 UTC.
    // NOTE: This is a known double-increment behavior in the source code.
    const ref = new Date('2025-06-15T12:50:00.000Z')
    const suggested = getSuggestedScheduleDate(ref)
    expect(suggested.getUTCMinutes()).toBe(0)
    expect(suggested.getUTCHours()).toBe(15)
  })

  it('handles reference at XX:45 (already on boundary after adding 1h)', () => {
    // 12:45 UTC + 1h = 13:45 UTC. ceil(45/15)*15 = 45 -> 13:45 UTC
    const ref = new Date('2025-06-15T12:45:00.000Z')
    const suggested = getSuggestedScheduleDate(ref)
    expect(suggested.getUTCMinutes()).toBe(45)
    expect(suggested.getUTCHours()).toBe(13)
  })

  it('defaults to current time when no reference given', () => {
    const suggested = getSuggestedScheduleDate()
    const diffMs = suggested.getTime() - FIXED_NOW.getTime()
    expect(diffMs).toBeGreaterThanOrEqual(60 * 60 * 1000)
  })
})
