import { describe, it, expect } from 'vitest'
import { generateId } from './id'

describe('generateId', () => {
  it('deve gerar um ID com exatamente 21 caracteres', () => {
    const id = generateId()
    expect(id).toHaveLength(21)
  })

  it('deve conter apenas caracteres lowercase e dígitos', () => {
    const id = generateId()
    expect(id).toMatch(/^[a-z0-9]+$/)
  })

  it('deve gerar IDs únicos em múltiplas chamadas', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(generateId())
    }
    expect(ids.size).toBe(100)
  })

  it('não deve conter caracteres maiúsculos', () => {
    // Testar com múltiplos IDs para maior confiança
    for (let i = 0; i < 50; i++) {
      const id = generateId()
      expect(id).toBe(id.toLowerCase())
    }
  })

  it('não deve conter caracteres especiais', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateId()
      expect(id).not.toMatch(/[^a-z0-9]/)
    }
  })

  it('deve retornar uma string', () => {
    expect(typeof generateId()).toBe('string')
  })

  it('deve ser consistente no formato entre múltiplas gerações', () => {
    for (let i = 0; i < 20; i++) {
      const id = generateId()
      expect(id).toHaveLength(21)
      expect(id).toMatch(/^[a-z0-9]{21}$/)
    }
  })
})
