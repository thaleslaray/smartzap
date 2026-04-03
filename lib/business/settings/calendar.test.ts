import { describe, it, expect } from 'vitest'

import type { WorkingHoursDay, CalendarBookingConfig } from '@/types'
import {
  parseTimeToMinutes,
  minutesToTime,
  validateTimeFormat,
  validateWorkingHours,
  validateWorkingHoursDay,
  validateCalendarConfig,
  validateCalendarBookingConfig,
  isWithinWorkingHours,
  isWorkingDay,
  getWorkingHoursForDate,
  getAvailableSlots,
  getAvailableSlotsForDate,
  countSlotsInDay,
  DEFAULT_WORKING_HOURS,
  MIN_SLOT_DURATION,
  MAX_SLOT_DURATION,
  WEEKDAY_ORDER,
} from './calendar'

// =============================================================================
// parseTimeToMinutes
// =============================================================================

describe('parseTimeToMinutes', () => {
  it('parses 09:00 to 540', () => {
    expect(parseTimeToMinutes('09:00')).toBe(540)
  })

  it('parses 00:00 to 0', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0)
  })

  it('parses 23:59 to 1439', () => {
    expect(parseTimeToMinutes('23:59')).toBe(1439)
  })

  it('parses 18:30 to 1110', () => {
    expect(parseTimeToMinutes('18:30')).toBe(1110)
  })

  it('handles single-digit hours like 9:00', () => {
    expect(parseTimeToMinutes('9:00')).toBe(540)
  })

  it('returns null for empty string', () => {
    expect(parseTimeToMinutes('')).toBeNull()
  })

  it('returns null for invalid format', () => {
    expect(parseTimeToMinutes('invalid')).toBeNull()
  })

  it('returns null for out-of-range hours (24:00)', () => {
    expect(parseTimeToMinutes('24:00')).toBeNull()
  })

  it('returns null for out-of-range minutes (09:60)', () => {
    expect(parseTimeToMinutes('09:60')).toBeNull()
  })

  it('returns null for non-string input', () => {
    expect(parseTimeToMinutes(null as unknown as string)).toBeNull()
    expect(parseTimeToMinutes(undefined as unknown as string)).toBeNull()
  })

  it('returns null for partial format (09)', () => {
    expect(parseTimeToMinutes('09')).toBeNull()
  })

  it('returns null for format with seconds (09:00:00)', () => {
    expect(parseTimeToMinutes('09:00:00')).toBeNull()
  })
})

// =============================================================================
// minutesToTime
// =============================================================================

describe('minutesToTime', () => {
  it('converts 540 to 09:00', () => {
    expect(minutesToTime(540)).toBe('09:00')
  })

  it('converts 0 to 00:00', () => {
    expect(minutesToTime(0)).toBe('00:00')
  })

  it('converts 1439 to 23:59', () => {
    expect(minutesToTime(1439)).toBe('23:59')
  })

  it('converts 1110 to 18:30', () => {
    expect(minutesToTime(1110)).toBe('18:30')
  })

  it('wraps around for values >= 1440 (24h)', () => {
    expect(minutesToTime(1440)).toBe('00:00')
  })

  it('pads single-digit hours', () => {
    expect(minutesToTime(60)).toBe('01:00')
  })

  it('pads single-digit minutes', () => {
    expect(minutesToTime(5)).toBe('00:05')
  })
})

// =============================================================================
// validateTimeFormat
// =============================================================================

describe('validateTimeFormat', () => {
  it('valid for correct format', () => {
    expect(validateTimeFormat('09:00')).toEqual({ valid: true })
  })

  it('invalid for bad format', () => {
    const result = validateTimeFormat('abc')
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('invalid for out-of-range time', () => {
    const result = validateTimeFormat('25:00')
    expect(result.valid).toBe(false)
  })
})

// =============================================================================
// validateWorkingHours
// =============================================================================

describe('validateWorkingHours', () => {
  it('valid for normal working hours', () => {
    const result = validateWorkingHours({ start: '09:00', end: '18:00' })
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('invalid when start >= end', () => {
    const result = validateWorkingHours({ start: '18:00', end: '09:00' })
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('invalid when start equals end', () => {
    const result = validateWorkingHours({ start: '09:00', end: '09:00' })
    expect(result.valid).toBe(false)
  })

  it('invalid when period is less than 30 minutes', () => {
    const result = validateWorkingHours({ start: '09:00', end: '09:20' })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('30 minutos'))).toBe(true)
  })

  it('valid for exactly 30 minutes', () => {
    const result = validateWorkingHours({ start: '09:00', end: '09:30' })
    expect(result.valid).toBe(true)
  })

  it('invalid for bad start time format', () => {
    const result = validateWorkingHours({ start: 'abc', end: '18:00' })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('inicio'))).toBe(true)
  })

  it('invalid for bad end time format', () => {
    const result = validateWorkingHours({ start: '09:00', end: 'xyz' })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('fim'))).toBe(true)
  })
})

