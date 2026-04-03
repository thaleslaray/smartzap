import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { submissionsService } from './submissionsService'
import type { FlowSubmission } from './submissionsService'

import { createMockFetchResponse, setupFetchMock } from '@/tests/helpers'

const mockSubmission: FlowSubmission = {
  id: 'sub-1',
  message_id: 'msg-1',
  from_phone: '5511999999999',
  contact_id: null,
  campaign_id: null,
  flow_id: null,
  flow_name: null,
  flow_token: null,
  flow_local_id: null,
  response_json_raw: '{}',
  response_json: null,
  mapped_data: null,
  mapped_at: null,
  waba_id: null,
  phone_number_id: null,
  message_timestamp: null,
  created_at: '2026-01-01',
  contact: null,
  campaign: null,
}

describe('submissionsService', () => {
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
    it('deve listar submissoes com parametros', async () => {
      const listResult = {
        data: [mockSubmission],
        total: 1,
        limit: 20,
        offset: 0,
      }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(listResult))

      const result = await submissionsService.list({
        limit: 20,
        offset: 0,
        search: 'teste',
        campaignId: 'camp-1',
        flowId: 'flow-1',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/submissions?limit=20&search=teste&campaignId=camp-1&flowId=flow-1',
        { method: 'GET', credentials: 'include' }
      )
      expect(result.data).toEqual([mockSubmission])
      expect(result.total).toBe(1)
      expect(result.limit).toBe(20)
      expect(result.offset).toBe(0)
    })

    it('deve retornar lista vazia quando nao ha submissoes', async () => {
      const listResult = { data: [], total: 0, limit: 20, offset: 0 }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(listResult))

      const result = await submissionsService.list()

      expect(mockFetch).toHaveBeenCalledWith('/api/submissions?', {
        method: 'GET',
        credentials: 'include',
      })
      expect(result.data).toEqual([])
      expect(result.total).toBe(0)
    })

    it('deve lancar erro quando fetch falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Database error' }, { ok: false, status: 500 })
      )

      await expect(submissionsService.list()).rejects.toThrow('Database error')
    })
  })

  // ===========================================================================
  // EXTRACT FORM FIELDS
  // ===========================================================================
  describe('extractFormFields', () => {
    it('deve extrair campos removendo flow_token', () => {
      const submission: FlowSubmission = {
        ...mockSubmission,
        response_json: {
          flow_token: 'abc-123',
          name: 'Joao',
          email: 'joao@test.com',
          age: 30,
        },
      }

      const fields = submissionsService.extractFormFields(submission)

      expect(fields).toEqual({
        name: 'Joao',
        email: 'joao@test.com',
        age: 30,
      })
      expect(fields).not.toHaveProperty('flow_token')
    })

    it('deve retornar objeto vazio quando response_json e null', () => {
      const submission: FlowSubmission = {
        ...mockSubmission,
        response_json: null,
      }

      const fields = submissionsService.extractFormFields(submission)

      expect(fields).toEqual({})
    })
  })

  // ===========================================================================
  // FORMAT PHONE
  // ===========================================================================
  describe('formatPhone', () => {
    it('deve formatar telefone BR de 13 digitos', () => {
      const result = submissionsService.formatPhone('5511999999999')

      expect(result).toBe('+55 11 99999-9999')
    })

    it('deve retornar original quando nao e formato BR', () => {
      const result = submissionsService.formatPhone('+1234567890')

      expect(result).toBe('+1234567890')
    })
  })
})
