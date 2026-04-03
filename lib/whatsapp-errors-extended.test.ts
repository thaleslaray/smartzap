import { describe, it, expect } from 'vitest'

import {
  mapWhatsAppError,
  isPaymentError,
  isRateLimitError,
  isRetryableError,
  isCriticalError,
  isOptOutError,
  getErrorCategory,
  getUserFriendlyMessage,
  getRecommendedAction,
  WHATSAPP_ERRORS,
  CRITICAL_ERROR_CODES,
  OPT_OUT_ERROR_CODES,
  ERROR_CATEGORY_COLORS,
  ERROR_CATEGORY_LABELS,
  ERROR_CATEGORY_ICONS,
  type ErrorCategory,
} from './whatsapp-errors'

/**
 * Testes estendidos para whatsapp-errors.
 * Complementa whatsapp-errors.test.ts cobrindo:
 * - Todos os CRITICAL_ERROR_CODES
 * - Todos os OPT_OUT_ERROR_CODES
 * - Cobertura por categoria (payment, rate_limit, auth, etc.)
 * - Consistencia das constantes
 */
describe('whatsapp-errors (extended)', () => {
  // ============================================================
  // CRITICAL_ERROR_CODES
  // ============================================================
  describe('erros criticos', () => {
    it('deve reconhecer todos os CRITICAL_ERROR_CODES via isCriticalError', () => {
      for (const code of CRITICAL_ERROR_CODES) {
        expect(isCriticalError(code)).toBe(true)
      }
    })

    it('nao deve considerar erros comuns como criticos', () => {
      expect(isCriticalError(131056)).toBe(false) // rate limit
      expect(isCriticalError(132001)).toBe(false) // template not found
      expect(isCriticalError(999999)).toBe(false) // desconhecido
    })

    it('deve incluir 131042 (payment) como critico', () => {
      expect(isCriticalError(131042)).toBe(true)
      expect(mapWhatsAppError(131042).category).toBe('payment')
    })

    it('deve incluir 190 (token expired) como critico', () => {
      expect(isCriticalError(190)).toBe(true)
      expect(mapWhatsAppError(190).category).toBe('auth')
    })

    it('deve incluir 131031 (account locked) como critico', () => {
      expect(isCriticalError(131031)).toBe(true)
    })

    it('deve incluir 368 (policy violation) como critico', () => {
      expect(isCriticalError(368)).toBe(true)
      expect(mapWhatsAppError(368).category).toBe('integrity')
    })

    it('deve incluir 130497 (business account locked) como critico', () => {
      expect(isCriticalError(130497)).toBe(true)
    })
  })

  // ============================================================
  // OPT_OUT_ERROR_CODES
  // ============================================================
  describe('erros de opt-out', () => {
    it('deve reconhecer todos os OPT_OUT_ERROR_CODES via isOptOutError', () => {
      for (const code of OPT_OUT_ERROR_CODES) {
        expect(isOptOutError(code)).toBe(true)
      }
    })

    it('nao deve considerar erros nao-optout como opt-out', () => {
      expect(isOptOutError(131042)).toBe(false) // payment
      expect(isOptOutError(131056)).toBe(false) // rate limit
      expect(isOptOutError(131000)).toBe(false) // system
    })

    it('deve incluir 131050 (user opted out marketing)', () => {
      expect(isOptOutError(131050)).toBe(true)
      expect(mapWhatsAppError(131050).category).toBe('recipient')
    })

    it('deve incluir 131055 (user not accepted privacy policy)', () => {
      expect(isOptOutError(131055)).toBe(true)
    })

    it('deve incluir 134102 (user not eligible marketing)', () => {
      expect(isOptOutError(134102)).toBe(true)
    })

    it('deve incluir 1752041 (marketing blocked by user preference)', () => {
      expect(isOptOutError(1752041)).toBe(true)
    })
  })

  // ============================================================
  // Cobertura por categoria
  // ============================================================
  describe('cobertura de categorias', () => {
    it('deve ter pelo menos um erro por categoria principal', () => {
      const categoriesInMap = new Set(
        Object.values(WHATSAPP_ERRORS).map((e) => e.category)
      )

      const expectedCategories: ErrorCategory[] = [
        'payment',
        'rate_limit',
        'auth',
        'template',
        'recipient',
        'media',
        'system',
        'integrity',
        'registration',
      ]

      for (const cat of expectedCategories) {
        expect(categoriesInMap.has(cat)).toBe(true)
      }
    })

    it('isPaymentError deve identificar erros de pagamento', () => {
      expect(isPaymentError(131042)).toBe(true)
      expect(isPaymentError(131056)).toBe(false) // rate_limit
    })

    it('isRateLimitError deve identificar erros de rate limit', () => {
      expect(isRateLimitError(130429)).toBe(true)
      expect(isRateLimitError(131056)).toBe(true)
      expect(isRateLimitError(131048)).toBe(true)
      expect(isRateLimitError(131057)).toBe(true)
      expect(isRateLimitError(4)).toBe(true)
      expect(isRateLimitError(17)).toBe(true)
      expect(isRateLimitError(80007)).toBe(true)
      expect(isRateLimitError(131049)).toBe(true)
    })

    it('isRetryableError deve ser true para erros de rate_limit', () => {
      // Todos rate_limit sao retryable
      expect(isRetryableError(130429)).toBe(true)
      expect(isRetryableError(131056)).toBe(true)
    })

    it('isRetryableError deve ser false para erros de payment', () => {
      expect(isRetryableError(131042)).toBe(false)
    })

    it('isRetryableError deve ser true para erros de sistema genericos', () => {
      expect(isRetryableError(131000)).toBe(true) // Something went wrong
      expect(isRetryableError(503)).toBe(true) // Service unavailable
    })

    it('isRetryableError deve ser false para erros de template', () => {
      expect(isRetryableError(132001)).toBe(false) // Template not found
      expect(isRetryableError(132015)).toBe(false) // Template paused
    })
  })

  // ============================================================
  // getErrorCategory
  // ============================================================
  describe('getErrorCategory', () => {
    it('deve retornar categoria correta para erros conhecidos', () => {
      expect(getErrorCategory(131042)).toBe('payment')
      expect(getErrorCategory(130429)).toBe('rate_limit')
      expect(getErrorCategory(190)).toBe('auth')
      expect(getErrorCategory(132001)).toBe('template')
      expect(getErrorCategory(131050)).toBe('recipient')
      expect(getErrorCategory(131052)).toBe('media')
      expect(getErrorCategory(131000)).toBe('system')
      expect(getErrorCategory(368)).toBe('integrity')
      expect(getErrorCategory(2388001)).toBe('registration')
    })

    it('deve retornar unknown para codigo desconhecido', () => {
      expect(getErrorCategory(999999)).toBe('unknown')
    })
  })

  // ============================================================
  // getUserFriendlyMessage / getRecommendedAction
  // ============================================================
  describe('getUserFriendlyMessage e getRecommendedAction', () => {
    it('deve retornar mensagem em portugues para erros conhecidos', () => {
      const msg = getUserFriendlyMessage(131042)
      expect(msg).toContain('Pagamento')
    })

    it('deve incluir codigo na mensagem para erros desconhecidos', () => {
      const msg = getUserFriendlyMessage(999999)
      expect(msg).toContain('999999')
    })

    it('deve retornar acao recomendada para erros conhecidos', () => {
      const action = getRecommendedAction(131056)
      expect(action).toContain('Aguarde')
    })

    it('deve retornar acao padrao para erros desconhecidos', () => {
      const action = getRecommendedAction(999999)
      expect(action).toContain('suporte')
    })
  })

  // ============================================================
  // mapWhatsAppError
  // ============================================================
  describe('mapWhatsAppError', () => {
    it('deve retornar WhatsAppError com todos os campos para erro conhecido', () => {
      const error = mapWhatsAppError(131042)
      expect(error.code).toBe(131042)
      expect(error.category).toBe('payment')
      expect(error.title).toBeDefined()
      expect(error.userMessage).toBeDefined()
      expect(error.action).toBeDefined()
      expect(typeof error.retryable).toBe('boolean')
    })

    it('deve retornar fallback para erro desconhecido', () => {
      const error = mapWhatsAppError(888888)
      expect(error.code).toBe(888888)
      expect(error.category).toBe('unknown')
      expect(error.retryable).toBe(false)
    })

    it('deve mapear o erro 0 (AuthException)', () => {
      const error = mapWhatsAppError(0)
      expect(error.category).toBe('auth')
    })

    it('deve mapear o erro 1 (API Unknown)', () => {
      const error = mapWhatsAppError(1)
      expect(error.category).toBe('system')
      expect(error.retryable).toBe(true)
    })
  })

  // ============================================================
  // Consistencia das constantes de UI
  // ============================================================
  describe('constantes de UI', () => {
    const allCategories: ErrorCategory[] = [
      'payment',
      'rate_limit',
      'auth',
      'template',
      'recipient',
      'media',
      'system',
      'integrity',
      'registration',
      'unknown',
    ]

    it('ERROR_CATEGORY_COLORS deve ter entrada para todas as categorias', () => {
      for (const cat of allCategories) {
        expect(ERROR_CATEGORY_COLORS[cat]).toBeDefined()
        expect(typeof ERROR_CATEGORY_COLORS[cat]).toBe('string')
      }
    })

    it('ERROR_CATEGORY_LABELS deve ter label em portugues para todas as categorias', () => {
      for (const cat of allCategories) {
        expect(ERROR_CATEGORY_LABELS[cat]).toBeDefined()
        expect(typeof ERROR_CATEGORY_LABELS[cat]).toBe('string')
        expect(ERROR_CATEGORY_LABELS[cat].length).toBeGreaterThan(0)
      }
    })

    it('ERROR_CATEGORY_ICONS deve ter icone para todas as categorias', () => {
      for (const cat of allCategories) {
        expect(ERROR_CATEGORY_ICONS[cat]).toBeDefined()
        expect(typeof ERROR_CATEGORY_ICONS[cat]).toBe('string')
      }
    })
  })

  // ============================================================
  // Cobertura de erros por codigo
  // ============================================================
  describe('mapeamento completo', () => {
    it('deve ter pelo menos 40 codigos de erro mapeados', () => {
      const count = Object.keys(WHATSAPP_ERRORS).length
      expect(count).toBeGreaterThanOrEqual(40)
    })

    it('cada erro mapeado deve ter todos os campos obrigatorios', () => {
      for (const [code, error] of Object.entries(WHATSAPP_ERRORS)) {
        expect(error.code).toBe(Number(code))
        expect(error.category).toBeDefined()
        expect(typeof error.title).toBe('string')
        expect(error.title.length).toBeGreaterThan(0)
        expect(typeof error.userMessage).toBe('string')
        expect(error.userMessage.length).toBeGreaterThan(0)
        expect(typeof error.action).toBe('string')
        expect(error.action.length).toBeGreaterThan(0)
        expect(typeof error.retryable).toBe('boolean')
      }
    })

    it('nao deve ter erros com code duplicado (sanity check)', () => {
      const codes = Object.keys(WHATSAPP_ERRORS).map(Number)
      const uniqueCodes = new Set(codes)
      expect(uniqueCodes.size).toBe(codes.length)
    })
  })
})