// =============================================================================
// validateWorkingHoursDay
// =============================================================================

describe('validateWorkingHoursDay', () => {
  it('valid when day is disabled', () => {
    const day: WorkingHoursDay = { day: 'sat', enabled: false, start: '', end: '' }
    const result = validateWorkingHoursDay(day)
    expect(result.valid).toBe(true)
  })

  it('validates hours when day is enabled', () => {
    const day: WorkingHoursDay = { day: 'mon', enabled: true, start: '09:00', end: '18:00' }
    const result = validateWorkingHoursDay(day)
    expect(result.valid).toBe(true)
  })

  it('invalid when enabled with bad hours', () => {
    const day: WorkingHoursDay = { day: 'mon', enabled: true, start: '18:00', end: '09:00' }
    const result = validateWorkingHoursDay(day)
    expect(result.valid).toBe(false)
  })
})

// =============================================================================
// validateCalendarConfig
// =============================================================================

describe('validateCalendarConfig', () => {
  it('valid when not enabled', () => {
    const result = validateCalendarConfig({
      enabled: false,
      workingHours: { start: '', end: '' },
      slotDuration: 0,
    })
    expect(result.valid).toBe(true)
  })

  it('valid for complete enabled config', () => {
    const result = validateCalendarConfig({
      enabled: true,
      calendarId: 'primary',
      workingHours: { start: '09:00', end: '18:00' },
      slotDuration: 30,
    })
    expect(result.valid).toBe(true)
  })

  it('invalid without calendarId when enabled', () => {
    const result = validateCalendarConfig({
      enabled: true,
      workingHours: { start: '09:00', end: '18:00' },
      slotDuration: 30,
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('calendario'))).toBe(true)
  })

  it('invalid when slotDuration is below minimum', () => {
    const result = validateCalendarConfig({
      enabled: true,
      calendarId: 'primary',
      workingHours: { start: '09:00', end: '18:00' },
      slotDuration: 5,
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes(`${MIN_SLOT_DURATION}`))).toBe(true)
  })

  it('invalid when slotDuration exceeds maximum', () => {
    const result = validateCalendarConfig({
      enabled: true,
      calendarId: 'primary',
      workingHours: { start: '09:00', end: '18:00' },
      slotDuration: 300,
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes(`${MAX_SLOT_DURATION}`))).toBe(true)
  })

  it('invalid when slot duration exceeds working period', () => {
    const result = validateCalendarConfig({
      enabled: true,
      calendarId: 'primary',
      workingHours: { start: '09:00', end: '10:00' },
      slotDuration: 90,
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('maior que o periodo'))).toBe(true)
  })
})

// =============================================================================
// validateCalendarBookingConfig
// =============================================================================

describe('validateCalendarBookingConfig', () => {
  function makeBookingConfig(overrides: Partial<CalendarBookingConfig> = {}): CalendarBookingConfig {
    return {
      timezone: 'America/Sao_Paulo',
      slotDurationMinutes: 30,
      slotBufferMinutes: 10,
      workingHours: [
        { day: 'mon', enabled: true, start: '09:00', end: '18:00' },
        { day: 'tue', enabled: true, start: '09:00', end: '18:00' },
      ],
      ...overrides,
    }
  }

  it('valid for correct config', () => {
    const result = validateCalendarBookingConfig(makeBookingConfig())
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('invalid for slot duration below minimum', () => {
    const result = validateCalendarBookingConfig(makeBookingConfig({ slotDurationMinutes: 5 }))
    expect(result.valid).toBe(false)
  })

  it('invalid for slot duration above maximum', () => {
    const result = validateCalendarBookingConfig(makeBookingConfig({ slotDurationMinutes: 300 }))
    expect(result.valid).toBe(false)
  })

  it('invalid for negative buffer', () => {
    const result = validateCalendarBookingConfig(makeBookingConfig({ slotBufferMinutes: -1 }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('negativo'))).toBe(true)
  })

  it('invalid for buffer > 60', () => {
    const result = validateCalendarBookingConfig(makeBookingConfig({ slotBufferMinutes: 61 }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('60'))).toBe(true)
  })

  it('invalid when no days are enabled', () => {
    const result = validateCalendarBookingConfig(
      makeBookingConfig({
        workingHours: [
          { day: 'mon', enabled: false, start: '09:00', end: '18:00' },
        ],
      })
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('dia'))).toBe(true)
  })

  it('reports errors for invalid working hours per day', () => {
    const result = validateCalendarBookingConfig(
      makeBookingConfig({
        workingHours: [
          { day: 'mon', enabled: true, start: '18:00', end: '09:00' },
        ],
      })
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('Segunda'))).toBe(true)
  })
})

