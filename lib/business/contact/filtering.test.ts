import { describe, it, expect } from 'vitest'
import { matchesContactFilter, filterContacts, type ContactFilterCriteria } from './filtering'
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
  tags: ['vip', 'lead'],
  lastActive: '2024-01-01T00:00:00.000Z',
  ...overrides,
})

// =============================================================================
// matchesContactFilter
// =============================================================================

describe('matchesContactFilter', () => {
  // ---------------------------------------------------------------------------
  // Critério vazio (sem filtros)
  // ---------------------------------------------------------------------------

  describe('sem critérios', () => {
    it('retorna true quando criteria está vazio', () => {
      expect(matchesContactFilter(createContact(), {})).toBe(true)
    })

    it('retorna true com searchTerm undefined', () => {
      expect(matchesContactFilter(createContact(), { searchTerm: undefined })).toBe(true)
    })

    it('retorna true com searchTerm string vazia', () => {
      expect(matchesContactFilter(createContact(), { searchTerm: '' })).toBe(true)
    })

    it('retorna true com searchTerm contendo apenas espaços', () => {
      expect(matchesContactFilter(createContact(), { searchTerm: '   ' })).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Filtro por searchTerm
  // ---------------------------------------------------------------------------

  describe('filtro por searchTerm', () => {
    it('busca por nome (case-insensitive)', () => {
      expect(matchesContactFilter(createContact(), { searchTerm: 'joão' })).toBe(true)
      expect(matchesContactFilter(createContact(), { searchTerm: 'SILVA' })).toBe(true)
    })

    it('busca por telefone', () => {
      expect(matchesContactFilter(createContact(), { searchTerm: '999999' })).toBe(true)
    })

    it('busca por email', () => {
      expect(matchesContactFilter(createContact(), { searchTerm: 'joao@' })).toBe(true)
    })

    it('retorna false quando nenhum campo bate', () => {
      expect(matchesContactFilter(createContact(), { searchTerm: 'xyz123' })).toBe(false)
    })

    it('funciona com contato sem nome (name undefined)', () => {
      const contact = createContact({ name: undefined })
      expect(matchesContactFilter(contact, { searchTerm: '999' })).toBe(true)
      expect(matchesContactFilter(contact, { searchTerm: 'João' })).toBe(false)
    })

    it('funciona com contato sem email (email undefined)', () => {
      const contact = createContact({ email: undefined })
      expect(matchesContactFilter(contact, { searchTerm: 'example.com' })).toBe(false)
      expect(matchesContactFilter(contact, { searchTerm: 'João' })).toBe(true)
    })

    it('funciona com contato sem email (email null)', () => {
      const contact = createContact({ email: null })
      expect(matchesContactFilter(contact, { searchTerm: 'example.com' })).toBe(false)
    })

    it('trim no termo de busca', () => {
      expect(matchesContactFilter(createContact(), { searchTerm: '  João  ' })).toBe(true)
    })

    it('busca parcial funciona', () => {
      expect(matchesContactFilter(createContact(), { searchTerm: 'Jo' })).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Filtro por status
  // ---------------------------------------------------------------------------

  describe('filtro por status', () => {
    it('status "ALL" aceita qualquer contato', () => {
      expect(matchesContactFilter(createContact(), { status: 'ALL' })).toBe(true)
    })

    it('status correspondente retorna true (case-insensitive)', () => {
      expect(matchesContactFilter(createContact(), { status: 'Opt-in' })).toBe(true)
      expect(matchesContactFilter(createContact(), { status: 'opt-in' })).toBe(true)
      expect(matchesContactFilter(createContact(), { status: 'OPT-IN' })).toBe(true)
    })

    it('status diferente retorna false', () => {
      expect(matchesContactFilter(createContact(), { status: 'Opt-out' })).toBe(false)
    })

    it('status undefined não filtra', () => {
      expect(matchesContactFilter(createContact(), { status: undefined })).toBe(true)
    })

    it('status string vazia não filtra', () => {
      expect(matchesContactFilter(createContact(), { status: '' })).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Filtro por tags
  // ---------------------------------------------------------------------------

  describe('filtro por tags', () => {
    it('contato com tag correspondente retorna true', () => {
      expect(matchesContactFilter(createContact(), { tags: ['vip'] })).toBe(true)
    })

    it('basta uma tag corresponder', () => {
      expect(matchesContactFilter(createContact(), { tags: ['nope', 'lead'] })).toBe(true)
    })

    it('nenhuma tag corresponde retorna false', () => {
      expect(matchesContactFilter(createContact(), { tags: ['premium', 'enterprise'] })).toBe(false)
    })

    it('tags undefined não filtra', () => {
      expect(matchesContactFilter(createContact(), { tags: undefined })).toBe(true)
    })

    it('tags array vazio não filtra', () => {
      expect(matchesContactFilter(createContact(), { tags: [] })).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Múltiplos critérios combinados
  // ---------------------------------------------------------------------------

  describe('múltiplos critérios combinados', () => {
    it('todos os critérios devem ser satisfeitos', () => {
      const criteria: ContactFilterCriteria = {
        searchTerm: 'João',
        status: 'Opt-in',
        tags: ['vip'],
      }
      expect(matchesContactFilter(createContact(), criteria)).toBe(true)
    })

    it('falha se searchTerm não bater', () => {
      const criteria: ContactFilterCriteria = {
        searchTerm: 'Maria',
        status: 'Opt-in',
        tags: ['vip'],
      }
      expect(matchesContactFilter(createContact(), criteria)).toBe(false)
    })

    it('falha se status não bater', () => {
      const criteria: ContactFilterCriteria = {
        searchTerm: 'João',
        status: 'Opt-out',
        tags: ['vip'],
      }
      expect(matchesContactFilter(createContact(), criteria)).toBe(false)
    })

    it('falha se nenhuma tag bater', () => {
      const criteria: ContactFilterCriteria = {
        searchTerm: 'João',
        status: 'Opt-in',
        tags: ['premium'],
      }
      expect(matchesContactFilter(createContact(), criteria)).toBe(false)
    })
  })
})

// =============================================================================
// filterContacts
// =============================================================================

describe('filterContacts', () => {
  const contacts: Contact[] = [
    createContact({ id: 'c-1', name: 'João', phone: '+5511111111111', tags: ['vip'] }),
    createContact({ id: 'c-2', name: 'Maria', phone: '+5522222222222', status: ContactStatus.OPT_OUT, tags: ['lead'] }),
    createContact({ id: 'c-3', name: 'Pedro', phone: '+5533333333333', tags: ['vip', 'lead'] }),
  ]

  it('retorna todos quando critérios estão vazios', () => {
    expect(filterContacts(contacts, {})).toHaveLength(3)
  })

  it('filtra por searchTerm', () => {
    const result = filterContacts(contacts, { searchTerm: 'Maria' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c-2')
  })

  it('filtra por status', () => {
    const result = filterContacts(contacts, { status: 'Opt-out' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c-2')
  })

  it('filtra por tags', () => {
    const result = filterContacts(contacts, { tags: ['vip'] })
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.id)).toEqual(['c-1', 'c-3'])
  })

  it('combina múltiplos filtros', () => {
    const result = filterContacts(contacts, { searchTerm: 'Pedro', tags: ['lead'] })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c-3')
  })

  it('retorna array vazio quando nenhum contato bate', () => {
    const result = filterContacts(contacts, { searchTerm: 'xyzabc' })
    expect(result).toHaveLength(0)
  })

  it('retorna array vazio para lista vazia de contatos', () => {
    expect(filterContacts([], { searchTerm: 'João' })).toEqual([])
  })
})
