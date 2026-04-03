import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { templateProjectService } from './templateProjectService'
import type { TemplateProject, TemplateProjectItem, CreateTemplateProjectDTO } from '../types'

import { createMockFetchResponse, setupFetchMock } from '@/tests/helpers'

const mockProject: TemplateProject = {
  id: 'proj-1',
  title: 'Projeto de Templates',
  prompt: 'Crie templates de marketing',
  status: 'draft',
  template_count: 3,
  approved_count: 1,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-02T00:00:00.000Z',
}

const mockItem: TemplateProjectItem = {
  id: 'item-1',
  project_id: 'proj-1',
  name: 'template_promo_v1',
  content: 'Olá {{1}}, confira nossa oferta!',
  language: 'pt_BR',
  category: 'MARKETING',
  created_at: '2024-01-01T00:00:00.000Z',
}

describe('templateProjectService', () => {
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
    it('deve buscar todos os projetos', async () => {
      const projects = [mockProject, { ...mockProject, id: 'proj-2', title: 'Outro Projeto' }]
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(projects))

      const result = await templateProjectService.getAll()

      expect(mockFetch).toHaveBeenCalledWith('/api/template-projects')
      expect(result).toEqual(projects)
    })

    it('deve lançar erro quando resposta não é ok', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 500 }))

      await expect(templateProjectService.getAll()).rejects.toThrow('Failed to fetch projects')
    })
  })

  // ===========================================================================
  // GET BY ID
  // ===========================================================================
  describe('getById', () => {
    it('deve buscar projeto com items pelo ID', async () => {
      const projectWithItems = { ...mockProject, items: [mockItem] }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(projectWithItems))

      const result = await templateProjectService.getById('proj-1')

      expect(mockFetch).toHaveBeenCalledWith('/api/template-projects/proj-1')
      expect(result).toEqual(projectWithItems)
    })

    it('deve lançar erro quando resposta não é ok', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 404 }))

      await expect(templateProjectService.getById('proj-999')).rejects.toThrow('Failed to fetch project details')
    })
  })

  // ===========================================================================
  // CREATE
  // ===========================================================================
  describe('create', () => {
    const dto: CreateTemplateProjectDTO = {
      title: 'Novo Projeto',
      prompt: 'Templates para Black Friday',
      items: [
        {
          name: 'bf_promo_v1',
          content: 'Black Friday! {{1}} de desconto',
          language: 'pt_BR',
        },
      ],
    }

    it('deve criar projeto com POST', async () => {
      const created = { ...mockProject, id: 'proj-new', title: dto.title }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(created))

      const result = await templateProjectService.create(dto)

      expect(mockFetch).toHaveBeenCalledWith('/api/template-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      })
      expect(result).toEqual(created)
    })

    it('deve lançar erro quando resposta não é ok', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 400 }))

      await expect(templateProjectService.create(dto)).rejects.toThrow('Failed to create project')
    })
  })

  // ===========================================================================
  // UPDATE
  // ===========================================================================
  describe('update', () => {
    it('deve atualizar projeto com PATCH', async () => {
      const updates: Partial<TemplateProject> = { title: 'Titulo Atualizado', status: 'completed' }
      const updated = { ...mockProject, ...updates }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(updated))

      const result = await templateProjectService.update('proj-1', updates)

      expect(mockFetch).toHaveBeenCalledWith('/api/template-projects/proj-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      expect(result).toEqual(updated)
    })

    it('deve lançar erro quando resposta não é ok', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 500 }))

      await expect(templateProjectService.update('proj-1', { title: 'X' })).rejects.toThrow('Failed to update project')
    })
  })

  // ===========================================================================
  // DELETE
  // ===========================================================================
  describe('delete', () => {
    it('deve deletar projeto sem remover meta templates (default)', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null))

      await templateProjectService.delete('proj-1')

      expect(mockFetch).toHaveBeenCalledWith('/api/template-projects/proj-1', {
        method: 'DELETE',
      })
    })

    it('deve deletar projeto com deleteMetaTemplates=true na query string', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null))

      await templateProjectService.delete('proj-1', true)

      expect(mockFetch).toHaveBeenCalledWith('/api/template-projects/proj-1?deleteMetaTemplates=true', {
        method: 'DELETE',
      })
    })

    it('deve lançar erro quando resposta não é ok', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 500 }))

      await expect(templateProjectService.delete('proj-1')).rejects.toThrow('Failed to delete project')
    })
  })

  // ===========================================================================
  // UPDATE ITEM
  // ===========================================================================
  describe('updateItem', () => {
    it('deve atualizar item com PATCH no endpoint de items', async () => {
      const updates: Partial<TemplateProjectItem> = { content: 'Conteudo atualizado' }
      const updated = { ...mockItem, ...updates }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(updated))

      const result = await templateProjectService.updateItem('item-1', updates)

      expect(mockFetch).toHaveBeenCalledWith('/api/template-projects/items/item-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      expect(result).toEqual(updated)
    })

    it('deve lançar erro quando resposta não é ok', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 404 }))

      await expect(templateProjectService.updateItem('item-999', { content: 'X' })).rejects.toThrow('Failed to update item')
    })
  })

  // ===========================================================================
  // DELETE ITEM
  // ===========================================================================
  describe('deleteItem', () => {
    it('deve deletar item com DELETE no endpoint de items', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null))

      await templateProjectService.deleteItem('item-1')

      expect(mockFetch).toHaveBeenCalledWith('/api/template-projects/items/item-1', {
        method: 'DELETE',
      })
    })

    it('deve lançar erro quando resposta não é ok', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 500 }))

      await expect(templateProjectService.deleteItem('item-1')).rejects.toThrow('Failed to delete item')
    })
  })
})