// =============================================================================
// isWithinWorkingHours
// =============================================================================

describe('isWithinWorkingHours', () => {
  const hours = { start: '09:00', end: '18:00' }

  it('returns true when time is within range', () => {
    const time = new Date('2024-01-15T10:30:00')
    expect(isWithinWorkingHours(time, hours)).toBe(true)
  })

  it('returns true at exactly start time', () => {
    const time = new Date('2024-01-15T09:00:00')
    expect(isWithinWorkingHours(time, hours)).toBe(true)
  })

  it('returns false at exactly end time (exclusive)', () => {
    const time = new Date('2024-01-15T18:00:00')
    expect(isWithinWorkingHours(time, hours)).toBe(false)
  })

  it('returns false before working hours', () => {
    const time = new Date('2024-01-15T08:59:00')
    expect(isWithinWorkingHours(time, hours)).toBe(false)
  })

  it('returns false after working hours', () => {
    const time = new Date('2024-01-15T19:00:00')
    expect(isWithinWorkingHours(time, hours)).toBe(false)
  })

  it('returns false for invalid working hours', () => {
    const time = new Date('2024-01-15T10:00:00')
    expect(isWithinWorkingHours(time, { start: 'bad', end: '18:00' })).toBe(false)
  })
})

// =============================================================================
// isWorkingDay
// =============================================================================

describe('isWorkingDay', () => {
  const workingDays: WorkingHoursDay[] = [
    { day: 'mon', enabled: true, start: '09:00', end: '18:00' },
    { day: 'tue', enabled: true, start: '09:00', end: '18:00' },
    { day: 'sat', enabled: false, start: '09:00', end: '12:00' },
  ]

  it('returns true for enabled working day', () => {
    // 2024-01-15T12:00:00 is Monday in local time
    const date = new Date('2024-01-15T12:00:00')
    expect(isWorkingDay(date, workingDays)).toBe(true)
  })

  it('returns false for disabled day', () => {
    // 2024-01-20T12:00:00 is Saturday in local time
    const date = new Date('2024-01-20T12:00:00')
    expect(isWorkingDay(date, workingDays)).toBe(false)
  })

  it('returns false for day not in config', () => {
    // 2024-01-17T12:00:00 is Wednesday in local time
    const date = new Date('2024-01-17T12:00:00')
    expect(isWorkingDay(date, workingDays)).toBe(false)
  })
})

// =============================================================================
// getWorkingHoursForDate
// =============================================================================

describe('getWorkingHoursForDate', () => {
  const workingDays: WorkingHoursDay[] = [
    { day: 'mon', enabled: true, start: '09:00', end: '18:00' },
    { day: 'sat', enabled: false, start: '09:00', end: '12:00' },
  ]

  it('returns hours for an enabled working day', () => {
    const date = new Date('2024-01-15T12:00:00') // Monday
    const hours = getWorkingHoursForDate(date, workingDays)
    expect(hours).toEqual({ start: '09:00', end: '18:00' })
  })

  it('returns null for a disabled day', () => {
    const date = new Date('2024-01-20T12:00:00') // Saturday
    expect(getWorkingHoursForDate(date, workingDays)).toBeNull()
  })

  it('returns null for a day not in config', () => {
    const date = new Date('2024-01-17T12:00:00') // Wednesday
    expect(getWorkingHoursForDate(date, workingDays)).toBeNull()
  })
})

// =============================================================================
// getAvailableSlots
// =============================================================================

