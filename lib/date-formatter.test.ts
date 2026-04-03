import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatDateISO,
  formatDateTimeISO,
  formatDatePtBR,
  formatDateTimePtBR,
  formatDateTimePtBRCustom,
  formatRelativeTime,
  formatDateShort,
  formatDateFull,
  formatDateTimeFull,
} from './date-formatter'

const FROZEN_NOW = new Date('2026-01-15T10:30:00Z')

describe('formatDateISO', () => {
  it('formats Date to YYYY-MM-DD', () => {
    expect(formatDateISO(new Date('2026-01-15T14:30:00Z'))).toBe('2026-01-15')
  })

  it('formats string date to YYYY-MM-DD', () => {
    expect(formatDateISO('2026-01-15T14:30:00Z')).toBe('2026-01-15')
  })

  it('returns dash for null/undefined', () => {
    expect(formatDateISO(null)).toBe('—')
    expect(formatDateISO(undefined)).toBe('—')
  })

  it('returns dash for invalid date', () => {
    expect(formatDateISO('not-a-date')).toBe('—')
  })
})

describe('formatDateTimeISO', () => {
  it('formats Date to YYYY-MM-DD HH:mm', () => {
    expect(formatDateTimeISO(new Date('2026-01-15T14:30:00Z'))).toBe('2026-01-15 14:30')
  })

  it('formats string date', () => {
    expect(formatDateTimeISO('2026-01-15T09:05:30Z')).toBe('2026-01-15 09:05')
  })

  it('returns dash for null/undefined', () => {
    expect(formatDateTimeISO(null)).toBe('—')
    expect(formatDateTimeISO(undefined)).toBe('—')
  })

  it('returns dash for invalid date', () => {
    expect(formatDateTimeISO('garbage')).toBe('—')
  })
})

describe('formatDatePtBR', () => {
  it('formats Date using pt-BR locale', () => {
    const result = formatDatePtBR(new Date('2026-01-15T14:30:00Z'))
    // toLocaleDateString pt-BR produces DD/MM/YYYY
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
  })

  it('returns dash for null/undefined', () => {
    expect(formatDatePtBR(null)).toBe('—')
    expect(formatDatePtBR(undefined)).toBe('—')
  })

  it('returns dash for invalid date', () => {
    expect(formatDatePtBR('not-a-date')).toBe('—')
  })
})

describe('formatDateTimePtBR', () => {
  it('formats Date/time using pt-BR locale', () => {
    const result = formatDateTimePtBR(new Date('2026-01-15T14:30:00Z'))
    expect(result).toBeTruthy()
    expect(result).not.toBe('—')
  })

  it('returns dash for null/undefined', () => {
    expect(formatDateTimePtBR(null)).toBe('—')
    expect(formatDateTimePtBR(undefined)).toBe('—')
  })

  it('returns dash for invalid date', () => {
    expect(formatDateTimePtBR('invalid')).toBe('—')
  })
})

describe('formatDateTimePtBRCustom', () => {
  it('formats with custom Intl options', () => {
    const result = formatDateTimePtBRCustom(new Date('2026-01-15T14:30:00Z'), {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    expect(result).toBeTruthy()
    expect(result).not.toBe('—')
  })

  it('returns dash for null/undefined', () => {
    expect(formatDateTimePtBRCustom(null, {})).toBe('—')
    expect(formatDateTimePtBRCustom(undefined, {})).toBe('—')
  })

  it('returns dash for invalid date', () => {
    expect(formatDateTimePtBRCustom('invalid', { year: 'numeric' })).toBe('—')
  })
})

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FROZEN_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "agora" for less than 1 minute ago', () => {
    const tenSecondsAgo = new Date(FROZEN_NOW.getTime() - 10 * 1000)
    expect(formatRelativeTime(tenSecondsAgo)).toBe('agora')
  })

  it('returns minutes format', () => {
    const fiveMinutesAgo = new Date(FROZEN_NOW.getTime() - 5 * 60 * 1000)
    expect(formatRelativeTime(fiveMinutesAgo)).toBe('5min')
  })

  it('returns hours format', () => {
    const threeHoursAgo = new Date(FROZEN_NOW.getTime() - 3 * 60 * 60 * 1000)
    expect(formatRelativeTime(threeHoursAgo)).toBe('3h')
  })

  it('returns days format', () => {
    const twoDaysAgo = new Date(FROZEN_NOW.getTime() - 2 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(twoDaysAgo)).toBe('2d')
  })

  it('falls back to ISO date for 7+ days', () => {
    const tenDaysAgo = new Date(FROZEN_NOW.getTime() - 10 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(tenDaysAgo)).toBe('2026-01-05')
  })

  it('returns dash for null/undefined', () => {
    expect(formatRelativeTime(null)).toBe('—')
    expect(formatRelativeTime(undefined)).toBe('—')
  })

  it('returns dash for invalid date', () => {
    expect(formatRelativeTime('garbage')).toBe('—')
  })

  it('accepts string dates', () => {
    const fiveMinutesAgo = new Date(FROZEN_NOW.getTime() - 5 * 60 * 1000)
    expect(formatRelativeTime(fiveMinutesAgo.toISOString())).toBe('5min')
  })
})

describe('formatDateShort', () => {
  it('formats Date to DD/MM', () => {
    expect(formatDateShort(new Date('2026-01-15T14:30:00'))).toBe('15/01')
    expect(formatDateShort(new Date('2026-12-05T00:00:00'))).toBe('05/12')
  })

  it('formats string date', () => {
    expect(formatDateShort('2026-03-09T10:00:00')).toBe('09/03')
  })

  it('returns dash for null/undefined', () => {
    expect(formatDateShort(null)).toBe('—')
    expect(formatDateShort(undefined)).toBe('—')
  })

  it('returns dash for invalid date', () => {
    expect(formatDateShort('invalid')).toBe('—')
  })
})

describe('formatDateFull', () => {
  it('formats Date to DD/MM/YYYY', () => {
    expect(formatDateFull(new Date('2026-01-15T14:30:00'))).toBe('15/01/2026')
  })

  it('formats string date', () => {
    expect(formatDateFull('2026-01-15T14:30:00')).toBe('15/01/2026')
  })

  it('pads single-digit day and month', () => {
    expect(formatDateFull(new Date('2026-03-05T00:00:00'))).toBe('05/03/2026')
  })

  it('returns dash for null/undefined', () => {
    expect(formatDateFull(null)).toBe('—')
    expect(formatDateFull(undefined)).toBe('—')
  })

  it('returns dash for invalid date', () => {
    expect(formatDateFull('invalid')).toBe('—')
  })
})

describe('formatDateTimeFull', () => {
  it('formats Date to DD/MM/YYYY HH:mm', () => {
    expect(formatDateTimeFull(new Date('2026-01-15T14:30:00'))).toBe('15/01/2026 14:30')
  })

  it('formats string date', () => {
    expect(formatDateTimeFull('2026-01-15T09:05:00')).toBe('15/01/2026 09:05')
  })

  it('pads single-digit values', () => {
    expect(formatDateTimeFull(new Date('2026-03-05T03:07:00'))).toBe('05/03/2026 03:07')
  })

  it('returns dash for null/undefined', () => {
    expect(formatDateTimeFull(null)).toBe('—')
    expect(formatDateTimeFull(undefined)).toBe('—')
  })

  it('returns dash for invalid date', () => {
    expect(formatDateTimeFull('not-valid')).toBe('—')
  })
})
