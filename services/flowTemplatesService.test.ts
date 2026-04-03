import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flowTemplatesService, FlowTemplateDTO } from './flowTemplatesService'

import { createMockFetchResponse, setupFetchMock } from '@/tests/helpers'

const mockTemplate: FlowTemplateDTO = {
  key: 'welcome-flow',
  name: 'Welcome Flow',
  description: 'Template de boas-vindas automatico',
  flowJson: { nodes: [], edges: [] },
  defaultMapping: null,
  isDynamic: false,
}

describe('flowTemplatesService', () => {
  const mockFetch = setupFetchMock()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  // ===========================================================================
  // LIST
  // ===========================================================================
  describe('list', () => {
    it('deve listar templates de flow', async () => {
      const mockTemplates = [mockTemplate]
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockTemplates))

      const result = await flowTemplatesService.list()

      expect(mockFetch).toHaveBeenCalledWith('/api/flows/templates', {
        method: 'GET',
        credentials: 'include',
      })
      expect(result).toEqual(mockTemplates)
    })

    it('deve retornar array vazio quando resposta nao e array', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ notAnArray: true }))

      const result = await flowTemplatesService.list()

      expect(result).toEqual([])
    })

    it('deve lancar erro quando fetch falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(
          { error: 'Unauthorized' },
          { ok: false, status: 401 }
        )
      )

      await expect(flowTemplatesService.list()).rejects.toThrow('Unauthorized')
    })
  })
})
