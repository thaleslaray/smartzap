import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { manualDraftsService } from './manualDraftsService'

import { createMockFetchResponse, setupFetchMock } from '@/tests/helpers'

const mockDraft = {
  id: 'draft-1',
  name: 'test_template',
  language: 'pt_BR',
  category: 'UTILITY',
  status: 'DRAFT',
  updatedAt: '2026-01-01',
}

describe('manualDraftsService', () => {
  const mockFetch = setupFetchMock()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  // ===========================================================================
  // GET
  // ===========================================================================
  describe('get', () => {
    it('deve buscar rascunho por ID', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockDraft))

      const result = await manualDraftsService.get('draft-1')

      expect(mockFetch).toHaveBeenCalledWith('/api/templates/drafts/draft-1', {
        method: 'GET',
        credentials: 'include',
      })
      expect(result).toEqual(mockDraft)
    })

    it('deve lancar erro quando fetch falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Rascunho nao encontrado' }, { ok: false, status: 404 })
      )

      await expect(manualDraftsService.get('nonexistent')).rejects.toThrow('Rascunho nao encontrado')
    })

    it('deve lancar erro quando resposta e invalida (Zod validation)', async () => {
      // Retorna objeto sem campos obrigatorios (id e name)
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ invalid: true }))

      await expect(manualDraftsService.get('draft-1')).rejects.toThrow('Resposta inválida ao buscar rascunho')
    })
  })

  // ===========================================================================
  // LIST
  // ===========================================================================
  describe('list', () => {
    it('deve listar rascunhos com sucesso', async () => {
      const drafts = [mockDraft, { ...mockDraft, id: 'draft-2', name: 'promo_template' }]
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(drafts))

      const result = await manualDraftsService.list()

      expect(mockFetch).toHaveBeenCalledWith('/api/templates/drafts', {
        method: 'GET',
        credentials: 'include',
      })
      expect(result).toEqual(drafts)
    })

    it('deve retornar array vazio quando lista esta vazia', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse([]))

      const result = await manualDraftsService.list()

      expect(result).toEqual([])
    })

    it('deve retornar array vazio quando resposta nao e array', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ not: 'an array' }))

      const result = await manualDraftsService.list()

      expect(result).toEqual([])
    })

    it('deve lancar erro quando fetch falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Unauthorized' }, { ok: false, status: 401 })
      )

      await expect(manualDraftsService.list()).rejects.toThrow('Unauthorized')
    })
  })

  // ===========================================================================
  // CREATE
  // ===========================================================================
  describe('create', () => {
    it('deve criar rascunho com sucesso', async () => {
      const input = { name: 'novo_template', language: 'pt_BR', category: 'MARKETING' }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockDraft))

      const result = await manualDraftsService.create(input)

      expect(mockFetch).toHaveBeenCalledWith('/api/templates/drafts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      expect(result).toEqual(mockDraft)
    })

    it('deve lancar erro quando criacao falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Nome ja existe' }, { ok: false, status: 400 })
      )

      await expect(
        manualDraftsService.create({ name: 'duplicado' })
      ).rejects.toThrow('Nome ja existe')
    })
  })

  // ===========================================================================
  // REMOVE
  // ===========================================================================
  describe('remove', () => {
    it('deve remover rascunho com sucesso', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null))

      await manualDraftsService.remove('draft-1')

      expect(mockFetch).toHaveBeenCalledWith('/api/templates/drafts/draft-1', {
        method: 'DELETE',
        credentials: 'include',
      })
    })

    it('deve lancar erro quando exclusao falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Rascunho nao encontrado' }, { ok: false, status: 404 })
      )

      await expect(manualDraftsService.remove('nonexistent')).rejects.toThrow('Rascunho nao encontrado')
    })
  })

  // ===========================================================================
  // UPDATE
  // ===========================================================================
  describe('update', () => {
    it('deve atualizar rascunho com sucesso', async () => {
      const patch = { name: 'updated_template' }
      const updated = { ...mockDraft, name: 'updated_template' }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(updated))

      const result = await manualDraftsService.update('draft-1', patch)

      expect(mockFetch).toHaveBeenCalledWith('/api/templates/drafts/draft-1', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      expect(result).toEqual(updated)
    })

    it('deve lancar erro quando atualizacao falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Falha na validacao' }, { ok: false, status: 400 })
      )

      await expect(
        manualDraftsService.update('draft-1', { name: '' })
      ).rejects.toThrow('Falha na validacao')
    })
  })

  // ===========================================================================
  // SUBMIT
  // ===========================================================================
  describe('submit', () => {
    it('deve submeter rascunho para Meta com sucesso', async () => {
      const submitResult = { success: true, status: 'PENDING', id: 'meta-123', name: 'test_template' }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(submitResult))

      const result = await manualDraftsService.submit('draft-1')

      expect(mockFetch).toHaveBeenCalledWith('/api/templates/drafts/draft-1/submit', {
        method: 'POST',
        credentials: 'include',
      })
      expect(result).toEqual(submitResult)
    })

    it('deve lancar erro quando submissao falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Template invalido' }, { ok: false, status: 400 })
      )

      await expect(manualDraftsService.submit('draft-1')).rejects.toThrow('Template invalido')
    })
  })

  // ===========================================================================
  // CLONE
  // ===========================================================================
  describe('clone', () => {
    it('deve clonar template com sucesso', async () => {
      const cloneResult = { id: 'draft-2', name: 'promo_copy', originalName: 'promo' }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(cloneResult))

      const result = await manualDraftsService.clone('promo')

      expect(mockFetch).toHaveBeenCalledWith('/api/templates/promo/clone', {
        method: 'POST',
        credentials: 'include',
      })
      expect(result).toEqual(cloneResult)
    })

    it('deve lancar erro quando clone falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Template nao encontrado' }, { ok: false, status: 404 })
      )

      await expect(manualDraftsService.clone('nonexistent')).rejects.toThrow('Template nao encontrado')
    })
  })
})
