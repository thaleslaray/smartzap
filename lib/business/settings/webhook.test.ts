import { describe, it, expect } from 'vitest'

import {
  validateWebhookUrl,
  validateWebhookToken,
  buildWebhookUrl,
  buildCallbackUrl,
  parseWebhookToken,
  parseWebhookUrl,
  extractBaseUrl,
  normalizeDomain,
  isProductionUrl,
  DEFAULT_WEBHOOK_PATH,
  MIN_URL_LENGTH,
  MAX_URL_LENGTH,
} from './webhook'

// =============================================================================
// validateWebhookUrl
// =============================================================================

describe('validateWebhookUrl', () => {
  it('valid for correct HTTPS URL', () => {
    const result = validateWebhookUrl('https://example.com/api/webhook')
    expect(result.isValid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('invalid for empty string', () => {
    const result = validateWebhookUrl('')
    expect(result.isValid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('invalid for null/undefined', () => {
    expect(validateWebhookUrl(null as unknown as string).isValid).toBe(false)
    expect(validateWebhookUrl(undefined as unknown as string).isValid).toBe(false)
  })

  it('invalid for URL shorter than MIN_URL_LENGTH', () => {
    const result = validateWebhookUrl('https://a')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('curta')
  })

  it('invalid for URL longer than MAX_URL_LENGTH', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(MAX_URL_LENGTH)
    const result = validateWebhookUrl(longUrl)
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('longa')
  })

  it('invalid for HTTP URL', () => {
    const result = validateWebhookUrl('http://example.com/webhook')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('HTTPS')
  })

  it('invalid for URL without protocol', () => {
    const result = validateWebhookUrl('example.com/webhook')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('https://')
  })

  it('invalid for unparseable URL', () => {
    const result = validateWebhookUrl('https://')
    expect(result.isValid).toBe(false)
  })

  it('valid for localhost with warning', () => {
    const result = validateWebhookUrl('https://localhost:3000/webhook')
    expect(result.isValid).toBe(true)
    expect(result.error).toContain('localhost')
  })

  it('valid for 127.0.0.1 with warning', () => {
    const result = validateWebhookUrl('https://127.0.0.1:3000/webhook')
    expect(result.isValid).toBe(true)
    expect(result.error).toContain('localhost')
  })

  it('invalid for hostname shorter than 3 chars', () => {
    const result = validateWebhookUrl('https://ab/webhook')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('Hostname')
  })

  it('trims whitespace from URL', () => {
    const result = validateWebhookUrl('  https://example.com/webhook  ')
    expect(result.isValid).toBe(true)
  })
})

// =============================================================================
// validateWebhookToken
// =============================================================================

describe('validateWebhookToken', () => {
  it('valid for alphanumeric token', () => {
    const result = validateWebhookToken('abc12345')
    expect(result.isValid).toBe(true)
  })

  it('valid for token with underscores, dashes, dots, tildes', () => {
    const result = validateWebhookToken('my_token-1.0~beta')
    expect(result.isValid).toBe(true)
  })

  it('invalid for empty string', () => {
    const result = validateWebhookToken('')
    expect(result.isValid).toBe(false)
  })

  it('invalid for null', () => {
    expect(validateWebhookToken(null as unknown as string).isValid).toBe(false)
  })

  it('invalid for token shorter than 8 chars', () => {
    const result = validateWebhookToken('short')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('8')
  })

  it('invalid for token longer than 256 chars', () => {
    const result = validateWebhookToken('a'.repeat(257))
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('longo')
  })

  it('invalid for token with spaces', () => {
    const result = validateWebhookToken('has space here')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('caracteres')
  })

  it('invalid for token with special characters', () => {
    const result = validateWebhookToken('token@#$%')
    expect(result.isValid).toBe(false)
  })

  it('exactly 8 chars is valid', () => {
    const result = validateWebhookToken('12345678')
    expect(result.isValid).toBe(true)
  })

  it('exactly 256 chars is valid', () => {
    const result = validateWebhookToken('a'.repeat(256))
    expect(result.isValid).toBe(true)
  })
})

// =============================================================================
// buildWebhookUrl
// =============================================================================

describe('buildWebhookUrl', () => {
  it('builds basic webhook URL with default path', () => {
    const url = buildWebhookUrl('https://example.com')
    expect(url).toBe('https://example.com/api/webhook')
  })

  it('strips trailing slashes from base URL', () => {
    const url = buildWebhookUrl('https://example.com/')
    expect(url).toBe('https://example.com/api/webhook')
  })

  it('adds token as query param', () => {
    const url = buildWebhookUrl('https://example.com', undefined, 'mytoken')
    expect(url).toBe('https://example.com/api/webhook?token=mytoken')
  })

  it('uses custom path', () => {
    const url = buildWebhookUrl('https://example.com', undefined, undefined, '/custom/path')
    expect(url).toBe('https://example.com/custom/path')
  })

  it('adds leading slash to path if missing', () => {
    const url = buildWebhookUrl('https://example.com', undefined, undefined, 'custom/path')
    expect(url).toBe('https://example.com/custom/path')
  })

  it('encodes special characters in token', () => {
    const url = buildWebhookUrl('https://example.com', undefined, 'token with spaces')
    expect(url).toContain('token%20with%20spaces')
  })

  it('phoneNumberId parameter does not affect URL (only token/path matter)', () => {
    const url = buildWebhookUrl('https://example.com', '123456')
    expect(url).toBe('https://example.com/api/webhook')
  })
})

// =============================================================================
// buildCallbackUrl
// =============================================================================

describe('buildCallbackUrl', () => {
  it('builds callback URL', () => {
    const url = buildCallbackUrl('https://example.com', '/api/auth/callback')
    expect(url).toBe('https://example.com/api/auth/callback')
  })

  it('strips trailing slashes from base', () => {
    const url = buildCallbackUrl('https://example.com///', '/callback')
    expect(url).toBe('https://example.com/callback')
  })

  it('adds leading slash to path if missing', () => {
    const url = buildCallbackUrl('https://example.com', 'callback')
    expect(url).toBe('https://example.com/callback')
  })
})

// =============================================================================
// parseWebhookToken
// =============================================================================

describe('parseWebhookToken', () => {
  it('extracts token from URL', () => {
    expect(parseWebhookToken('https://example.com/webhook?token=abc123')).toBe('abc123')
  })

  it('returns null when no token param', () => {
    expect(parseWebhookToken('https://example.com/webhook')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseWebhookToken('')).toBeNull()
  })

  it('decodes URL-encoded tokens', () => {
    const token = parseWebhookToken('https://example.com/webhook?token=hello%20world')
    expect(token).toBe('hello world')
  })

  it('handles token with other query params', () => {
    const token = parseWebhookToken('https://example.com/webhook?foo=bar&token=mytoken&baz=1')
    expect(token).toBe('mytoken')
  })

  it('falls back to regex for invalid URLs', () => {
    const token = parseWebhookToken('not-a-url?token=fallback')
    expect(token).toBe('fallback')
  })
})

// =============================================================================
// parseWebhookUrl
// =============================================================================

describe('parseWebhookUrl', () => {
  it('parses full webhook URL', () => {
    const result = parseWebhookUrl('https://example.com/api/webhook?token=abc123')
    expect(result).toEqual({
      baseUrl: 'https://example.com',
      path: '/api/webhook',
      token: 'abc123',
    })
  })

  it('returns undefined token when not present', () => {
    const result = parseWebhookUrl('https://example.com/api/webhook')
    expect(result).toBeDefined()
    expect(result!.token).toBeUndefined()
  })

  it('returns null for empty string', () => {
    expect(parseWebhookUrl('')).toBeNull()
  })

  it('returns null for invalid URL', () => {
    expect(parseWebhookUrl('not-a-url')).toBeNull()
  })

  it('includes port in baseUrl', () => {
    const result = parseWebhookUrl('https://example.com:3000/webhook')
    expect(result!.baseUrl).toBe('https://example.com:3000')
  })
})

// =============================================================================
// extractBaseUrl
// =============================================================================

describe('extractBaseUrl', () => {
  it('extracts base URL from full URL', () => {
    expect(extractBaseUrl('https://example.com/api/webhook')).toBe('https://example.com')
  })

  it('includes port', () => {
    expect(extractBaseUrl('https://example.com:3000/path')).toBe('https://example.com:3000')
  })

  it('returns null for invalid URL', () => {
    expect(extractBaseUrl('not-a-url')).toBeNull()
  })
})

// =============================================================================
// normalizeDomain
// =============================================================================

describe('normalizeDomain', () => {
  it('adds https:// to bare domain', () => {
    expect(normalizeDomain('example.com')).toBe('https://example.com')
  })

  it('removes trailing slashes', () => {
    expect(normalizeDomain('example.com/')).toBe('https://example.com')
    expect(normalizeDomain('example.com///')).toBe('https://example.com')
  })

  it('converts http:// to https://', () => {
    expect(normalizeDomain('http://example.com')).toBe('https://example.com')
  })

  it('preserves existing https://', () => {
    expect(normalizeDomain('https://example.com')).toBe('https://example.com')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeDomain('')).toBe('')
  })

  it('trims whitespace', () => {
    expect(normalizeDomain('  example.com  ')).toBe('https://example.com')
  })
})

// =============================================================================
// isProductionUrl
// =============================================================================

describe('isProductionUrl', () => {
  it('returns true for production domain', () => {
    expect(isProductionUrl('https://example.com')).toBe(true)
  })

  it('returns true for vercel domain', () => {
    expect(isProductionUrl('https://my-app.vercel.app')).toBe(true)
  })

  it('returns false for localhost', () => {
    expect(isProductionUrl('https://localhost:3000')).toBe(false)
  })

  it('returns false for 127.0.0.1', () => {
    expect(isProductionUrl('https://127.0.0.1:3000')).toBe(false)
  })

  it('returns false for 0.0.0.0', () => {
    expect(isProductionUrl('https://0.0.0.0:3000')).toBe(false)
  })

  it('returns false for .local domains', () => {
    expect(isProductionUrl('https://myapp.local')).toBe(false)
  })

  it('returns false for .test domains', () => {
    expect(isProductionUrl('https://myapp.test')).toBe(false)
  })

  it('returns false for .dev. domains', () => {
    expect(isProductionUrl('https://my.dev.example.com')).toBe(false)
  })

  it('returns false for invalid URL', () => {
    expect(isProductionUrl('not-a-url')).toBe(false)
  })
})

// =============================================================================
// Constants
// =============================================================================

describe('constants', () => {
  it('DEFAULT_WEBHOOK_PATH is /api/webhook', () => {
    expect(DEFAULT_WEBHOOK_PATH).toBe('/api/webhook')
  })

  it('MIN_URL_LENGTH is 10', () => {
    expect(MIN_URL_LENGTH).toBe(10)
  })

  it('MAX_URL_LENGTH is 2048', () => {
    expect(MAX_URL_LENGTH).toBe(2048)
  })
})
