import { describe, it, expect } from 'vitest'
import {
  CACHE_DISABLE_HEADERS,
  CACHE_PRIVATE_HEADERS,
  CACHE_SHORT_HEADERS,
  CACHE_MEDIUM_HEADERS,
  CORS_PUBLIC_HEADERS,
  createCacheHeaders,
} from './http-headers'

describe('CACHE_DISABLE_HEADERS', () => {
  it('has no-store and no-cache directives', () => {
    expect(CACHE_DISABLE_HEADERS['Cache-Control']).toContain('no-store')
    expect(CACHE_DISABLE_HEADERS['Cache-Control']).toContain('no-cache')
    expect(CACHE_DISABLE_HEADERS['Cache-Control']).toContain('must-revalidate')
    expect(CACHE_DISABLE_HEADERS['Cache-Control']).toContain('max-age=0')
  })

  it('sets Pragma and Expires for legacy clients', () => {
    expect(CACHE_DISABLE_HEADERS['Pragma']).toBe('no-cache')
    expect(CACHE_DISABLE_HEADERS['Expires']).toBe('0')
  })
})

describe('CACHE_PRIVATE_HEADERS', () => {
  it('includes private directive', () => {
    expect(CACHE_PRIVATE_HEADERS['Cache-Control']).toContain('private')
  })

  it('disables caching', () => {
    expect(CACHE_PRIVATE_HEADERS['Cache-Control']).toContain('no-store')
    expect(CACHE_PRIVATE_HEADERS['Cache-Control']).toContain('no-cache')
    expect(CACHE_PRIVATE_HEADERS['Cache-Control']).toContain('must-revalidate')
  })

  it('sets Pragma and Expires', () => {
    expect(CACHE_PRIVATE_HEADERS['Pragma']).toBe('no-cache')
    expect(CACHE_PRIVATE_HEADERS['Expires']).toBe('0')
  })
})

describe('CACHE_SHORT_HEADERS', () => {
  it('has public directive with 60s TTL', () => {
    expect(CACHE_SHORT_HEADERS['Cache-Control']).toBe('public, max-age=60, s-maxage=60')
  })
})

describe('CACHE_MEDIUM_HEADERS', () => {
  it('has public directive with 300s TTL', () => {
    expect(CACHE_MEDIUM_HEADERS['Cache-Control']).toBe('public, max-age=300, s-maxage=300')
  })
})

describe('CORS_PUBLIC_HEADERS', () => {
  it('allows all origins', () => {
    expect(CORS_PUBLIC_HEADERS['Access-Control-Allow-Origin']).toBe('*')
  })

  it('allows GET, POST, and OPTIONS methods', () => {
    expect(CORS_PUBLIC_HEADERS['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS')
  })

  it('allows Content-Type header', () => {
    expect(CORS_PUBLIC_HEADERS['Access-Control-Allow-Headers']).toBe('Content-Type')
  })
})

describe('createCacheHeaders', () => {
  it('creates public cache headers by default', () => {
    const headers = createCacheHeaders(120)
    expect(headers['Cache-Control']).toBe('public, max-age=120, s-maxage=120')
  })

  it('creates private cache headers when isPrivate is true', () => {
    const headers = createCacheHeaders(60, true)
    expect(headers['Cache-Control']).toBe('private, max-age=60, s-maxage=60')
  })

  it('handles zero maxAge', () => {
    const headers = createCacheHeaders(0)
    expect(headers['Cache-Control']).toBe('public, max-age=0, s-maxage=0')
  })

  it('returns a plain object with only Cache-Control', () => {
    const headers = createCacheHeaders(30)
    expect(Object.keys(headers)).toEqual(['Cache-Control'])
  })
})
