import { describe, it, expect } from 'vitest'
import type { Contact } from '@/types/contact.types'
import type { CustomFieldDefinition } from '@/types/contact.types'
import { ContactStatus } from '@/types/contact.types'
import {
  SYSTEM_FIELDS,
  SYSTEM_FIELD_NAMES,
  isSystemField,
  getSystemFieldKey,
  autoMapVariables,
  generateAutoFillValues,
  resolveVariableValue,
  resolveAllVariables,
  canResolveAllVariables,
  getUnresolvedVariables,
} from './variable-mapper'

// =============================================================================
// Helpers
// =============================================================================

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: '1',
    name: 'João Silva',
    phone: '+5511999999999',
    email: 'joao@example.com',
    status: ContactStatus.OPT_IN,
    tags: [],
    lastActive: '2024-01-01T00:00:00Z',
    custom_fields: {},
    ...overrides,
  }
}

function makeCustomField(overrides: Partial<CustomFieldDefinition> = {}): CustomFieldDefinition {
  return {
    id: 'cf-1',
    key: 'produto',
    label: 'Produto',
    type: 'text',
    entity_type: 'contact',
    ...overrides,
  }
}

// =============================================================================
// SYSTEM_FIELDS & SYSTEM_FIELD_NAMES
// =============================================================================

describe('SYSTEM_FIELDS', () => {
  it('mapeia nome → name', () => {
    expect(SYSTEM_FIELDS.nome).toBe('name')
  })

  it('mapeia telefone → phone', () => {
    expect(SYSTEM_FIELDS.telefone).toBe('phone')
  })

  it('mapeia email → email', () => {
    expect(SYSTEM_FIELDS.email).toBe('email')
  })

  it('mapeia variações de telefone (fone, cel, celular, whatsapp) → phone', () => {
    expect(SYSTEM_FIELDS.fone).toBe('phone')
    expect(SYSTEM_FIELDS.cel).toBe('phone')
    expect(SYSTEM_FIELDS.celular).toBe('phone')
    expect(SYSTEM_FIELDS.whatsapp).toBe('phone')
  })

  it('mapeia nomes em inglês (name, phone)', () => {
    expect(SYSTEM_FIELDS.name).toBe('name')
    expect(SYSTEM_FIELDS.phone).toBe('phone')
  })
})

describe('SYSTEM_FIELD_NAMES', () => {
  it('contém todas as chaves do SYSTEM_FIELDS', () => {
    const keys = Object.keys(SYSTEM_FIELDS)
    expect(SYSTEM_FIELD_NAMES).toEqual(keys)
  })
})

// =============================================================================
// isSystemField
// =============================================================================

describe('isSystemField', () => {
  it('retorna true para campo de sistema em português', () => {
    expect(isSystemField('nome')).toBe(true)
    expect(isSystemField('telefone')).toBe(true)
    expect(isSystemField('email')).toBe(true)
  })

  it('retorna true para campo de sistema em inglês', () => {
    expect(isSystemField('name')).toBe(true)
    expect(isSystemField('phone')).toBe(true)
  })

  it('é case-insensitive', () => {
    expect(isSystemField('NOME')).toBe(true)
    expect(isSystemField('Nome')).toBe(true)
    expect(isSystemField('TELEFONE')).toBe(true)
  })

  it('retorna true para variações de telefone', () => {
    expect(isSystemField('fone')).toBe(true)
    expect(isSystemField('cel')).toBe(true)
    expect(isSystemField('celular')).toBe(true)
    expect(isSystemField('whatsapp')).toBe(true)
  })

  it('retorna false para campo desconhecido', () => {
    expect(isSystemField('produto')).toBe(false)
    expect(isSystemField('endereco')).toBe(false)
    expect(isSystemField('cpf')).toBe(false)
  })
})

// =============================================================================
// getSystemFieldKey
// =============================================================================

describe('getSystemFieldKey', () => {
  it('retorna "name" para nome', () => {
    expect(getSystemFieldKey('nome')).toBe('name')
  })

  it('retorna "phone" para telefone', () => {
    expect(getSystemFieldKey('telefone')).toBe('phone')
  })

  it('retorna "email" para email', () => {
    expect(getSystemFieldKey('email')).toBe('email')
  })

  it('é case-insensitive', () => {
    expect(getSystemFieldKey('NOME')).toBe('name')
    expect(getSystemFieldKey('Telefone')).toBe('phone')
  })

  it('retorna null para campo desconhecido', () => {
    expect(getSystemFieldKey('produto')).toBeNull()
    expect(getSystemFieldKey('xyz')).toBeNull()
  })

  it('retorna "phone" para variações', () => {
    expect(getSystemFieldKey('fone')).toBe('phone')
    expect(getSystemFieldKey('cel')).toBe('phone')
    expect(getSystemFieldKey('celular')).toBe('phone')
    expect(getSystemFieldKey('whatsapp')).toBe('phone')
  })
})

