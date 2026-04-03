import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { aiAgentService } from './aiAgentService'
import type { AIAgent } from '../types'

import { createMockFetchResponse, setupFetchMock } from '@/tests/helpers'

const mockAgent: AIAgent = {
  id: 'agent-1',
  name: 'Assistente',
  system_prompt: 'Voce e um assistente.',
  model: 'gemini-2.0-flash',
  temperature: 0.7,
  max_tokens: 1024,
  is_active: true,
  is_default: false,
  debounce_ms: 3000,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

describe('aiAgentService', () => {
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
    it('deve listar agentes com sucesso', async () => {
      const agents = [mockAgent, { ...mockAgent, id: 'agent-2', name: 'Vendas' }]
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(agents))

      const result = await aiAgentService.list()

      expect(mockFetch).toHaveBeenCalledWith('/api/ai-agents')
      expect(result).toEqual(agents)
    })

    it('deve lancar erro quando fetch falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Server error' }, { ok: false, status: 500 })
      )

      await expect(aiAgentService.list()).rejects.toThrow('Server error')
    })
  })

  // ===========================================================================
  // GET
  // ===========================================================================
  describe('get', () => {
    it('deve buscar agente por ID', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockAgent))

      const result = await aiAgentService.get('agent-1')

      expect(mockFetch).toHaveBeenCalledWith('/api/ai-agents/agent-1')
      expect(result).toEqual(mockAgent)
    })

    it('deve lancar erro quando agente nao existe', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Agent not found' }, { ok: false, status: 404 })
      )

      await expect(aiAgentService.get('nonexistent')).rejects.toThrow('Agent not found')
    })
  })

  // ===========================================================================
  // CREATE
  // ===========================================================================
  describe('create', () => {
    it('deve criar agente com sucesso', async () => {
      const params = { name: 'Novo Agente', system_prompt: 'Prompt aqui' }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockAgent))

      const result = await aiAgentService.create(params)

      expect(mockFetch).toHaveBeenCalledWith('/api/ai-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      expect(result).toEqual(mockAgent)
    })

    it('deve lancar erro quando criacao falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Validation failed' }, { ok: false, status: 400 })
      )

      await expect(
        aiAgentService.create({ name: '', system_prompt: '' })
      ).rejects.toThrow('Validation failed')
    })
  })

  // ===========================================================================
  // UPDATE
  // ===========================================================================
  describe('update', () => {
    it('deve atualizar agente com sucesso', async () => {
      const params = { name: 'Agente Atualizado' }
      const updated = { ...mockAgent, name: 'Agente Atualizado' }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(updated))

      const result = await aiAgentService.update('agent-1', params)

      expect(mockFetch).toHaveBeenCalledWith('/api/ai-agents/agent-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      expect(result).toEqual(updated)
    })

    it('deve lancar erro quando atualizacao falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Not found' }, { ok: false, status: 404 })
      )

      await expect(
        aiAgentService.update('nonexistent', { name: 'x' })
      ).rejects.toThrow('Not found')
    })
  })

  // ===========================================================================
  // DELETE
  // ===========================================================================
  describe('delete', () => {
    it('deve deletar agente com sucesso', async () => {
      const deleteResult = { success: true, deleted: 'agent-1' }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(deleteResult))

      const result = await aiAgentService.delete('agent-1')

      expect(mockFetch).toHaveBeenCalledWith('/api/ai-agents/agent-1', {
        method: 'DELETE',
      })
      expect(result).toEqual(deleteResult)
    })

    it('deve lancar erro quando exclusao falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Cannot delete default agent' }, { ok: false, status: 400 })
      )

      await expect(aiAgentService.delete('agent-1')).rejects.toThrow('Cannot delete default agent')
    })
  })

  // ===========================================================================
  // SET DEFAULT
  // ===========================================================================
  describe('setDefault', () => {
    it('deve delegar para update com is_default: true', async () => {
      const defaultAgent = { ...mockAgent, is_default: true }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(defaultAgent))

      const result = await aiAgentService.setDefault('agent-1')

      expect(mockFetch).toHaveBeenCalledWith('/api/ai-agents/agent-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      })
      expect(result).toEqual(defaultAgent)
    })
  })

  // ===========================================================================
  // TOGGLE ACTIVE
  // ===========================================================================
  describe('toggleActive', () => {
    it('deve delegar para update com is_active: true', async () => {
      const activeAgent = { ...mockAgent, is_active: true }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(activeAgent))

      const result = await aiAgentService.toggleActive('agent-1', true)

      expect(mockFetch).toHaveBeenCalledWith('/api/ai-agents/agent-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      })
      expect(result).toEqual(activeAgent)
    })

    it('deve delegar para update com is_active: false', async () => {
      const inactiveAgent = { ...mockAgent, is_active: false }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(inactiveAgent))

      const result = await aiAgentService.toggleActive('agent-1', false)

      expect(mockFetch).toHaveBeenCalledWith('/api/ai-agents/agent-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      })
      expect(result).toEqual(inactiveAgent)
    })
  })
})
