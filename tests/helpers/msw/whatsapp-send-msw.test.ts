/**
 * Teste de Prova de Conceito — MSW + whatsapp-send.ts
 *
 * Demonstra que o MSW intercepta corretamente as chamadas à Meta API
 * feitas por sendWhatsAppMessage(), sem mock manual de fetch.
 *
 * Este teste valida:
 * 1. Envio com sucesso (handler padrão)
 * 2. Erro de pagamento (override com paymentErrorHandler)
 * 3. Rate limiting (override com rateLimitHandler)
 */

import { describe, expect, it, vi } from 'vitest'
import { setupMSW } from './setup'
import { server } from './server'
import {
  paymentErrorHandler,
  rateLimitHandler,
} from './error-handlers'

// Mock das dependências internas que whatsapp-send.ts importa
vi.mock('@/lib/whatsapp-credentials', () => ({
  getWhatsAppCredentials: vi.fn().mockResolvedValue({
    accessToken: 'test-token',
    phoneNumberId: '123456789',
    businessAccountId: '987654321',
  }),
}))

// Mock mínimo do phone-formatter (normaliza para E.164)
vi.mock('@/lib/phone-formatter', () => ({
  normalizePhoneNumber: vi.fn((phone: string) => {
    if (phone.startsWith('+')) return phone
    return `+${phone}`
  }),
}))

// Mock do text builder
vi.mock('@/lib/whatsapp/text', () => ({
  buildTextMessage: vi.fn(({ to, text }: { to: string; text: string }) => ({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  })),
}))

import { sendWhatsAppMessage } from '@/lib/whatsapp-send'

describe('sendWhatsAppMessage (MSW integration)', () => {
  // Configura MSW para esta suíte (opt-in)
  setupMSW()

  describe('sucesso', () => {
    it('envia mensagem de texto e retorna messageId', async () => {
      const result = await sendWhatsAppMessage({
        to: '+5511999999999',
        type: 'text',
        text: 'Olá, teste!',
      })

      expect(result.success).toBe(true)
      expect(result.messageId).toBeDefined()
      expect(result.messageId).toMatch(/^wamid\./)
    })

    it('envia mensagem de template e retorna messageId', async () => {
      const result = await sendWhatsAppMessage({
        to: '+5511999999999',
        type: 'template',
        templateName: 'hello_world',
        templateParams: {
          body: ['João'],
        },
      })

      expect(result.success).toBe(true)
      expect(result.messageId).toBeDefined()
    })
  })

  describe('erro de pagamento (131042)', () => {
    it('retorna erro quando conta tem billing pendente', async () => {
      // Override: substitui o handler padrão pelo handler de erro
      server.use(paymentErrorHandler)

      const result = await sendWhatsAppMessage({
        to: '+5511999999999',
        type: 'text',
        text: 'Mensagem que não será entregue',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
      expect(result.details).toBeDefined()
    })
  })

  describe('rate limiting (130429)', () => {
    it('retorna erro quando rate limit é atingido', async () => {
      server.use(rateLimitHandler)

      const result = await sendWhatsAppMessage({
        to: '+5511999999999',
        type: 'text',
        text: 'Mensagem durante rate limit',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })
  })
})
