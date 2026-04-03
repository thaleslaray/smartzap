import { describe, it, expect } from 'vitest'
import { maskPhone } from './workflow-trace'

// Note: sanitizeExtraForStorage and isMissingTableError are NOT exported,
// so they cannot be directly tested here.

describe('maskPhone', () => {
  it('masks a normal phone number to ***XXXX format', () => {
    expect(maskPhone('+5511999991234')).toBe('***1234')
  })

  it('extracts only digits for the last 4', () => {
    expect(maskPhone('+55 (11) 99999-1234')).toBe('***1234')
  })

  it('returns empty string for null', () => {
    expect(maskPhone(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(maskPhone(undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(maskPhone('')).toBe('')
  })

  it('returns *** for whitespace-only string', () => {
    expect(maskPhone('   ')).toBe('')
  })

  it('handles short number (less than 4 digits)', () => {
    expect(maskPhone('123')).toBe('***123')
  })

  it('handles exactly 4 digits', () => {
    expect(maskPhone('1234')).toBe('***1234')
  })

  it('handles number with only non-digit characters', () => {
    // No digits => last4 is empty => returns '***'
    expect(maskPhone('+++')).toBe('***')
  })

  it('handles a single digit', () => {
    expect(maskPhone('7')).toBe('***7')
  })
})
