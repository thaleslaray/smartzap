import { describe, it, expect } from 'vitest'
import { buildTextMessage } from './text'

describe('buildTextMessage', () => {
  it('deve construir payload básico de mensagem de texto', () => {
    const result = buildTextMessage({ to: '+5511999999999', text: 'Olá mundo' })
    expect(result).toEqual({
      messaging_product: 'whatsapp',
      to: '+5511999999999',
      type: 'text',
      text: {
        body: 'Olá mundo',
        preview_url: false,
      },
    })
  })

  it('deve definir preview_url como false por padrão', () => {
    const result = buildTextMessage({ to: '+5511999999999', text: 'test' })
    expect(result.text.preview_url).toBe(false)
  })

  it('deve definir preview_url como true quando informado', () => {
    const result = buildTextMessage({
      to: '+5511999999999',
      text: 'Veja https://example.com',
      previewUrl: true,
    })
    expect(result.text.preview_url).toBe(true)
  })

  it('não deve incluir context quando replyToMessageId não é informado', () => {
    const result = buildTextMessage({ to: '+5511999999999', text: 'test' })
    expect(result.context).toBeUndefined()
  })

  it('deve incluir context quando replyToMessageId é informado', () => {
    const result = buildTextMessage({
      to: '+5511999999999',
      text: 'resposta',
      replyToMessageId: 'wamid.abc123',
    })
    expect(result.context).toEqual({ message_id: 'wamid.abc123' })
  })

  it('deve manter texto com caracteres especiais e emojis', () => {
    const result = buildTextMessage({ to: '+5511999999999', text: 'Olá! 🎉 R$ 10,00' })
    expect(result.text.body).toBe('Olá! 🎉 R$ 10,00')
  })

  it('deve manter texto com quebras de linha', () => {
    const result = buildTextMessage({ to: '+5511999999999', text: 'Linha 1\nLinha 2\nLinha 3' })
    expect(result.text.body).toBe('Linha 1\nLinha 2\nLinha 3')
  })
})
