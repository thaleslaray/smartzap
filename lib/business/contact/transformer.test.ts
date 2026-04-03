import { describe, it, expect } from 'vitest'
import {
  transformContactForSending,
  transformContactsForSending,
  transformTestContact,
  createEmptyTransformOptions,
  buildVariableMappingsFromArrays,
  type TransformOptions,
} from './transformer'
import type { Contact, TestContact } from '@/types'
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

const emptyOptions: TransformOptions = { variableMappings: {}, customFields: {} }

// =============================================================================
// transformContactForSending
// =============================================================================

describe('transformContactForSending', () => {
  it('retorna estrutura básica correta', () => {
    const contact = createContact()
    const result = transformContactForSending(contact, emptyOptions)

    expect(result.id).toBe('c-1')
    expect(result.contactId).toBe('c-1')
    expect(result.phone).toBe('+5511999999999')
    expect(result.name).toBe('João Silva')
    expect(result.variables).toEqual({})
  })

  it('usa phone como name fallback quando name é undefined', () => {
    const contact = createContact({ name: undefined })
    const result = transformContactForSending(contact, emptyOptions)
    expect(result.name).toBe('+5511999999999')
  })

  it('usa phone como name fallback quando name é string vazia', () => {
    const contact = createContact({ name: '' })
    const result = transformContactForSending(contact, emptyOptions)
    expect(result.name).toBe('+5511999999999')
  })

  // ---------------------------------------------------------------------------
  // Resolução de variáveis de sistema
  // ---------------------------------------------------------------------------

  describe('resolução de variáveis de sistema', () => {
    it('resolve {{nome}} para o nome do contato', () => {
      const contact = createContact({ name: 'Maria' })
      const options: TransformOptions = {
        variableMappings: { '1': '{{nome}}' },
        customFields: {},
      }
      const result = transformContactForSending(contact, options)
      expect(result.variables['1']).toBe('Maria')
    })

    it('resolve {{name}} para o nome do contato', () => {
      const contact = createContact({ name: 'Pedro' })
      const options: TransformOptions = {
        variableMappings: { '1': '{{name}}' },
        customFields: {},
      }
      const result = transformContactForSending(contact, options)
      expect(result.variables['1']).toBe('Pedro')
    })

    it('resolve {{phone}} e {{telefone}} para o telefone', () => {
      const contact = createContact({ phone: '+5511888' })
      const options: TransformOptions = {
        variableMappings: { '1': '{{phone}}', '2': '{{telefone}}' },
        customFields: {},
      }
      const result = transformContactForSending(contact, options)
      expect(result.variables['1']).toBe('+5511888')
      expect(result.variables['2']).toBe('+5511888')
    })

    it('resolve {{email}} para o email do contato', () => {
      const contact = createContact({ email: 'test@test.com' })
      const options: TransformOptions = {
        variableMappings: { '1': '{{email}}' },
        customFields: {},
      }
      const result = transformContactForSending(contact, options)
      expect(result.variables['1']).toBe('test@test.com')
    })

    it('variável de sistema é case-insensitive', () => {
      const contact = createContact({ name: 'Ana' })
      const options: TransformOptions = {
        variableMappings: { '1': '{{Nome}}' },
        customFields: {},
      }
      const result = transformContactForSending(contact, options)
      expect(result.variables['1']).toBe('Ana')
    })

    it('retorna string vazia para campo de sistema sem valor', () => {
      const contact = createContact({ name: undefined, email: null })
      const options: TransformOptions = {
        variableMappings: { '1': '{{nome}}', '2': '{{email}}' },
        customFields: {},
      }
      const result = transformContactForSending(contact, options)
      expect(result.variables['1']).toBe('')
      expect(result.variables['2']).toBe('')
    })
  })

  // ---------------------------------------------------------------------------
  // Resolução de custom fields
  // ---------------------------------------------------------------------------

  describe('resolução de custom fields', () => {
    it('resolve custom field da opção customFields', () => {
      const contact = createContact({ id: 'c-1' })
      const options: TransformOptions = {
        variableMappings: { '1': '{{cidade}}' },
        customFields: { 'c-1': { cidade: 'São Paulo' } },
      }
      const result = transformContactForSending(contact, options)
      expect(result.variables['1']).toBe('São Paulo')
    })

    it('resolve custom field do próprio contato (custom_fields)', () => {
      const contact = createContact({
        custom_fields: { cidade: 'Rio de Janeiro' },
      })
      const options: TransformOptions = {
        variableMappings: { '1': '{{cidade}}' },
        customFields: {},
      }
      const result = transformContactForSending(contact, options)
      expect(result.variables['1']).toBe('Rio de Janeiro')
    })

    it('customFields da opção tem prioridade sobre contact.custom_fields', () => {
      const contact = createContact({
        id: 'c-1',
        custom_fields: { cidade: 'Rio' },
      })
      const options: TransformOptions = {
        variableMappings: { '1': '{{cidade}}' },
        customFields: { 'c-1': { cidade: 'São Paulo' } },
      }
      const result = transformContactForSending(contact, options)
      expect(result.variables['1']).toBe('São Paulo')
    })

    it('retorna string vazia quando custom field não existe', () => {
      const contact = createContact()
      const options: TransformOptions = {
        variableMappings: { '1': '{{inexistente}}' },
        customFields: {},
      }
      const result = transformContactForSending(contact, options)
      expect(result.variables['1']).toBe('')
    })

    it('converte valor numérico de custom_fields para string', () => {
      const contact = createContact({
        custom_fields: { idade: 30 },
      })
      const options: TransformOptions = {
        variableMappings: { '1': '{{idade}}' },
        customFields: {},
      }
      const result = transformContactForSending(contact, options)
      expect(result.variables['1']).toBe('30')
    })

    it('retorna string vazia quando custom_fields tem valor null', () => {
      const contact = createContact({
        custom_fields: { campo: null },
      })
      const options: TransformOptions = {
        variableMappings: { '1': '{{campo}}' },
        customFields: {},
      }
      const result = transformContactForSending(contact, options)
      expect(result.variables['1']).toBe('')
    })
  })

  // ---------------------------------------------------------------------------
  // Valores literais (sem template syntax)
  // ---------------------------------------------------------------------------

  describe('valores literais', () => {
    it('retorna valor literal quando não é referência {{}}', () => {
      const contact = createContact()
      const options: TransformOptions = {
        variableMappings: { '1': 'texto fixo' },
        customFields: {},
      }
      const result = transformContactForSending(contact, options)
      expect(result.variables['1']).toBe('texto fixo')
    })

    it('retorna string vazia quando valor literal é string vazia', () => {
      const contact = createContact()
      const options: TransformOptions = {
        variableMappings: { '1': '' },
        customFields: {},
      }
      const result = transformContactForSending(contact, options)
      expect(result.variables['1']).toBe('')
    })
  })

  // ---------------------------------------------------------------------------
  // Múltiplas variáveis
  // ---------------------------------------------------------------------------

  describe('múltiplas variáveis', () => {
    it('resolve múltiplas variáveis de tipos diferentes', () => {
      const contact = createContact({
        id: 'c-1',
        name: 'João',
        custom_fields: { empresa: 'ACME' },
      })
      const options: TransformOptions = {
        variableMappings: {
          '1': '{{nome}}',
          '2': '{{empresa}}',
          '3': 'Bem-vindo!',
        },
        customFields: {},
      }
      const result = transformContactForSending(contact, options)
      expect(result.variables).toEqual({
        '1': 'João',
        '2': 'ACME',
        '3': 'Bem-vindo!',
      })
    })
  })
})

