import { describe, it, expect } from 'vitest'
import {
  normalizeEmailForUpdate,
  sanitizeCustomFieldsForUpdate,
  toggleContactSelection,
  toggleSelectAllContacts,
  selectAllContactsGlobal,
  clearContactSelection,
} from './bulk-operations'

// =============================================================================
// normalizeEmailForUpdate
// =============================================================================

describe('normalizeEmailForUpdate', () => {
  it('faz trim de espaços', () => {
    expect(normalizeEmailForUpdate('  user@example.com  ')).toBe('user@example.com')
  })

  it('retorna string quando email é válido', () => {
    expect(normalizeEmailForUpdate('user@example.com')).toBe('user@example.com')
  })

  it('retorna null para string vazia', () => {
    expect(normalizeEmailForUpdate('')).toBeNull()
  })

  it('retorna null para string com apenas espaços', () => {
    expect(normalizeEmailForUpdate('   ')).toBeNull()
  })

  it('retorna null para null', () => {
    expect(normalizeEmailForUpdate(null)).toBeNull()
  })

  it('retorna null para undefined', () => {
    expect(normalizeEmailForUpdate(undefined)).toBeNull()
  })

  it('retorna null quando chamado sem argumentos', () => {
    expect(normalizeEmailForUpdate()).toBeNull()
  })

  it('preserva case do email', () => {
    expect(normalizeEmailForUpdate('User@Example.COM')).toBe('User@Example.COM')
  })
})

// =============================================================================
// sanitizeCustomFieldsForUpdate
// =============================================================================

describe('sanitizeCustomFieldsForUpdate', () => {
  it('mantém campos com valores válidos', () => {
    const result = sanitizeCustomFieldsForUpdate({
      name: 'John',
      age: 30,
      active: true,
    })
    expect(result).toEqual({ name: 'John', age: 30, active: true })
  })

  it('remove valores undefined', () => {
    const result = sanitizeCustomFieldsForUpdate({
      name: 'John',
      city: undefined,
    })
    expect(result).toEqual({ name: 'John' })
  })

  it('remove valores null', () => {
    const result = sanitizeCustomFieldsForUpdate({
      name: 'John',
      city: null,
    })
    expect(result).toEqual({ name: 'John' })
  })

  it('remove strings vazias', () => {
    const result = sanitizeCustomFieldsForUpdate({
      name: 'John',
      empty: '',
    })
    expect(result).toEqual({ name: 'John' })
  })

  it('remove strings com apenas espaços', () => {
    const result = sanitizeCustomFieldsForUpdate({
      name: 'John',
      spaces: '   ',
    })
    expect(result).toEqual({ name: 'John' })
  })

  it('mantém valores numéricos, incluindo zero', () => {
    const result = sanitizeCustomFieldsForUpdate({
      count: 0,
      score: 100,
    })
    expect(result).toEqual({ count: 0, score: 100 })
  })

  it('mantém booleanos, incluindo false', () => {
    const result = sanitizeCustomFieldsForUpdate({
      active: false,
      verified: true,
    })
    expect(result).toEqual({ active: false, verified: true })
  })

  it('retorna undefined quando input é undefined', () => {
    expect(sanitizeCustomFieldsForUpdate(undefined)).toBeUndefined()
  })

  it('retorna objeto vazio quando todos os campos são removidos', () => {
    const result = sanitizeCustomFieldsForUpdate({
      a: undefined,
      b: null,
      c: '',
      d: '   ',
    })
    expect(result).toEqual({})
  })

  it('retorna objeto vazio para input vazio', () => {
    expect(sanitizeCustomFieldsForUpdate({})).toEqual({})
  })
})

// =============================================================================
// toggleContactSelection
// =============================================================================

