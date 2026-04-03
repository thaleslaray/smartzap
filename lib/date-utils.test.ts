import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatTime, formatRelativeTime, formatShortDate } from './date-utils'

const FROZEN_NOW = new Date('2026-01-15T10:30:00')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FROZEN_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('formatTime', () => {
  it('formats a Date to HH:mm', () => {
    expect(formatTime(new Date('2026-01-15T09:05:00'))).toBe('09:05')
    expect(formatTime(new Date('2026-01-15T14:30:00'))).toBe('14:30')
    expect(formatTime(new Date('2026-01-15T00:00:00'))).toBe('00:00')
    expect(formatTime(new Date('2026-01-15T23:59:00'))).toBe('23:59')
  })

  it('accepts a string date', () => {
    expect(formatTime('2026-01-15T09:05:00')).toBe('09:05')
  })

  it('returns empty string for null and undefined', () => {
    expect(formatTime(null)).toBe('')
    expect(formatTime(undefined)).toBe('')
  })

  it('returns empty string for invalid date string', () => {
    expect(formatTime('not-a-date')).toBe('')
  })
})

describe('formatRelativeTime', () => {
  it('returns "agora" for dates less than 1 minute ago', () => {
    const tenSecondsAgo = new Date(FROZEN_NOW.getTime() - 10 * 1000)
    expect(formatRelativeTime(tenSecondsAgo)).toBe('agora')
  })

  it('returns singular minute', () => {
    const oneMinuteAgo = new Date(FROZEN_NOW.getTime() - 60 * 1000)
    expect(formatRelativeTime(oneMinuteAgo)).toBe('há 1 minuto')
  })

  it('returns plural minutes', () => {
    const fiveMinutesAgo = new Date(FROZEN_NOW.getTime() - 5 * 60 * 1000)
    expect(formatRelativeTime(fiveMinutesAgo)).toBe('há 5 minutos')
  })

  it('returns singular hour', () => {
    const oneHourAgo = new Date(FROZEN_NOW.getTime() - 60 * 60 * 1000)
    expect(formatRelativeTime(oneHourAgo)).toBe('há 1 hora')
  })

  it('returns plural hours', () => {
    const threeHoursAgo = new Date(FROZEN_NOW.getTime() - 3 * 60 * 60 * 1000)
    expect(formatRelativeTime(threeHoursAgo)).toBe('há 3 horas')
  })

  it('returns singular day', () => {
    const oneDayAgo = new Date(FROZEN_NOW.getTime() - 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(oneDayAgo)).toBe('há 1 dia')
  })

  it('returns plural days', () => {
    const threeDaysAgo = new Date(FROZEN_NOW.getTime() - 3 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(threeDaysAgo)).toBe('há 3 dias')
  })

  it('returns singular week', () => {
    const oneWeekAgo = new Date(FROZEN_NOW.getTime() - 7 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(oneWeekAgo)).toBe('há 1 semana')
  })

  it('returns plural weeks', () => {
    const twoWeeksAgo = new Date(FROZEN_NOW.getTime() - 14 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(twoWeeksAgo)).toBe('há 2 semanas')
  })

  it('returns singular month', () => {
    const oneMonthAgo = new Date(FROZEN_NOW.getTime() - 31 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(oneMonthAgo)).toBe('há 1 mês')
  })

  it('returns plural months', () => {
    const threeMonthsAgo = new Date(FROZEN_NOW.getTime() - 91 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(threeMonthsAgo)).toBe('há 3 meses')
  })

  it('returns singular year', () => {
    const oneYearAgo = new Date(FROZEN_NOW.getTime() - 366 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(oneYearAgo)).toBe('há 1 ano')
  })

  it('returns plural years', () => {
    const twoYearsAgo = new Date(FROZEN_NOW.getTime() - 730 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(twoYearsAgo)).toBe('há 2 anos')
  })

  it('returns "em breve" for future dates', () => {
    const future = new Date(FROZEN_NOW.getTime() + 60 * 60 * 1000)
    expect(formatRelativeTime(future)).toBe('em breve')
  })

  it('returns empty string for null/undefined', () => {
    expect(formatRelativeTime(null)).toBe('')
    expect(formatRelativeTime(undefined)).toBe('')
  })

  it('returns empty string for invalid date', () => {
    expect(formatRelativeTime('garbage')).toBe('')
  })

  it('accepts string dates', () => {
    const fiveMinutesAgo = new Date(FROZEN_NOW.getTime() - 5 * 60 * 1000)
    expect(formatRelativeTime(fiveMinutesAgo.toISOString())).toBe('há 5 minutos')
  })
})

describe('formatShortDate', () => {
  it('returns "hoje" for today', () => {
    expect(formatShortDate(FROZEN_NOW)).toBe('hoje')
  })

  it('returns "ontem" for yesterday', () => {
    const yesterday = new Date('2026-01-14T15:00:00')
    expect(formatShortDate(yesterday)).toBe('ontem')
  })

  it('returns "DD mes" for older dates', () => {
    expect(formatShortDate(new Date('2026-01-10T12:00:00'))).toBe('10 jan')
    expect(formatShortDate(new Date('2025-12-25T12:00:00'))).toBe('25 dez')
    expect(formatShortDate(new Date('2026-02-01T12:00:00'))).toBe('1 fev')
  })

  it('returns empty string for null/undefined', () => {
    expect(formatShortDate(null)).toBe('')
    expect(formatShortDate(undefined)).toBe('')
  })

  it('returns empty string for invalid date', () => {
    expect(formatShortDate('not-a-date')).toBe('')
  })

  it('accepts string dates', () => {
    expect(formatShortDate('2026-01-15T08:00:00')).toBe('hoje')
  })
})
