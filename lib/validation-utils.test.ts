import { describe, it, expect } from 'vitest'
import { clampInt, boolFromUnknown, parseIntOrDefault, parseFloatOrDefault } from './validation-utils'

describe('clampInt', () => {
  it('clamps a number within range', () => {
    expect(clampInt(50, 0, 100)).toBe(50)
  })

  it('clamps to max when value exceeds', () => {
    expect(clampInt(150, 0, 100)).toBe(100)
  })

  it('clamps to min when value is below', () => {
    expect(clampInt(-10, 0, 100)).toBe(0)
  })

  it('floors decimal values', () => {
    expect(clampInt(50.9, 0, 100)).toBe(50)
    expect(clampInt(50.1, 0, 100)).toBe(50)
  })

  it('parses string numbers', () => {
    expect(clampInt('50', 0, 100)).toBe(50)
    expect(clampInt('150', 0, 100)).toBe(100)
    expect(clampInt('-5', 0, 100)).toBe(0)
  })

  it('returns min for non-finite values', () => {
    expect(clampInt(NaN, 0, 100)).toBe(0)
    expect(clampInt(Infinity, 0, 100)).toBe(0)
    expect(clampInt(-Infinity, 0, 100)).toBe(0)
  })

  it('returns min for non-numeric values', () => {
    expect(clampInt('invalid', 0, 100)).toBe(0)
    expect(clampInt(null, 0, 100)).toBe(0)
    expect(clampInt(undefined, 0, 100)).toBe(0)
  })

  it('returns fallback instead of min when provided', () => {
    // Note: Number(null) === 0 which is finite, so null is treated as 0
    expect(clampInt('invalid', 0, 100, 25)).toBe(25)
    expect(clampInt(NaN, 0, 100, 42)).toBe(42)
    expect(clampInt(Infinity, 0, 100, 77)).toBe(77)
    expect(clampInt(undefined, 0, 100, 50)).toBe(50)
  })

  it('treats null as 0 since Number(null) is finite', () => {
    expect(clampInt(null, 0, 100, 50)).toBe(0)
    expect(clampInt(null, 10, 100, 50)).toBe(10)
  })

  it('ignores fallback when value is valid', () => {
    expect(clampInt(75, 0, 100, 50)).toBe(75)
  })
})

describe('boolFromUnknown', () => {
  it('returns boolean values as-is', () => {
    expect(boolFromUnknown(true)).toBe(true)
    expect(boolFromUnknown(false)).toBe(false)
  })

  it('converts truthy strings', () => {
    expect(boolFromUnknown('true')).toBe(true)
    expect(boolFromUnknown('TRUE')).toBe(true)
    expect(boolFromUnknown('True')).toBe(true)
    expect(boolFromUnknown('1')).toBe(true)
    expect(boolFromUnknown('on')).toBe(true)
    expect(boolFromUnknown('ON')).toBe(true)
    expect(boolFromUnknown('On')).toBe(true)
  })

  it('converts falsy strings', () => {
    expect(boolFromUnknown('false')).toBe(false)
    expect(boolFromUnknown('0')).toBe(false)
    expect(boolFromUnknown('off')).toBe(false)
    expect(boolFromUnknown('')).toBe(false)
    expect(boolFromUnknown('random')).toBe(false)
  })

  it('handles number 1 as true', () => {
    expect(boolFromUnknown(1)).toBe(true)
  })

  it('handles other numbers as false', () => {
    expect(boolFromUnknown(0)).toBe(false)
    expect(boolFromUnknown(2)).toBe(false)
    expect(boolFromUnknown(-1)).toBe(false)
  })

  it('returns false for null and undefined by default', () => {
    expect(boolFromUnknown(null)).toBe(false)
    expect(boolFromUnknown(undefined)).toBe(false)
  })

  it('returns fallback for non-convertible values', () => {
    expect(boolFromUnknown(null, true)).toBe(true)
    expect(boolFromUnknown(undefined, true)).toBe(true)
    expect(boolFromUnknown({}, true)).toBe(true)
    expect(boolFromUnknown([], true)).toBe(true)
  })
})

describe('parseIntOrDefault', () => {
  it('parses valid integer strings', () => {
    expect(parseIntOrDefault('42', 0)).toBe(42)
    expect(parseIntOrDefault('-10', 0)).toBe(-10)
    expect(parseIntOrDefault('0', 5)).toBe(0)
  })

  it('truncates decimal strings to integer', () => {
    expect(parseIntOrDefault('42.9', 0)).toBe(42)
  })

  it('returns default for null and undefined', () => {
    expect(parseIntOrDefault(null, 99)).toBe(99)
    expect(parseIntOrDefault(undefined, 99)).toBe(99)
  })

  it('returns default for non-numeric strings', () => {
    expect(parseIntOrDefault('abc', 10)).toBe(10)
    expect(parseIntOrDefault('', 10)).toBe(10)
  })

  it('parses strings with leading numbers', () => {
    expect(parseIntOrDefault('42abc', 0)).toBe(42)
  })
})

describe('parseFloatOrDefault', () => {
  it('parses valid float strings', () => {
    expect(parseFloatOrDefault('3.14', 0)).toBeCloseTo(3.14)
    expect(parseFloatOrDefault('-2.5', 0)).toBeCloseTo(-2.5)
    expect(parseFloatOrDefault('42', 0)).toBe(42)
  })

  it('returns default for null and undefined', () => {
    expect(parseFloatOrDefault(null, 1.5)).toBe(1.5)
    expect(parseFloatOrDefault(undefined, 1.5)).toBe(1.5)
  })

  it('returns default for non-numeric strings', () => {
    expect(parseFloatOrDefault('abc', 0)).toBe(0)
    expect(parseFloatOrDefault('', 0)).toBe(0)
  })

  it('parses strings with leading numbers', () => {
    expect(parseFloatOrDefault('3.14xyz', 0)).toBeCloseTo(3.14)
  })

  it('handles zero correctly', () => {
    expect(parseFloatOrDefault('0', 5)).toBe(0)
    expect(parseFloatOrDefault('0.0', 5)).toBe(0)
  })
})