// =============================================================================
// autoMapVariables
// =============================================================================

describe('autoMapVariables', () => {
  it('mapeia campos de sistema', () => {
    const result = autoMapVariables(['nome', 'telefone'])
    expect(result).toEqual([
      { variable: 'nome', field: 'name', isSystem: true },
      { variable: 'telefone', field: 'phone', isSystem: true },
    ])
  })

  it('mapeia campo customizado por key (match exato)', () => {
    const customFields = [makeCustomField({ key: 'produto', label: 'Produto' })]
    const result = autoMapVariables(['produto'], customFields)
    expect(result).toEqual([
      { variable: 'produto', field: 'produto', isSystem: false },
    ])
  })

  it('mapeia campo customizado por label (case-insensitive)', () => {
    const customFields = [makeCustomField({ key: 'cod_prod', label: 'Código' })]
    const result = autoMapVariables(['código'], customFields)
    expect(result).toEqual([
      { variable: 'código', field: 'cod_prod', isSystem: false },
    ])
  })

  it('prioriza system fields sobre custom fields', () => {
    const customFields = [makeCustomField({ key: 'nome', label: 'Nome Alternativo' })]
    const result = autoMapVariables(['nome'], customFields)
    expect(result[0].isSystem).toBe(true)
    expect(result[0].field).toBe('name')
  })

  it('prioriza match por key sobre match por label', () => {
    const customFields = [
      makeCustomField({ id: '1', key: 'produto', label: 'Item' }),
      makeCustomField({ id: '2', key: 'item', label: 'Produto' }),
    ]
    const result = autoMapVariables(['produto'], customFields)
    expect(result[0].field).toBe('produto')
  })

  it('retorna field vazio quando não encontra match', () => {
    const result = autoMapVariables(['desconhecido'])
    expect(result).toEqual([
      { variable: 'desconhecido', field: '', isSystem: false },
    ])
  })

  it('funciona sem customFields', () => {
    const result = autoMapVariables(['nome', 'xyz'])
    expect(result).toHaveLength(2)
    expect(result[0].isSystem).toBe(true)
    expect(result[1].field).toBe('')
  })

  it('retorna array vazio para variáveis vazias', () => {
    const result = autoMapVariables([])
    expect(result).toEqual([])
  })
})

// =============================================================================
// generateAutoFillValues
// =============================================================================

describe('generateAutoFillValues', () => {
  it('gera placeholder para campos de sistema reconhecidos', () => {
    const result = generateAutoFillValues(['nome', 'telefone', 'email'])
    expect(result).toEqual(['{{nome}}', '{{telefone}}', '{{email}}'])
  })

  it('retorna string vazia para campos não reconhecidos', () => {
    const result = generateAutoFillValues(['produto', 'codigo'])
    expect(result).toEqual(['', ''])
  })

  it('é case-insensitive para detecção', () => {
    const result = generateAutoFillValues(['Nome', 'TELEFONE'])
    expect(result).toEqual(['{{nome}}', '{{telefone}}'])
  })

  it('retorna array vazio para entrada vazia', () => {
    const result = generateAutoFillValues([])
    expect(result).toEqual([])
  })

  it('gera valores mistos corretamente', () => {
    const result = generateAutoFillValues(['nome', 'produto', 'email'])
    expect(result).toEqual(['{{nome}}', '', '{{email}}'])
  })
})

// =============================================================================
// resolveVariableValue
// =============================================================================

