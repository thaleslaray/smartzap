import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { leadFormService } from './leadFormService'
import type { LeadForm, CreateLeadFormDTO, UpdateLeadFormDTO } from '../types'

import { createMockFetchResponse, setupFetchMock } from '@/tests/helpers'

const mockLeadForm: LeadForm = {
  id: 'form-1',
  name: 'Formulário Teste',
  slug: 'formulario-teste',
  tag: 'teste',
  isActive: true,
  collectEmail: true,
  successMessage: 'Obrigado!',
  createdAt: '2024-01-01T00:00:00.000Z',
}

describe('leadFormService', () => {
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
    it('deve buscar todos os formulários com cache: no-store', async () => {
      const mockForms = [mockLeadForm, { ...mockLeadForm, id: 'form-2', name: 'Outro' }]
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockForms))

      const result = await leadFormService.getAll()

      expect(mockFetch).toHaveBeenCalledWith('/api/lead-forms', { cache: 'no-store' })
      expect(result).toEqual(mockForms)
    })

    it('deve lançar erro quando resposta não é ok', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 500 }))

      await expect(leadFormService.getAll()).rejects.toThrow('Falha ao buscar formulários')
    })
  })

  // ===========================================================================
  // CREATE
  // ===========================================================================
  describe('create', () => {
    const dto: CreateLeadFormDTO = {
      name: 'Novo Form',
      slug: 'novo-form',
      tag: 'novo',
      isActive: true,
    }

    it('deve criar formulário com POST e retornar payload', async () => {
      const created = { ...mockLeadForm, id: 'form-new', name: dto.name }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(created))

      const result = await leadFormService.create(dto)

      expect(mockFetch).toHaveBeenCalledWith('/api/lead-forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      })
      expect(result).toEqual(created)
    })

    it('deve lançar erro com mensagem do servidor quando resposta não é ok', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Slug já existe' }, { ok: false, status: 409 })
      )

      await expect(leadFormService.create(dto)).rejects.toThrow('Slug já existe')
    })
  })

  // ===========================================================================
  // UPDATE
  // ===========================================================================
  describe('update', () => {
    const dto: UpdateLeadFormDTO = { name: 'Nome Atualizado' }

    it('deve atualizar formulário com PATCH e URL-encode no ID', async () => {
      const idWithSpecialChars = 'form/special&id'
      const updated = { ...mockLeadForm, id: idWithSpecialChars, name: 'Nome Atualizado' }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(updated))

      const result = await leadFormService.update(idWithSpecialChars, dto)

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/lead-forms/${encodeURIComponent(idWithSpecialChars)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dto),
        }
      )
      expect(result).toEqual(updated)
    })

    it('deve lançar erro com mensagem do servidor quando resposta não é ok', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Formulário não encontrado' }, { ok: false, status: 404 })
      )

      await expect(leadFormService.update('form-1', dto)).rejects.toThrow('Formulário não encontrado')
    })
  })

  // ===========================================================================
  // DELETE
  // ===========================================================================
  describe('delete', () => {
    it('deve deletar formulário com DELETE e URL-encode no ID', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ success: true }))

      await leadFormService.delete('form-1')

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/lead-forms/${encodeURIComponent('form-1')}`,
        { method: 'DELETE' }
      )
    })

    it('deve lançar erro com mensagem do servidor quando resposta não é ok', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Permissão negada' }, { ok: false, status: 403 })
      )

      await expect(leadFormService.delete('form-1')).rejects.toThrow('Permissão negada')
    })
  })
})
