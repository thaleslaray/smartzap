import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flowSubmissionsService, FlowSubmissionRow } from './flowSubmissionsService'

import { createMockFetchResponse, setupFetchMock } from '@/tests/helpers'

const mockSubmission: FlowSubmissionRow = {
  id: 'sub-1',
  message_id: 'wamid.abc123',
  from_phone: '+5511999999999',
  contact_id: 'contact-1',
  flow_id: 'flow-1',
  flow_name: 'Pesquisa de Satisfacao',
  flow_token: 'token-abc',
  campaign_id: null,
  response_json_raw: '{"screen_0_q1":"Sim"}',
  response_json: { screen_0_q1: 'Sim' },
  waba_id: 'waba-123',
  phone_number_id: 'phone-123',
  message_timestamp: '1706000000',
  created_at: '2024-01-23T12:00:00.000Z',
}

describe('flowSubmissionsService', () => {
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
    it('deve buscar submissoes sem parametros', async () => {
      const mockData = [mockSubmission]
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockData))

      const result = await flowSubmissionsService.list()

      expect(mockFetch).toHaveBeenCalledWith('/api/flows/submissions', {
        credentials: 'include',
        headers: { 'Cache-Control': 'no-cache' },
      })
      expect(result).toEqual(mockData)
    })

    it('deve incluir flowId nos parametros da URL', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse([]))

      await flowSubmissionsService.list({ flowId: 'flow-1' })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/flows/submissions?flowId=flow-1',
        expect.objectContaining({ credentials: 'include' })
      )
    })

    it('deve incluir multiplos parametros na URL', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse([]))

      await flowSubmissionsService.list({
        flowId: 'flow-1',
        campaignId: 'camp-1',
        phone: '+5511999999999',
        limit: 50,
      })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/flows/submissions?flowId=flow-1&campaignId=camp-1&phone=%2B5511999999999&limit=50',
        expect.objectContaining({ credentials: 'include' })
      )
    })

    it('deve lancar erro com detalhes quando disponivel', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(
          { error: 'Falha na query', details: 'Tabela nao encontrada' },
          { ok: false, status: 500 }
        )
      )

      await expect(flowSubmissionsService.list()).rejects.toThrow(
        'Falha na query: Tabela nao encontrada'
      )
    })

    it('deve lancar erro com mensagem padrao quando sem detalhes', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        text: vi.fn().mockResolvedValue(''),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      await expect(flowSubmissionsService.list()).rejects.toThrow(
        'Falha ao buscar submissões de MiniApp'
      )
    })
  })
})
