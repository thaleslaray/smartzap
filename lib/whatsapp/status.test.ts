import { describe, it, expect } from 'vitest'
import { buildTypingIndicator, buildMarkAsRead, simulateTypingDelay } from './status'

// =============================================================================
// buildTypingIndicator
// =============================================================================
describe('buildTypingIndicator', () => {
  it('deve construir payload de typing indicator com action "on"', () => {
    const result = buildTypingIndicator({ to: '+5511999999999', action: 'on' })
    expect(result).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '+5511999999999',
      type: 'typing',
      typing: { action: 'on' },
    })
  })

  it('deve construir payload de typing indicator com action "off"', () => {
    const result = buildTypingIndicator({ to: '+5511999999999', action: 'off' })
    expect(result.typing.action).toBe('off')
  })

  it('deve sempre definir recipient_type como "individual"', () => {
    const result = buildTypingIndicator({ to: '+5511999999999', action: 'on' })
    expect(result.recipient_type).toBe('individual')
  })

  it('deve sempre definir messaging_product como "whatsapp"', () => {
    const result = buildTypingIndicator({ to: '+5511999999999', action: 'on' })
    expect(result.messaging_product).toBe('whatsapp')
  })
})

// =============================================================================
// buildMarkAsRead
// =============================================================================
describe('buildMarkAsRead', () => {
  it('deve construir payload de mark as read', () => {
    const result = buildMarkAsRead({ messageId: 'wamid.abc123' })
    expect(result).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.abc123',
    })
  })

  it('deve sempre definir status como "read"', () => {
    const result = buildMarkAsRead({ messageId: 'wamid.xyz' })
    expect(result.status).toBe('read')
  })

  it('deve sempre definir messaging_product como "whatsapp"', () => {
    const result = buildMarkAsRead({ messageId: 'wamid.xyz' })
    expect(result.messaging_product).toBe('whatsapp')
  })
})

// =============================================================================
// simulateTypingDelay
// =============================================================================
describe('simulateTypingDelay', () => {
  it('deve resolver após o delay especificado', async () => {
    const start = Date.now()
    await simulateTypingDelay(50)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(40) // margem para imprecisão de timer
  })

  it('deve resolver com delay aleatório quando não especificado', async () => {
    const start = Date.now()
    await simulateTypingDelay()
    const elapsed = Date.now() - start
    // Delay padrão é 500-1500ms
    expect(elapsed).toBeGreaterThanOrEqual(400)
    expect(elapsed).toBeLessThan(2000)
  })

  it('deve aceitar delay de 0ms', async () => {
    const start = Date.now()
    await simulateTypingDelay(0)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(100)
  })
})
