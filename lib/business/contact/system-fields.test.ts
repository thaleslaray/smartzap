import { describe, it, expect } from 'vitest'
import {
  SYSTEM_FIELDS,
  isSystemField,
  getSystemFieldValue,
  getAllSystemFieldNames,
  getUniqueSystemFieldKeys,
  type SystemFieldName,
} from './system-fields'
import type { Contact } from '@/types'
import { ContactStatus } from '@/types'

// =============================================================================
// Helpers
// =============================================================================

const createContact = (overrides?: Partial<Contact>): Contact => ({
  id: 'c-1',
  name: 'João Silva',
  phone: '+5511999999999',
  email: 'joao@example.com',
  status: ContactStatus.OPT_IN,
  tags: [],
  lastActive: '2024-01-01T00:00:00.000Z',
  ...overrides,
})

// =============================================================================
// SYSTEM_FIELDS
// =============================================================================

describe('SYSTEM_FIELDS', () => {
  it('contém as 5 chaves esperadas', () => {
    const keys = Object.keys(SYSTEM_FIELDS)
    expect(keys).toEqual(['nome', 'name', 'telefone', 'phone', 'email'])
  })

  it('nome e name acessam o campo name do contato', () => {
    const contact = createContact({ name: 'Maria' })
    expect(SYSTEM_FIELDS.nome.accessor(contact)).toBe('Maria')
    expect(SYSTEM_FIELDS.name.accessor(contact)).toBe('Maria')
  })

  it('nome retorna string vazia quando name é undefined', () => {
    const contact = createContact({ name: undefined })
    expect(SYSTEM_FIELDS.nome.accessor(contact)).toBe('')
  })

  it('telefone e phone acessam o campo phone do contato', () => {
    const contact = createContact({ phone: '+5511888888888' })
    expect(SYSTEM_FIELDS.telefone.accessor(contact)).toBe('+5511888888888')
    expect(SYSTEM_FIELDS.phone.accessor(contact)).toBe('+5511888888888')
  })

  it('email acessa o campo email do contato', () => {
    const contact = createContact({ email: 'test@test.com' })
    expect(SYSTEM_FIELDS.email.accessor(contact)).toBe('test@test.com')
  })

  it('email retorna string vazia quando email é undefined', () => {
    const contact = createContact({ email: undefined })
    expect(SYSTEM_FIELDS.email.accessor(contact)).toBe('')
  })

  it('email retorna string vazia quando email é null', () => {
    const contact = createContact({ email: null })
    expect(SYSTEM_FIELDS.email.accessor(contact)).toBe('')
  })

  it('cada campo tem key e label corretos', () => {
    expect(SYSTEM_FIELDS.nome.key).toBe('name')
    expect(SYSTEM_FIELDS.nome.label).toBe('Nome')
    expect(SYSTEM_FIELDS.telefone.key).toBe('phone')
    expect(SYSTEM_FIELDS.telefone.label).toBe('Telefone')
    expect(SYSTEM_FIELDS.email.key).toBe('email')
    expect(SYSTEM_FIELDS.email.label).toBe('Email')
  })
})

// =============================================================================
// isSystemField
// =============================================================================

describe('isSystemField', () => {
  it('retorna true para nomes em português', () => {
    expect(isSystemField('nome')).toBe(true)
    expect(isSystemField('telefone')).toBe(true)
  })

  it('retorna true para nomes em inglês', () => {
    expect(isSystemField('name')).toBe(true)
    expect(isSystemField('phone')).toBe(true)
    expect(isSystemField('email')).toBe(true)
  })

  it('é case-insensitive', () => {
    expect(isSystemField('Nome')).toBe(true)
    expect(isSystemField('NAME')).toBe(true)
    expect(isSystemField('TELEFONE')).toBe(true)
    expect(isSystemField('Email')).toBe(true)
  })

  it('retorna false para campos não-sistema', () => {
    expect(isSystemField('cidade')).toBe(false)
    expect(isSystemField('custom')).toBe(false)
    expect(isSystemField('address')).toBe(false)
  })

  it('retorna false para string vazia', () => {
    expect(isSystemField('')).toBe(false)
  })
})

// =============================================================================
// getSystemFieldValue
// =============================================================================

describe('getSystemFieldValue', () => {
  const contact = createContact({
    name: 'Ana Costa',
    phone: '+5521888887777',
    email: 'ana@test.com',
  })

  it('retorna nome via "nome"', () => {
    expect(getSystemFieldValue('nome' as SystemFieldName, contact)).toBe('Ana Costa')
  })

  it('retorna nome via "name"', () => {
    expect(getSystemFieldValue('name' as SystemFieldName, contact)).toBe('Ana Costa')
  })

  it('retorna telefone via "telefone"', () => {
    expect(getSystemFieldValue('telefone' as SystemFieldName, contact)).toBe('+5521888887777')
  })

  it('retorna telefone via "phone"', () => {
    expect(getSystemFieldValue('phone' as SystemFieldName, contact)).toBe('+5521888887777')
  })

  it('retorna email via "email"', () => {
    expect(getSystemFieldValue('email' as SystemFieldName, contact)).toBe('ana@test.com')
  })

  it('retorna string vazia para contato sem nome', () => {
    const noName = createContact({ name: undefined })
    expect(getSystemFieldValue('nome' as SystemFieldName, noName)).toBe('')
  })

  it('retorna string vazia para contato sem email', () => {
    const noEmail = createContact({ email: null })
    expect(getSystemFieldValue('email' as SystemFieldName, noEmail)).toBe('')
  })
})

// =============================================================================
// getAllSystemFieldNames
// =============================================================================

describe('getAllSystemFieldNames', () => {
  it('retorna todas as 5 chaves', () => {
    const names = getAllSystemFieldNames()
    expect(names).toEqual(['nome', 'name', 'telefone', 'phone', 'email'])
  })

  it('retorna um array', () => {
    expect(Array.isArray(getAllSystemFieldNames())).toBe(true)
  })
})

// =============================================================================
// getUniqueSystemFieldKeys
// =============================================================================

describe('getUniqueSystemFieldKeys', () => {
  it('retorna as 3 chaves únicas internas', () => {
    expect(getUniqueSystemFieldKeys()).toEqual(['name', 'phone', 'email'])
  })

  it('não contém duplicatas', () => {
    const keys = getUniqueSystemFieldKeys()
    expect(new Set(keys).size).toBe(keys.length)
  })
})
