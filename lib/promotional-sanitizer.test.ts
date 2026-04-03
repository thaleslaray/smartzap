import { describe, it, expect } from 'vitest'

import {
  sanitizePromotionalContent,
  reconstructMessage,
  wrapAsUpdateNotification,
} from './promotional-sanitizer'

// ============================================================================
// sanitizePromotionalContent
// ============================================================================

describe('sanitizePromotionalContent', () => {
  it('replaces promotional words with {{n}} variables', () => {
    const input = 'Apenas 23 vagas disponíveis! Garanta a sua nesta quarta-feira às 09h!'
    const result = sanitizePromotionalContent(input)

    expect(result.wasModified).toBe(true)
    expect(result.replacementCount).toBeGreaterThan(0)
    expect(result.variableMap.size).toBeGreaterThan(0)

    // Sanitized content should contain {{n}} placeholders
    expect(result.sanitizedContent).toMatch(/\{\{\d+\}\}/)
    // Original content should be preserved
    expect(result.originalContent).toBe(input)
  })

  it('returns wasModified=false for non-promotional content', () => {
    const input = 'Olá, seu pedido foi enviado. O código de rastreio é ABC123.'
    const result = sanitizePromotionalContent(input)

    expect(result.wasModified).toBe(false)
    expect(result.replacementCount).toBe(0)
    expect(result.variableMap.size).toBe(0)
    expect(result.sanitizedContent).toBe(input)
  })

  it('does not replace existing {{n}} variables', () => {
    const input = '{{1}}, seu pedido chegou.'
    const result = sanitizePromotionalContent(input)

    expect(result.sanitizedContent).toContain('{{1}}')
    // Should not have created any new variables for the existing one
    expect(result.replacementCount).toBe(0)
  })

  it('assigns sequential variable numbers', () => {
    const input = 'Garanta sua vaga exclusiva!'
    const result = sanitizePromotionalContent(input)

    if (result.replacementCount > 1) {
      // Variable keys should be sequential starting from 1
      const keys = Array.from(result.variableMap.keys()).sort((a, b) => a - b)
      for (let i = 0; i < keys.length; i++) {
        expect(keys[i]).toBe(i + 1)
      }
    }
  })

  it('populates exampleValues array matching variable count', () => {
    const input = 'Apenas 10 vagas! Garanta a sua!'
    const result = sanitizePromotionalContent(input)

    expect(result.exampleValues).toHaveLength(result.replacementCount)
  })

  it('stores value, description, and category in variableMap', () => {
    const input = 'Garanta sua vaga!'
    const result = sanitizePromotionalContent(input)

    result.variableMap.forEach((info) => {
      expect(info).toHaveProperty('value')
      expect(info).toHaveProperty('description')
      expect(info).toHaveProperty('category')
      expect(info.value.length).toBeGreaterThan(0)
    })
  })

  it('detects scarcity patterns', () => {
    const input = 'Apenas 5 vagas disponíveis'
    const result = sanitizePromotionalContent(input)

    expect(result.wasModified).toBe(true)
    const categories = Array.from(result.variableMap.values()).map((v) => v.category)
    expect(categories).toContain('scarcity')
  })

  it('detects urgency patterns (day of week)', () => {
    const input = 'nesta segunda-feira imperdível'
    const result = sanitizePromotionalContent(input)

    expect(result.wasModified).toBe(true)
  })

  it('detects offer patterns', () => {
    const input = 'desconto de 20% no boleto parcelado'
    const result = sanitizePromotionalContent(input)

    expect(result.wasModified).toBe(true)
    const categories = Array.from(result.variableMap.values()).map((v) => v.category)
    expect(categories).toContain('offer')
  })

  it('detects action/CTA patterns', () => {
    const input = 'Aproveite e não perca essa chance'
    const result = sanitizePromotionalContent(input)

    expect(result.wasModified).toBe(true)
    const categories = Array.from(result.variableMap.values()).map((v) => v.category)
    expect(categories).toContain('action')
  })
})

// ============================================================================
// reconstructMessage
// ============================================================================

describe('reconstructMessage', () => {
  it('fills variables back into the template', () => {
    const input = 'Apenas 23 vagas disponíveis! Garanta a sua!'
    const result = sanitizePromotionalContent(input)
    const reconstructed = reconstructMessage(result.sanitizedContent, result.variableMap)

    expect(reconstructed).toBe(input)
  })

  it('returns unmodified string when variableMap is empty', () => {
    const template = 'Hello world'
    const map = new Map<number, { value: string; description: string; category: string }>()
    expect(reconstructMessage(template, map)).toBe('Hello world')
  })

  it('handles multiple variables', () => {
    const map = new Map<number, { value: string; description: string; category: string }>()
    map.set(1, { value: 'A', description: 'd', category: 'c' })
    map.set(2, { value: 'B', description: 'd', category: 'c' })

    const result = reconstructMessage('{{1}} and {{2}}', map)
    expect(result).toBe('A and B')
  })
})

// ============================================================================
// wrapAsUpdateNotification
// ============================================================================

describe('wrapAsUpdateNotification', () => {
  it('wraps with "info" prefix/suffix by default', () => {
    const result = wrapAsUpdateNotification('Teste')
    expect(result).toContain('Informação importante:')
    expect(result).toContain('ignore esta mensagem')
  })

  it('wraps with "status" prefix/suffix', () => {
    const result = wrapAsUpdateNotification('Teste', 'status')
    expect(result).toContain('Atualização de status:')
    expect(result).toContain('acesse o link')
  })

  it('wraps with "reminder" prefix/suffix', () => {
    const result = wrapAsUpdateNotification('Teste', 'reminder')
    expect(result).toContain('Lembrete:')
    expect(result).toContain('CONFIRMAR')
    expect(result).toContain('CANCELAR')
  })

  it('sanitizes promotional content inside the wrapper', () => {
    const result = wrapAsUpdateNotification('Garanta sua vaga exclusiva!')
    // The promotional words should be replaced with variables
    expect(result).toMatch(/\{\{\d+\}\}/)
  })
})