describe('getAvailableSlots', () => {
  // Use local time format to avoid timezone issues
  const baseDate = new Date('2024-01-15T12:00:00')

  it('generates correct number of slots', () => {
    // 09:00-12:00, 30min slots = 6 slots
    const slots = getAvailableSlots(baseDate, { start: '09:00', end: '12:00' }, 30, [])
    expect(slots).toHaveLength(6)
  })

  it('slots start at correct times', () => {
    const slots = getAvailableSlots(baseDate, { start: '09:00', end: '10:30' }, 30, [])
    expect(slots).toHaveLength(3)
    expect(slots[0].getHours()).toBe(9)
    expect(slots[0].getMinutes()).toBe(0)
    expect(slots[1].getHours()).toBe(9)
    expect(slots[1].getMinutes()).toBe(30)
    expect(slots[2].getHours()).toBe(10)
    expect(slots[2].getMinutes()).toBe(0)
  })

  it('excludes booked slots', () => {
    // Create the booked slot with matching local date by constructing from baseDate
    const bookedSlot = new Date(baseDate)
    bookedSlot.setHours(9, 30, 0, 0)
    const slots = getAvailableSlots(baseDate, { start: '09:00', end: '10:30' }, 30, [bookedSlot])
    expect(slots).toHaveLength(2)
    expect(slots[0].getHours()).toBe(9)
    expect(slots[0].getMinutes()).toBe(0)
    expect(slots[1].getHours()).toBe(10)
    expect(slots[1].getMinutes()).toBe(0)
  })

  it('applies buffer between slots', () => {
    // 09:00-12:00, 30min slots + 15min buffer = 45min effective
    // Slots at: 09:00, 09:45, 10:30, 11:15 (11:15+30=11:45 <= 12:00)
    const slots = getAvailableSlots(baseDate, { start: '09:00', end: '12:00' }, 30, [], 15)
    expect(slots).toHaveLength(4)
    expect(slots[0].getMinutes()).toBe(0)
    expect(slots[1].getMinutes()).toBe(45)
  })

  it('does not include partial slots that would exceed end time', () => {
    // 09:00-10:00, 45min slots = only 1 slot (09:00-09:45 fits, 09:45-10:30 doesn't)
    const slots = getAvailableSlots(baseDate, { start: '09:00', end: '10:00' }, 45, [])
    expect(slots).toHaveLength(1)
  })

  it('returns empty array for invalid working hours', () => {
    const slots = getAvailableSlots(baseDate, { start: 'bad', end: '12:00' }, 30, [])
    expect(slots).toEqual([])
  })

  it('returns empty array when slot duration exceeds working period', () => {
    const slots = getAvailableSlots(baseDate, { start: '09:00', end: '09:30' }, 60, [])
    expect(slots).toEqual([])
  })
})

// =============================================================================
// getAvailableSlotsForDate
// =============================================================================

describe('getAvailableSlotsForDate', () => {
  it('returns slots for a working day', () => {
    const config: CalendarBookingConfig = {
      timezone: 'America/Sao_Paulo',
      slotDurationMinutes: 60,
      slotBufferMinutes: 0,
      workingHours: [
        { day: 'mon', enabled: true, start: '09:00', end: '12:00' },
      ],
    }
    const date = new Date('2024-01-15T12:00:00') // Monday in local time
    const slots = getAvailableSlotsForDate(date, config, [])
    expect(slots).toHaveLength(3) // 09:00, 10:00, 11:00
  })

  it('returns empty for non-working day', () => {
    const config: CalendarBookingConfig = {
      timezone: 'America/Sao_Paulo',
      slotDurationMinutes: 30,
      slotBufferMinutes: 0,
      workingHours: [
        { day: 'mon', enabled: true, start: '09:00', end: '18:00' },
      ],
    }
    const date = new Date('2024-01-16T12:00:00') // Tuesday in local time (not in config)
    const slots = getAvailableSlotsForDate(date, config, [])
    expect(slots).toEqual([])
  })
})

// =============================================================================
// countSlotsInDay
// =============================================================================

describe('countSlotsInDay', () => {
  it('counts slots without buffer', () => {
    // 09:00-18:00 = 540 min, 30 min slots = 18 slots
    expect(countSlotsInDay({ start: '09:00', end: '18:00' }, 30)).toBe(18)
  })

  it('counts slots with buffer', () => {
    // 09:00-18:00 = 540 min, 30 min slots + 10 min buffer = 40 min effective = 13 slots
    expect(countSlotsInDay({ start: '09:00', end: '18:00' }, 30, 10)).toBe(13)
  })

  it('returns 0 for invalid hours', () => {
    expect(countSlotsInDay({ start: 'bad', end: '18:00' }, 30)).toBe(0)
  })

  it('returns 0 when slot is bigger than working period', () => {
    expect(countSlotsInDay({ start: '09:00', end: '09:30' }, 60)).toBe(0)
  })

  it('handles exact fit', () => {
    // 09:00-10:00 = 60 min, 30 min slots = 2
    expect(countSlotsInDay({ start: '09:00', end: '10:00' }, 30)).toBe(2)
  })
})

// =============================================================================
// Constants
// =============================================================================

describe('constants', () => {
  it('DEFAULT_WORKING_HOURS is 09:00-18:00', () => {
    expect(DEFAULT_WORKING_HOURS).toEqual({ start: '09:00', end: '18:00' })
  })

  it('MIN_SLOT_DURATION is 15', () => {
    expect(MIN_SLOT_DURATION).toBe(15)
  })

  it('MAX_SLOT_DURATION is 240', () => {
    expect(MAX_SLOT_DURATION).toBe(240)
  })

  it('WEEKDAY_ORDER has 7 entries', () => {
    expect(WEEKDAY_ORDER).toHaveLength(7)
    expect(WEEKDAY_ORDER[0]).toBe('mon')
    expect(WEEKDAY_ORDER[6]).toBe('sun')
  })
})
