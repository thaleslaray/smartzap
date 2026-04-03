import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { customFieldService } from './customFieldService'
import { CustomFieldDefinition } from '../types'

import { createMockFetchResponse, setupFetchMock } from '@/tests/helpers'

const mockField: CustomFieldDefinition = {
  id: 'field-1',
  entity_type: 'contact',
  field_name: 'empresa',
  field_type: 'text',
  label: 'Empresa',
  created_at: '2024-01-01T00:00:00.000Z',
}

describe('customFieldService', () => {
  const mockFetch = setupFetchMock()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  // ===========================================================================
  // GET ALL
  // ===========================================================================
  describe('getAll', () => {
    it('deve buscar campos com entityType padrao (contact)', async () => {
      const mockFields = [mockField]
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockFields))

      const result = await customFieldService.getAll()

      expect(mockFetch).toHaveBeenCalledWith('/api/custom-fields?entityType=contact', {
        cache: 'no-store',
      })
      expect(result).toEqual(mockFields)
    })

    it('deve buscar campos com entityType customizado', async () => {
      const mockFields = [{ ...mockField, entity_type: 'deal' }]
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockFields))

      const result = await customFieldService.getAll('deal')

      expect(mockFetch).toHaveBeenCalledWith('/api/custom-fields?entityType=deal', {
        cache: 'no-store',
      })
      expect(result).toEqual(mockFields)
    })

    it('deve lancar erro quando fetch falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(null, { ok: false, status: 500 })
      )

      await expect(customFieldService.getAll()).rejects.toThrow(
        'Falha ao buscar campos personalizados'
      )
    })
  })

  // ===========================================================================
  // CREATE
  // ===========================================================================
  describe('create', () => {
    it('deve criar campo personalizado', async () => {
      const input = {
        entity_type: 'contact' as const,
        field_name: 'empresa',
        field_type: 'text' as const,
        label: 'Empresa',
      }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockField))

      const result = await customFieldService.create(input)

      expect(mockFetch).toHaveBeenCalledWith('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      expect(result).toEqual(mockField)
    })

    it('deve lancar erro com mensagem do servidor quando disponivel', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(
          { error: 'Nome do campo ja existe' },
          { ok: false, status: 400 }
        )
      )

      await expect(
        customFieldService.create({
          entity_type: 'contact',
          field_name: 'empresa',
          field_type: 'text',
          label: 'Empresa',
        })
      ).rejects.toThrow('Nome do campo ja existe')
    })

    it('deve usar mensagem padrao quando erro nao tem detalhes', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        text: vi.fn().mockResolvedValue(''),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      await expect(
        customFieldService.create({
          entity_type: 'contact',
          field_name: 'empresa',
          field_type: 'text',
          label: 'Empresa',
        })
      ).rejects.toThrow('Falha ao criar campo personalizado')
    })
  })

  // ===========================================================================
  // DELETE
  // ===========================================================================
  describe('delete', () => {
    it('deve deletar campo personalizado', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null))

      await customFieldService.delete('field-1')

      expect(mockFetch).toHaveBeenCalledWith('/api/custom-fields/field-1', {
        method: 'DELETE',
      })
    })

    it('deve lancar erro quando delete falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(null, { ok: false, status: 500 })
      )

      await expect(customFieldService.delete('field-1')).rejects.toThrow(
        'Falha ao deletar campo personalizado'
      )
    })
  })
})