// =============================================================================
// transformContactsForSending
// =============================================================================

describe('transformContactsForSending', () => {
  it('transforma múltiplos contatos', () => {
    const contacts = [
      createContact({ id: 'c-1', name: 'João' }),
      createContact({ id: 'c-2', name: 'Maria', phone: '+5522222222222' }),
    ]
    const options: TransformOptions = {
      variableMappings: { '1': '{{nome}}' },
      customFields: {},
    }
    const results = transformContactsForSending(contacts, options)

    expect(results).toHaveLength(2)
    expect(results[0].name).toBe('João')
    expect(results[0].variables['1']).toBe('João')
    expect(results[1].name).toBe('Maria')
    expect(results[1].variables['1']).toBe('Maria')
  })

  it('retorna array vazio para input vazio', () => {
    expect(transformContactsForSending([], emptyOptions)).toEqual([])
  })

  it('resolve customFields por contactId individualmente', () => {
    const contacts = [
      createContact({ id: 'c-1' }),
      createContact({ id: 'c-2', phone: '+5522222222222' }),
    ]
    const options: TransformOptions = {
      variableMappings: { '1': '{{cidade}}' },
      customFields: {
        'c-1': { cidade: 'SP' },
        'c-2': { cidade: 'RJ' },
      },
    }
    const results = transformContactsForSending(contacts, options)
    expect(results[0].variables['1']).toBe('SP')
    expect(results[1].variables['1']).toBe('RJ')
  })
})

