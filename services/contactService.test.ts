import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { contactService } from './contactService'
import { ContactStatus, type Contact } from '../types'

vi.mock('../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../lib/csv-parser', () => ({
  parseContactsFile: vi.fn(() => ({
    success: true,
    contacts: [{ name: 'Ana', phone: '+5511999999999' }],
    invalidRows: [{ row: 2, reason: 'invalid' }],
    duplicates: [{ row: 3, phone: '+5511888888888' }],
  })),
  parseContactsFromFile: vi.fn(async () => ({
    contacts: [{ name: 'Joao', phone: '+5511999999999' }],
    invalidRows: [],
    duplicates: [],
  })),
  generateImportReport: vi.fn(() => 'report'),
}))

import { createMockFetchResponse, setupFetchMock } from '@/tests/helpers'

describe('contactService', () => {
  const mockFetch = setupFetchMock()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('list', () => {
    it('deve montar query com filtros', async () => {
      const mockResult = { data: [], total: 0, limit: 10, offset: 0 }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockResult))

      await contactService.list({
        limit: 10,
        offset: 0,
        search: 'ana',
        status: ContactStatus.OPT_IN,
        tag: 'vip',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/contacts?limit=10&offset=0&search=ana&status=Opt-in&tag=vip',
        { cache: 'no-store' }
      )
    })

    it('nao deve incluir status/tag quando ALL', async () => {
      const mockResult = { data: [], total: 0, limit: 10, offset: 0 }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockResult))

      await contactService.list({ limit: 10, offset: 0, status: 'ALL', tag: 'ALL' })

      expect(mockFetch).toHaveBeenCalledWith('/api/contacts?limit=10&offset=0', { cache: 'no-store' })
    })

    it('deve lançar erro quando fetch falha', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false }))

      await expect(contactService.list({ limit: 10, offset: 0 })).rejects.toThrow('Falha ao buscar contatos')
    })
  })

  describe('add', () => {
    it('deve normalizar telefone e enviar para API', async () => {
      const contact: Omit<Contact, 'id' | 'lastActive'> = {
        name: 'Maria',
        phone: '+55 11 91234-5678',
        status: ContactStatus.OPT_IN,
        tags: [],
      }

      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ id: 'c1', ...contact }))

      await contactService.add(contact)

      const [, init] = mockFetch.mock.calls[0]
      const body = JSON.parse(init.body)

      expect(body.phone).toBe('+5511912345678')
      expect(mockFetch).toHaveBeenCalledWith('/api/contacts', expect.objectContaining({ method: 'POST' }))
    })

    it('deve rejeitar contato com telefone inválido', async () => {
      const contact: Omit<Contact, 'id' | 'lastActive'> = {
        name: 'Maria',
        phone: '123',
        status: ContactStatus.OPT_IN,
        tags: [],
      }

      await expect(contactService.add(contact)).rejects.toThrow('Número')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('validatePhone', () => {
    it('deve retornar normalized quando válido', () => {
      const result = contactService.validatePhone('+55 11 91234-5678')
      expect(result.isValid).toBe(true)
      expect(result.normalized).toBe('+5511912345678')
    })
  })

  describe('importFromContent', () => {
    it('deve importar contatos e gerar relatório', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ imported: 1 }))

      const result = await contactService.importFromContent('name,phone\nAna,+5511999999999')

      expect(mockFetch).toHaveBeenCalledWith('/api/contacts/import', expect.objectContaining({ method: 'POST' }))
      expect(result).toEqual({
        imported: 1,
        failed: 1,
        duplicates: 1,
        report: 'report',
      })
    })
  })

  describe('deleteMany', () => {
    it('deve deletar vários contatos', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ deleted: 2 }))

      const deleted = await contactService.deleteMany(['c1', 'c2'])

      expect(mockFetch).toHaveBeenCalledWith('/api/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['c1', 'c2'] }),
      })
      expect(deleted).toBe(2)
    })
  })

  describe('bulkUpdateTags', () => {
    it('deve chamar API com ids, tagsToAdd e tagsToRemove e retornar updated', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ updated: 3 }))

      const updated = await contactService.bulkUpdateTags(['c1', 'c2', 'c3'], ['vip'], ['free'])

      expect(mockFetch).toHaveBeenCalledWith('/api/contacts/bulk-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['c1', 'c2', 'c3'], tagsToAdd: ['vip'], tagsToRemove: ['free'] }),
      })
      expect(updated).toBe(3)
    })

    it('deve lançar erro quando API retorna status não-ok', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Contatos não encontrados' }, { ok: false })
      )

      await expect(
        contactService.bulkUpdateTags(['c1'], ['vip'], [])
      ).rejects.toThrow('Contatos não encontrados')
    })
  })
})
