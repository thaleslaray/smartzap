/**
 * MSW Error Handlers — Meta WhatsApp Cloud API
 *
 * Handlers de erro baseados em lib/whatsapp-errors.ts.
 * Use como override via `server.use(paymentErrorHandler)` em testes específicos.
 *
 * @example
 * ```ts
 * import { server } from './server'
 * import { paymentErrorHandler, rateLimitHandler } from './error-handlers'
 *
 * it('handles payment error', async () => {
 *   server.use(paymentErrorHandler)
 *   // ... test code that sends a message
 * })
 * ```
 */

import { http, HttpResponse } from 'msw'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const META_API_BASE = 'https://graph.facebook.com/v24.0'

// ---------------------------------------------------------------------------
// Error Response Factory
// ---------------------------------------------------------------------------

/**
 * Cria uma resposta de erro da Meta API no formato padrão.
 *
 * O formato segue a documentação oficial:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/
 */
export function createMetaErrorResponse(
  errorCode: number,
  httpStatus: number,
  options?: {
    message?: string
    title?: string
    details?: string
    fbtraceId?: string
  }
) {
  const defaults: Record<number, { message: string; title: string }> = {
    131042: { message: 'Business eligibility payment issue', title: 'Business eligibility payment issue' },
    130429: { message: 'Rate limit hit', title: '(#130429) Rate limit hit' },
    131056: { message: '(#131056) Pair rate limit hit', title: 'Pair rate limit hit' },
    132001: { message: 'Template does not exist', title: 'Template not found' },
    131000: { message: 'Something went wrong', title: 'Something went wrong' },
    131026: { message: 'Message undeliverable', title: 'Message undeliverable' },
    131050: { message: 'User opted out of marketing messages', title: 'Recipient not reachable' },
    190: { message: 'Invalid OAuth access token', title: 'Access token expired' },
    368: { message: 'Temporarily blocked for policies violations', title: 'Policy violation' },
  }

  const defaultInfo = defaults[errorCode] || {
    message: `Error code ${errorCode}`,
    title: `Error ${errorCode}`,
  }

  return HttpResponse.json(
    {
      error: {
        message: options?.message || defaultInfo.message,
        type: 'OAuthException',
        code: errorCode,
        error_data: {
          messaging_product: 'whatsapp',
          details: options?.details || defaultInfo.message,
        },
        error_subcode: errorCode,
        fbtrace_id: options?.fbtraceId || `FBTrace_${Date.now()}`,
      },
    },
    { status: httpStatus }
  )
}

// ---------------------------------------------------------------------------
// Pre-built Error Handlers
// ---------------------------------------------------------------------------

/**
 * Erro de pagamento (131042) — conta com billing pendente.
 * HTTP 403.
 */
export const paymentErrorHandler = http.post(
  `${META_API_BASE}/:phoneNumberId/messages`,
  () => createMetaErrorResponse(131042, 403)
)

/**
 * Rate limit geral (130429) — muitas mensagens em pouco tempo.
 * HTTP 429.
 */
export const rateLimitHandler = http.post(
  `${META_API_BASE}/:phoneNumberId/messages`,
  () =>
    createMetaErrorResponse(130429, 429, {
      details: 'Too many messages sent. Please wait and retry.',
    })
)

/**
 * Pair rate limit (131056) — muitas mensagens para o mesmo número.
 * HTTP 400.
 */
export const pairRateLimitHandler = http.post(
  `${META_API_BASE}/:phoneNumberId/messages`,
  () =>
    createMetaErrorResponse(131056, 400, {
      details: 'Pair rate limit hit. Wait 6 seconds between messages to the same recipient.',
    })
)

/**
 * Template não encontrado (132001).
 * HTTP 404.
 */
export const templateNotFoundHandler = http.post(
  `${META_API_BASE}/:phoneNumberId/messages`,
  () =>
    createMetaErrorResponse(132001, 404, {
      message: 'Template name does not exist in the translation',
      details: 'Template does not exist or is not approved.',
    })
)

/**
 * Erro interno do sistema (131000).
 * HTTP 500.
 */
export const systemErrorHandler = http.post(
  `${META_API_BASE}/:phoneNumberId/messages`,
  () => createMetaErrorResponse(131000, 500)
)

/**
 * Token expirado (190).
 * HTTP 401.
 */
export const tokenExpiredHandler = http.post(
  `${META_API_BASE}/:phoneNumberId/messages`,
  () =>
    createMetaErrorResponse(190, 401, {
      message: 'Invalid OAuth access token - Cannot parse access token',
    })
)

/**
 * Conta bloqueada por políticas (368).
 * HTTP 403.
 */
export const policyViolationHandler = http.post(
  `${META_API_BASE}/:phoneNumberId/messages`,
  () => createMetaErrorResponse(368, 403)
)

/**
 * Opt-out do usuário (131050).
 * HTTP 400.
 */
export const userOptOutHandler = http.post(
  `${META_API_BASE}/:phoneNumberId/messages`,
  () => createMetaErrorResponse(131050, 400)
)

/**
 * Message undeliverable (131026).
 * HTTP 400.
 */
export const messageUndeliverableHandler = http.post(
  `${META_API_BASE}/:phoneNumberId/messages`,
  () => createMetaErrorResponse(131026, 400)
)