// =============================================================================
// transformTestContact
// =============================================================================

describe('transformTestContact', () => {
  it('transforma contato de teste com nome', () => {
    const testContact: TestContact = { name: 'Teste', phone: '+5511900000000' }
    const result = transformTestContact(testContact, 'test-id', { '1': '{{nome}}' })

    expect(result.id).toBe('test-id')
    expect(result.contactId).toBe('test-id')
    expect(result.phone).toBe('+5511900000000')
    expect(result.name).toBe('Teste')
    expect(result.variables['1']).toBe('Teste')
  })

  it('usa phone como name quando name é undefined', () => {
    const testContact: TestContact = { phone: '+5511900000000' }
    const result = transformTestContact(testContact, 'test-id', {})

    expect(result.name).toBe('+5511900000000')
  })

  it('usa phone como name quando name é string vazia', () => {
    const testContact: TestContact = { name: '', phone: '+5511900000000' }
    const result = transformTestContact(testContact, 'test-id', {})

    expect(result.name).toBe('+5511900000000')
  })

  it('resolve variáveis de sistema no contato de teste', () => {
    const testContact: TestContact = { name: 'Teste', phone: '+5511900000000' }
    const mappings = { '1': '{{nome}}', '2': '{{phone}}' }
    const result = transformTestContact(testContact, 'test-id', mappings)

    expect(result.variables['1']).toBe('Teste')
    expect(result.variables['2']).toBe('+5511900000000')
  })

  it('sem variableMappings retorna variables vazio', () => {
    const testContact: TestContact = { name: 'Teste', phone: '+5511900000000' }
    const result = transformTestContact(testContact, 'test-id', {})
    expect(result.variables).toEqual({})
  })
})

// =============================================================================
// createEmptyTransformOptions
// =============================================================================

describe('createEmptyTransformOptions', () => {
  it('retorna opções com mappings e customFields vazios', () => {
    const opts = createEmptyTransformOptions()
    expect(opts.variableMappings).toEqual({})
    expect(opts.customFields).toEqual({})
  })

  it('retorna nova instância a cada chamada', () => {
    const a = createEmptyTransformOptions()
    const b = createEmptyTransformOptions()
    expect(a).not.toBe(b)
    expect(a.variableMappings).not.toBe(b.variableMappings)
  })
})

// =============================================================================
// buildVariableMappingsFromArrays
// =============================================================================

describe('buildVariableMappingsFromArrays', () => {
  it('converte arrays de header e body para Record', () => {
    const result = buildVariableMappingsFromArrays(
      ['{{nome}}'],
      ['{{nome}}', '{{cidade}}']
    )
    expect(result).toEqual({
      header_1: '{{nome}}',
      body_1: '{{nome}}',
      body_2: '{{cidade}}',
    })
  })

  it('ignora valores vazios (falsy) nos arrays', () => {
    const result = buildVariableMappingsFromArrays(['', '{{nome}}'], ['', '', '{{cidade}}'])
    expect(result).toEqual({
      header_2: '{{nome}}',
      body_3: '{{cidade}}',
    })
  })

  it('retorna objeto vazio para arrays vazios', () => {
    expect(buildVariableMappingsFromArrays([], [])).toEqual({})
  })

  it('funciona com apenas header', () => {
    const result = buildVariableMappingsFromArrays(['{{nome}}'], [])
    expect(result).toEqual({ header_1: '{{nome}}' })
  })

  it('funciona com apenas body', () => {
    const result = buildVariableMappingsFromArrays([], ['{{cidade}}'])
    expect(result).toEqual({ body_1: '{{cidade}}' })
  })

  it('indexação começa em 1 (não 0)', () => {
    const result = buildVariableMappingsFromArrays(['a', 'b'], ['x', 'y', 'z'])
    expect(Object.keys(result)).toEqual([
      'header_1', 'header_2',
      'body_1', 'body_2', 'body_3',
    ])
  })
})