describe('toggleContactSelection', () => {
  it('adiciona id quando não está selecionado', () => {
    const prev = new Set(['a', 'b'])
    const result = toggleContactSelection(prev, 'c')
    expect(result.has('c')).toBe(true)
    expect(result.size).toBe(3)
  })

  it('remove id quando já está selecionado', () => {
    const prev = new Set(['a', 'b'])
    const result = toggleContactSelection(prev, 'b')
    expect(result.has('b')).toBe(false)
    expect(result.size).toBe(1)
  })

  it('não muta o Set original', () => {
    const prev = new Set(['a', 'b'])
    toggleContactSelection(prev, 'c')
    expect(prev.size).toBe(2)
    expect(prev.has('c')).toBe(false)
  })

  it('retorna novo Set (referência diferente)', () => {
    const prev = new Set(['a'])
    const result = toggleContactSelection(prev, 'a')
    expect(result).not.toBe(prev)
  })

  it('funciona com Set vazio', () => {
    const result = toggleContactSelection(new Set(), 'a')
    expect(result.size).toBe(1)
    expect(result.has('a')).toBe(true)
  })
})

// =============================================================================
// toggleSelectAllContacts
// =============================================================================

describe('toggleSelectAllContacts', () => {
  it('adiciona todos da página quando allSelected é false', () => {
    const selected = new Set(['a'])
    const result = toggleSelectAllContacts(selected, ['b', 'c'], false)
    expect(result).toEqual(new Set(['a', 'b', 'c']))
  })

  it('remove todos da página quando allSelected é true', () => {
    const selected = new Set(['a', 'b', 'c'])
    const result = toggleSelectAllContacts(selected, ['b', 'c'], true)
    expect(result).toEqual(new Set(['a']))
  })

  it('não muta o Set original', () => {
    const selected = new Set(['a'])
    toggleSelectAllContacts(selected, ['b'], false)
    expect(selected.size).toBe(1)
  })

  it('retorna o mesmo Set quando pageContactIds é vazio', () => {
    const selected = new Set(['a'])
    const result = toggleSelectAllContacts(selected, [], false)
    expect(result).toBe(selected) // mesma referência
  })

  it('funciona com Set vazio e pageContactIds com itens', () => {
    const result = toggleSelectAllContacts(new Set(), ['a', 'b'], false)
    expect(result).toEqual(new Set(['a', 'b']))
  })

  it('remove todos resulta em Set vazio quando só tinha pageContacts', () => {
    const selected = new Set(['a', 'b'])
    const result = toggleSelectAllContacts(selected, ['a', 'b'], true)
    expect(result.size).toBe(0)
  })

  it('não duplica ids que já estão selecionados ao adicionar', () => {
    const selected = new Set(['a', 'b'])
    const result = toggleSelectAllContacts(selected, ['a', 'c'], false)
    expect(result).toEqual(new Set(['a', 'b', 'c']))
    expect(result.size).toBe(3)
  })
})

// =============================================================================
// selectAllContactsGlobal
// =============================================================================

describe('selectAllContactsGlobal', () => {
  it('retorna Set com todos os IDs', () => {
    const result = selectAllContactsGlobal(['a', 'b', 'c'])
    expect(result).toEqual(new Set(['a', 'b', 'c']))
  })

  it('retorna Set vazio para array vazio', () => {
    const result = selectAllContactsGlobal([])
    expect(result.size).toBe(0)
  })

  it('remove duplicatas automaticamente (comportamento do Set)', () => {
    const result = selectAllContactsGlobal(['a', 'a', 'b'])
    expect(result.size).toBe(2)
  })
})

// =============================================================================
// clearContactSelection
// =============================================================================

describe('clearContactSelection', () => {
  it('retorna Set vazio', () => {
    const result = clearContactSelection()
    expect(result.size).toBe(0)
  })

  it('retorna nova instância a cada chamada', () => {
    const a = clearContactSelection()
    const b = clearContactSelection()
    expect(a).not.toBe(b)
  })

  it('retorna instância de Set', () => {
    expect(clearContactSelection()).toBeInstanceOf(Set)
  })
})
