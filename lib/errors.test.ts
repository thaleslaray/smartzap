import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import {
  ErrorType,
  AppError,
  classifyHttpError,
  classifyWhatsAppError,
  getUserErrorMessage,
  handleApiError,
  handleStorageError,
  handleParseError,
  handleValidationError,
  isRetryableError,
  getRetryDelay,
  isPairRateLimitError,
  getPairRateLimitWait,
  requiresUserAction,
} from './errors'
import { logger } from './logger'

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================================
// ErrorType enum
// ============================================================================

describe('ErrorType', () => {
  it('contains all expected values', () => {
    expect(ErrorType.VALIDATION_ERROR).toBe('VALIDATION_ERROR')
    expect(ErrorType.AUTHENTICATION_ERROR).toBe('AUTHENTICATION_ERROR')
    expect(ErrorType.AUTHORIZATION_ERROR).toBe('AUTHORIZATION_ERROR')
    expect(ErrorType.NOT_FOUND_ERROR).toBe('NOT_FOUND_ERROR')
    expect(ErrorType.RATE_LIMIT_ERROR).toBe('RATE_LIMIT_ERROR')
    expect(ErrorType.SERVER_ERROR).toBe('SERVER_ERROR')
    expect(ErrorType.NETWORK_ERROR).toBe('NETWORK_ERROR')
    expect(ErrorType.TIMEOUT_ERROR).toBe('TIMEOUT_ERROR')
    expect(ErrorType.STORAGE_ERROR).toBe('STORAGE_ERROR')
    expect(ErrorType.PARSE_ERROR).toBe('PARSE_ERROR')
    expect(ErrorType.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR')
  })

  it('has exactly 11 members', () => {
    const values = Object.values(ErrorType)
    expect(values).toHaveLength(11)
  })
})

// ============================================================================
// AppError class
// ============================================================================

describe('AppError', () => {
  it('extends Error', () => {
    const err = new AppError(ErrorType.SERVER_ERROR, 'technical', 'user msg')
    expect(err).toBeInstanceOf(Error)
  })

  it('has name set to AppError', () => {
    const err = new AppError(ErrorType.SERVER_ERROR, 'msg', 'user')
    expect(err.name).toBe('AppError')
  })

  it('stores all constructor fields', () => {
    const ctx = { foo: 'bar' }
    const err = new AppError(
      ErrorType.VALIDATION_ERROR,
      'tech message',
      'user message',
      400,
      ctx
    )
    expect(err.type).toBe(ErrorType.VALIDATION_ERROR)
    expect(err.message).toBe('tech message')
    expect(err.userMessage).toBe('user message')
    expect(err.statusCode).toBe(400)
    expect(err.context).toEqual(ctx)
  })

  it('allows optional statusCode and context', () => {
    const err = new AppError(ErrorType.UNKNOWN_ERROR, 'msg', 'user')
    expect(err.statusCode).toBeUndefined()
    expect(err.context).toBeUndefined()
  })
})

// ============================================================================
// classifyHttpError
// ============================================================================

describe('classifyHttpError', () => {
  it.each([
    [401, ErrorType.AUTHENTICATION_ERROR],
    [403, ErrorType.AUTHORIZATION_ERROR],
    [404, ErrorType.NOT_FOUND_ERROR],
    [429, ErrorType.RATE_LIMIT_ERROR],
    [400, ErrorType.VALIDATION_ERROR],
    [422, ErrorType.VALIDATION_ERROR],
    [500, ErrorType.SERVER_ERROR],
    [502, ErrorType.SERVER_ERROR],
    [503, ErrorType.SERVER_ERROR],
  ])('maps %i → %s', (code, expected) => {
    expect(classifyHttpError(code)).toBe(expected)
  })

  it('returns UNKNOWN_ERROR for 2xx codes', () => {
    expect(classifyHttpError(200)).toBe(ErrorType.UNKNOWN_ERROR)
  })

  it('returns UNKNOWN_ERROR for 3xx codes', () => {
    expect(classifyHttpError(301)).toBe(ErrorType.UNKNOWN_ERROR)
  })
})

// ============================================================================
// classifyWhatsAppError
// ============================================================================

describe('classifyWhatsAppError', () => {
  it('returns UNKNOWN_ERROR for null/undefined', () => {
    expect(classifyWhatsAppError(null)).toBe(ErrorType.UNKNOWN_ERROR)
    expect(classifyWhatsAppError(undefined)).toBe(ErrorType.UNKNOWN_ERROR)
  })

  it('detects network errors (TypeError + fetch)', () => {
    const err = new TypeError('Failed to fetch')
    expect(classifyWhatsAppError(err)).toBe(ErrorType.NETWORK_ERROR)
  })

  it('detects timeout via AbortError', () => {
    const err = { name: 'AbortError', message: 'aborted' }
    expect(classifyWhatsAppError(err)).toBe(ErrorType.TIMEOUT_ERROR)
  })

  it('detects timeout via message containing "timeout"', () => {
    const err = { name: 'Error', message: 'request timeout exceeded' }
    expect(classifyWhatsAppError(err)).toBe(ErrorType.TIMEOUT_ERROR)
  })

  it('classifies by HTTP status when present', () => {
    const err = { response: { status: 429 } }
    expect(classifyWhatsAppError(err)).toBe(ErrorType.RATE_LIMIT_ERROR)
  })

  it.each([
    [190, ErrorType.AUTHENTICATION_ERROR],
    [100, ErrorType.VALIDATION_ERROR],
    [4, ErrorType.RATE_LIMIT_ERROR],
    [10, ErrorType.AUTHORIZATION_ERROR],
    [200, ErrorType.AUTHORIZATION_ERROR],
  ])('maps WA code %i → %s', (code, expected) => {
    const err = { error: { code } }
    expect(classifyWhatsAppError(err)).toBe(expected)
  })

  it('returns UNKNOWN_ERROR for unrecognized error shape', () => {
    expect(classifyWhatsAppError({ random: true })).toBe(ErrorType.UNKNOWN_ERROR)
  })
})

// ============================================================================
// getUserErrorMessage
// ============================================================================

describe('getUserErrorMessage', () => {
  it('returns mapped message for an ErrorType string', () => {
    const msg = getUserErrorMessage(ErrorType.NETWORK_ERROR)
    expect(msg).toContain('conexão')
  })

  it('returns userMessage from AppError when present', () => {
    const err = new AppError(ErrorType.SERVER_ERROR, 'tech', 'custom user msg')
    expect(getUserErrorMessage(err)).toBe('custom user msg')
  })

  it('falls back to type message when AppError.userMessage is empty', () => {
    const err = new AppError(ErrorType.SERVER_ERROR, 'tech', '')
    const msg = getUserErrorMessage(err)
    expect(msg).toContain('servidor')
  })

  it('returns UNKNOWN_ERROR message for invalid type', () => {
    const msg = getUserErrorMessage('DOES_NOT_EXIST' as ErrorType)
    expect(msg).toContain('inesperado')
  })
})

// ============================================================================
// handleApiError
// ============================================================================

describe('handleApiError', () => {
  it('returns an AppError', () => {
    const result = handleApiError(new Error('boom'))
    expect(result).toBeInstanceOf(AppError)
  })

  it('logs the error via logger.error', () => {
    handleApiError(new Error('boom'))
    expect(logger.error).toHaveBeenCalledWith('API Error', expect.any(Object))
  })

  it('incorporates permission error (#200) message', () => {
    const err = { error: { code: 200, message: 'Requires #200 permission' } }
    const result = handleApiError(err)
    expect(result.userMessage).toContain('#200')
    expect(result.userMessage).toContain('permissão')
  })

  it('appends generic API error message as details', () => {
    const err = { error: { code: 100, message: 'Some API detail' } }
    const result = handleApiError(err)
    expect(result.userMessage).toContain('Some API detail')
  })

  it('passes context through to AppError', () => {
    const ctx = { endpoint: '/test' }
    const result = handleApiError(new Error('x'), ctx)
    expect(result.context).toMatchObject(ctx)
  })
})

// ============================================================================
// handleStorageError
// ============================================================================

describe('handleStorageError', () => {
  it('returns AppError with STORAGE_ERROR type', () => {
    const result = handleStorageError(new Error('disk full'), 'save settings')
    expect(result).toBeInstanceOf(AppError)
    expect(result.type).toBe(ErrorType.STORAGE_ERROR)
  })

  it('includes operation in message', () => {
    const result = handleStorageError(new Error('fail'), 'read cache')
    expect(result.message).toContain('read cache')
  })

  it('logs via logger.error', () => {
    handleStorageError(new Error('x'), 'op')
    expect(logger.error).toHaveBeenCalledWith('Storage Error', expect.objectContaining({ operation: 'op' }))
  })
})

// ============================================================================
// handleParseError
// ============================================================================

describe('handleParseError', () => {
  it('returns AppError with PARSE_ERROR type', () => {
    const result = handleParseError(new Error('bad json'), 'JSON')
    expect(result).toBeInstanceOf(AppError)
    expect(result.type).toBe(ErrorType.PARSE_ERROR)
  })

  it('includes fileType in message', () => {
    const result = handleParseError(new Error('fail'), 'CSV')
    expect(result.message).toContain('CSV')
  })

  it('logs via logger.error', () => {
    handleParseError(new Error('x'), 'XML')
    expect(logger.error).toHaveBeenCalledWith('Parse Error', expect.objectContaining({ fileType: 'XML' }))
  })
})

// ============================================================================
// handleValidationError
// ============================================================================

describe('handleValidationError', () => {
  it('returns AppError with VALIDATION_ERROR type', () => {
    const result = handleValidationError('phone', 'too short')
    expect(result).toBeInstanceOf(AppError)
    expect(result.type).toBe(ErrorType.VALIDATION_ERROR)
  })

  it('includes field and reason in message', () => {
    const result = handleValidationError('email', 'invalid format')
    expect(result.message).toContain('email')
    expect(result.message).toContain('invalid format')
  })

  it('sets userMessage to field: reason', () => {
    const result = handleValidationError('name', 'required')
    expect(result.userMessage).toBe('name: required')
  })

  it('logs via logger.warn', () => {
    handleValidationError('x', 'y')
    expect(logger.warn).toHaveBeenCalledWith('Validation Error', expect.objectContaining({ field: 'x', reason: 'y' }))
  })
})

// ============================================================================
// isRetryableError
// ============================================================================

describe('isRetryableError', () => {
  it.each([
    ErrorType.NETWORK_ERROR,
    ErrorType.TIMEOUT_ERROR,
    ErrorType.SERVER_ERROR,
  ])('returns true for %s', (type) => {
    const err = new AppError(type, 'msg', 'user')
    expect(isRetryableError(err)).toBe(true)
  })

  it.each([
    ErrorType.VALIDATION_ERROR,
    ErrorType.AUTHENTICATION_ERROR,
    ErrorType.AUTHORIZATION_ERROR,
    ErrorType.NOT_FOUND_ERROR,
    ErrorType.RATE_LIMIT_ERROR,
    ErrorType.STORAGE_ERROR,
    ErrorType.PARSE_ERROR,
    ErrorType.UNKNOWN_ERROR,
  ])('returns false for %s', (type) => {
    const err = new AppError(type, 'msg', 'user')
    expect(isRetryableError(err)).toBe(false)
  })
})

// ============================================================================
// getRetryDelay
// ============================================================================

describe('getRetryDelay', () => {
  it('returns baseDelay for attempt 0', () => {
    expect(getRetryDelay(0)).toBe(1000)
  })

  it('applies 4^attempt factor', () => {
    expect(getRetryDelay(1)).toBe(4000) // 1000 * 4^1
    expect(getRetryDelay(2)).toBe(16000) // 1000 * 4^2
  })

  it('caps at 60000ms', () => {
    expect(getRetryDelay(5)).toBe(60000)
    expect(getRetryDelay(10)).toBe(60000)
  })

  it('uses custom baseDelay', () => {
    expect(getRetryDelay(0, 500)).toBe(500)
    expect(getRetryDelay(1, 500)).toBe(2000) // 500 * 4
  })
})

// ============================================================================
// isPairRateLimitError
// ============================================================================

describe('isPairRateLimitError', () => {
  it('returns true for string "131056"', () => {
    expect(isPairRateLimitError('131056')).toBe(true)
  })

  it('returns true for number 131056', () => {
    expect(isPairRateLimitError(131056)).toBe(true)
  })

  it('returns false for other codes', () => {
    expect(isPairRateLimitError(131000)).toBe(false)
    expect(isPairRateLimitError('999')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isPairRateLimitError(undefined)).toBe(false)
  })
})

// ============================================================================
// getPairRateLimitWait
// ============================================================================

describe('getPairRateLimitWait', () => {
  it('returns 6000', () => {
    expect(getPairRateLimitWait()).toBe(6000)
  })
})

// ============================================================================
// requiresUserAction
// ============================================================================

describe('requiresUserAction', () => {
  it.each([
    ErrorType.AUTHENTICATION_ERROR,
    ErrorType.AUTHORIZATION_ERROR,
    ErrorType.VALIDATION_ERROR,
  ])('returns true for %s', (type) => {
    const err = new AppError(type, 'msg', 'user')
    expect(requiresUserAction(err)).toBe(true)
  })

  it.each([
    ErrorType.NETWORK_ERROR,
    ErrorType.TIMEOUT_ERROR,
    ErrorType.SERVER_ERROR,
    ErrorType.STORAGE_ERROR,
    ErrorType.PARSE_ERROR,
    ErrorType.RATE_LIMIT_ERROR,
    ErrorType.NOT_FOUND_ERROR,
    ErrorType.UNKNOWN_ERROR,
  ])('returns false for %s', (type) => {
    const err = new AppError(type, 'msg', 'user')
    expect(requiresUserAction(err)).toBe(false)
  })
})