describe('resolveVariableValue', () => {
  const contact = makeContact({
    name: 'Maria',
    phone: '+5511888888888',
    email: 'maria@test.com',
    custom_fields: { produto: 'Tênis', qtd: 3 },
  })

  it('resolve campo de sistema "nome" → contact.name', () => {
    expect(resolveVariableValue('nome', contact)).toBe('Maria')
  })

  it('resolve campo de sistema "telefone" → contact.phone', () => {
    expect(resolveVariableValue('telefone', contact)).toBe('+5511888888888')
  })

  it('resolve campo de sistema "email" → contact.email', () => {
    expect(resolveVariableValue('email', contact)).toBe('maria@test.com')
  })

  it('resolve variação "cel" → contact.phone', () => {
    expect(resolveVariableValue('cel', contact)).toBe('+5511888888888')
  })

  it('resolve custom field do contato', () => {
    expect(resolveVariableValue('produto', contact)).toBe('Tênis')
  })

  it('converte custom field não-string para string', () => {
    expect(resolveVariableValue('qtd', contact)).toBe('3')
  })

  it('prioriza customFieldValues sobre contact.custom_fields', () => {
    const overrides = { produto: 'Mochila' }
    expect(resolveVariableValue('produto', contact, overrides)).toBe('Mochila')
  })

  it('retorna string vazia para variável desconhecida', () => {
    expect(resolveVariableValue('xyz', contact)).toBe('')
  })

  it('retorna string vazia quando contato não tem name', () => {
    const noName = makeContact({ name: undefined })
    expect(resolveVariableValue('nome', noName)).toBe('')
  })

  it('retorna string vazia quando contato não tem email', () => {
    const noEmail = makeContact({ email: null })
    expect(resolveVariableValue('email', noEmail)).toBe('')
  })

  it('retorna string vazia quando custom_fields é undefined', () => {
    const noCustom = makeContact({ custom_fields: undefined })
    expect(resolveVariableValue('produto', noCustom)).toBe('')
  })

  it('retorna string vazia quando custom field valor é null', () => {
    const nullField = makeContact({ custom_fields: { x: null } })
    expect(resolveVariableValue('x', nullField)).toBe('')
  })
})

// =============================================================================
// resolveAllVariables
// =============================================================================

describe('resolveAllVariables', () => {
  const contact = makeContact({
    name: 'João',
    phone: '+5511999999999',
    custom_fields: { produto: 'Camisa' },
  })

  it('resolve todas as variáveis', () => {
    const result = resolveAllVariables(['nome', 'telefone', 'produto'], contact)
    expect(result).toEqual([
      { variable: 'nome', value: 'João', resolved: true },
      { variable: 'telefone', value: '+5511999999999', resolved: true },
      { variable: 'produto', value: 'Camisa', resolved: true },
    ])
  })

  it('marca resolved=false para variáveis não resolvidas', () => {
    const result = resolveAllVariables(['nome', 'desconhecido'], contact)
    expect(result[0].resolved).toBe(true)
    expect(result[1].resolved).toBe(false)
    expect(result[1].value).toBe('')
  })

  it('usa customFieldValues quando fornecido', () => {
    const result = resolveAllVariables(['codigo'], contact, { codigo: 'ABC123' })
    expect(result[0]).toEqual({ variable: 'codigo', value: 'ABC123', resolved: true })
  })

  it('retorna array vazio para lista vazia', () => {
    const result = resolveAllVariables([], contact)
    expect(result).toEqual([])
  })
})

// =============================================================================
// canResolveAllVariables
// =============================================================================

describe('canResolveAllVariables', () => {
  const contact = makeContact({
    name: 'Ana',
    phone: '+5511777777777',
    custom_fields: { cidade: 'São Paulo' },
  })

  it('retorna true quando todas as variáveis são resolvidas', () => {
    expect(canResolveAllVariables(['nome', 'telefone', 'cidade'], contact)).toBe(true)
  })

  it('retorna false quando alguma variável não é resolvida', () => {
    expect(canResolveAllVariables(['nome', 'xyz'], contact)).toBe(false)
  })

  it('retorna true para lista vazia', () => {
    expect(canResolveAllVariables([], contact)).toBe(true)
  })

  it('considera customFieldValues', () => {
    expect(canResolveAllVariables(['codigo'], contact, { codigo: 'X' })).toBe(true)
  })
})

// =============================================================================
// getUnresolvedVariables
// =============================================================================

describe('getUnresolvedVariables', () => {
  const contact = makeContact({
    name: 'Pedro',
    phone: '+5511666666666',
  })

  it('retorna variáveis que não puderam ser resolvidas', () => {
    const result = getUnresolvedVariables(['nome', 'produto', 'codigo'], contact)
    expect(result).toEqual(['produto', 'codigo'])
  })

  it('retorna array vazio quando todas são resolvidas', () => {
    const result = getUnresolvedVariables(['nome', 'telefone'], contact)
    expect(result).toEqual([])
  })

  it('retorna array vazio para lista vazia', () => {
    const result = getUnresolvedVariables([], contact)
    expect(result).toEqual([])
  })

  it('considera customFieldValues', () => {
    const result = getUnresolvedVariables(['produto'], contact, { produto: 'Livro' })
    expect(result).toEqual([])
  })
})
