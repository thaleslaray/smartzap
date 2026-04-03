/**
 * MSW Handlers — Meta WhatsApp Cloud API v24.0
 *
 * Handlers de sucesso padrão para interceptar chamadas à Meta API.
 * Cada handler retorna uma resposta realista baseada na documentação oficial.
 *
 * Uso: Importar e compor com `setupServer(...metaHandlers)`.
 */

import { http, HttpResponse } from 'msw'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const META_API_BASE = 'https://graph.facebook.com/v24.0'

// ---------------------------------------------------------------------------
// Success Handlers
// ---------------------------------------------------------------------------

/**
 * POST /:phoneNumberId/messages — Envio de mensagem (texto, template, interactive, etc.)
 * Retorna wamid simulado.
 */
const sendMessageHandler = http.post(
  `${META_API_BASE}/:phoneNumberId/messages`,
  async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const to = body.to as string || '5511999999999'
    const wamid = `wamid.HBgNNTUxMTk5OTk5OTk5FQIAERgSMEE0${Date.now()}`

    return HttpResponse.json({
      messaging_product: 'whatsapp',
      contacts: [{ input: to, wa_id: to }],
      messages: [{ id: wamid }],
    })
  }
)

/**
 * GET /:wabaId/message_templates — Lista de templates
 */
const listTemplatesHandler = http.get(
  `${META_API_BASE}/:wabaId/message_templates`,
  () => {
    return HttpResponse.json({
      data: [
        {
          name: 'hello_world',
          language: 'pt_BR',
          status: 'APPROVED',
          category: 'UTILITY',
          id: 'tmpl_001',
          components: [
            { type: 'BODY', text: 'Olá {{1}}, temos uma novidade!' },
          ],
        },
        {
          name: 'promo_template',
          language: 'pt_BR',
          status: 'APPROVED',
          category: 'MARKETING',
          id: 'tmpl_002',
          components: [
            { type: 'HEADER', format: 'TEXT', text: 'Promoção {{1}}' },
            { type: 'BODY', text: '{{1}}, aproveite: {{2}}!' },
            { type: 'FOOTER', text: 'SmartZap' },
          ],
        },
      ],
      paging: { cursors: { before: 'before_cursor', after: 'after_cursor' } },
    })
  }
)

/**
 * POST /:wabaId/message_templates — Criação de template
 */
const createTemplateHandler = http.post(
  `${META_API_BASE}/:wabaId/message_templates`,
  async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>

    return HttpResponse.json({
      id: `tmpl_${Date.now()}`,
      status: 'PENDING',
      category: body.category || 'UTILITY',
    })
  }
)

/**
 * POST /:phoneNumberId/media — Upload de mídia
 */
const uploadMediaHandler = http.post(
  `${META_API_BASE}/:phoneNumberId/media`,
  () => {
    return HttpResponse.json({
      id: `media_${Date.now()}`,
    })
  }
)

/**
 * GET /:phoneNumberId — Informações do phone number
 */
const phoneNumberInfoHandler = http.get(
  `${META_API_BASE}/:phoneNumberId`,
  ({ params }) => {
    const phoneNumberId = params.phoneNumberId as string

    return HttpResponse.json({
      id: phoneNumberId,
      display_phone_number: '+55 11 99999-9999',
      verified_name: 'SmartZap Test',
      quality_rating: 'GREEN',
      platform_type: 'CLOUD_API',
      throughput: { level: 'STANDARD' },
    })
  }
)

/**
 * GET /:wabaId/subscribed_apps — Verificação de webhook
 */
const subscribedAppsHandler = http.get(
  `${META_API_BASE}/:wabaId/subscribed_apps`,
  () => {
    return HttpResponse.json({
      data: [
        {
          whatsapp_business_api_data: {
            id: 'app_001',
            link: 'https://www.facebook.com/app/001',
            name: 'SmartZap',
          },
        },
      ],
    })
  }
)

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Todos os handlers de sucesso da Meta API */
export const metaHandlers = [
  sendMessageHandler,
  listTemplatesHandler,
  createTemplateHandler,
  uploadMediaHandler,
  phoneNumberInfoHandler,
  subscribedAppsHandler,
]

// Exports individuais para composição customizada
export {
  sendMessageHandler,
  listTemplatesHandler,
  createTemplateHandler,
  uploadMediaHandler,
  phoneNumberInfoHandler,
  subscribedAppsHandler,
}
