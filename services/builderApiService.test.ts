import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { builderApiService, type ApiKey } from './builderApiService'

import { createMockFetchResponse, setupFetchMock } from '@/tests/helpers'

const mockApiKey: ApiKey = {
  id: 'key-1',
  name: 'Production Key',
  keyPrefix: 'sk_prod_...',
  createdAt: '2024-01-01T00:00:00.000Z',
  lastUsedAt: null,
}

describe('builderApiService', () => {
  const mockFetch = setupFetchMock()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  // ===========================================================================
  // LIST API KEYS
  // ===========================================================================
  describe('listApiKeys', () => {
    it('deve listar chaves de API', async () => {
      const mockKeys = [mockApiKey, { ...mockApiKey, id: 'key-2', name: 'Staging Key' }]
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockKeys))

      const result = await builderApiService.listApiKeys()

      expect(mockFetch).toHaveBeenCalledWith('/api/builder/api-keys')
      expect(result).toEqual(mockKeys)
    })

    it('deve lançar erro quando resposta não é ok', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 500 }))

      await expect(builderApiService.listApiKeys()).rejects.toThrow('Falha ao carregar chaves de API')
    })
  })

  // ===========================================================================
  // CREATE API KEY
  // ===========================================================================
  describe('createApiKey', () => {
    it('deve criar chave com nome informado', async () => {
      const created = { ...mockApiKey, key: 'sk_prod_abc123' }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(created))

      const result = await builderApiService.createApiKey('Minha Chave')

      expect(mockFetch).toHaveBeenCalledWith('/api/builder/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Minha Chave' }),
      })
      expect(result).toEqual(created)
    })

    it('deve criar chave com name: null quando nome não é informado', async () => {
      const created = { ...mockApiKey, name: null, key: 'sk_prod_xyz789' }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(created))

      const result = await builderApiService.createApiKey()

      expect(mockFetch).toHaveBeenCalledWith('/api/builder/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: null }),
      })
      expect(result).toEqual(created)
    })

    it('deve lançar erro com mensagem do servidor quando resposta não é ok', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Limite de chaves atingido' }, { ok: false, status: 429 })
      )

      await expect(builderApiService.createApiKey('Nova')).rejects.toThrow('Limite de chaves atingido')
    })
  })

  // ===========================================================================
  // DELETE API KEY
  // ===========================================================================
  describe('deleteApiKey', () => {
    it('deve deletar chave com DELETE no endpoint correto', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null))

      await builderApiService.deleteApiKey('key-1')

      expect(mockFetch).toHaveBeenCalledWith('/api/builder/api-keys/key-1', {
        method: 'DELETE',
      })
    })

    it('deve lançar erro quando resposta não é ok', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 404 }))

      await expect(builderApiService.deleteApiKey('key-999')).rejects.toThrow('Falha ao excluir chave de API')
    })
  })

  // ===========================================================================
  // EXECUTE WORKFLOW
  // ===========================================================================
  describe('executeWorkflow', () => {
    it('deve executar workflow com input fornecido', async () => {
      const mockResult = { executionId: 'exec-123' }
      const input = { contactId: 'c1', message: 'Hello' }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockResult))

      const result = await builderApiService.executeWorkflow('workflow-1', input)

      expect(mockFetch).toHaveBeenCalledWith('/api/builder/workflow/workflow-1/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })
      expect(result).toEqual(mockResult)
    })

    it('deve executar workflow com input vazio quando não fornecido', async () => {
      const mockResult = { executionId: 'exec-456' }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockResult))

      const result = await builderApiService.executeWorkflow('workflow-2')

      expect(mockFetch).toHaveBeenCalledWith('/api/builder/workflow/workflow-2/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: {} }),
      })
      expect(result).toEqual(mockResult)
    })

    it('deve lançar erro quando resposta não é ok', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 500 }))

      await expect(builderApiService.executeWorkflow('workflow-1')).rejects.toThrow('Falha ao executar o fluxo')
    })
  })
})
