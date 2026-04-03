import { describe, it, expect, vi, afterEach } from 'vitest'
import { isSuppressionActive } from './phone-suppressions'

describe('isSuppressionActive', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false when is_active is false', () => {
    expect(isSuppressionActive({ is_active: false, expires_at: null })).toBe(false)
  })

  it('returns false when is_active is false even with future expires_at', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    expect(isSuppressionActive({ is_active: false, expires_at: future })).toBe(false)
  })

  it('returns true when is_active is true and no expires_at', () => {
    expect(isSuppressionActive({ is_active: true, expires_at: null })).toBe(true)
  })

  it('returns true when is_active is true and expires_at is in the future', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString() // +1 day
    expect(isSuppressionActive({ is_active: true, expires_at: future })).toBe(true)
  })

  it('returns false when is_active is true but expires_at is in the past', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString() // -1 day
    expect(isSuppressionActive({ is_active: true, expires_at: past })).toBe(false)
  })

  it('returns true when expires_at is an invalid date string (not finite)', () => {
    // Invalid date => NaN => !Number.isFinite => returns true
    expect(isSuppressionActive({ is_active: true, expires_at: 'not-a-date' })).toBe(true)
  })

  it('returns true when expires_at is empty string (invalid date)', () => {
    expect(isSuppressionActive({ is_active: true, expires_at: '' })).toBe(true)
  })

  it('boundary: expires_at exactly at Date.now() returns false (not strictly greater)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'))

    const exactlyNow = new Date('2025-06-15T12:00:00Z').toISOString()
    // expiresMs === Date.now() => not > Date.now() => false
    expect(isSuppressionActive({ is_active: true, expires_at: exactlyNow })).toBe(false)
  })
})
