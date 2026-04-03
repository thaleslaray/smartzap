import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { campaignService, CampaignListParams, CampaignListResult, CampaignPrecheckResult } from './campaignService'
import { Campaign, CampaignStatus, MessageStatus } from '../types'

import { createMockFetchResponse, setupFetchMock } from '@/tests/helpers'

// Mock console methods to avoid noise in tests
vi.spyOn(console, 'error').mockImplementation(() => {})
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'warn').mockImplementation(() => {})

// Factory para criar campanhas mock
const createMockCampaign = (overrides?: Partial<Campaign>): Campaign => ({
  id: 'campaign-123',
  name: 'Test Campaign',
  status: CampaignStatus.SENDING,
  recipients: 100,
  sent: 50,
  delivered: 45,
  read: 20,
  skipped: 5,
  failed: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  templateName: 'test_template',
  ...overrides,
})


describe('campaignService', () => {
  const mockFetch = setupFetchMock()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  // =============================================================================
  // LIST
  // =============================================================================
  describe('list', () => {
    it('deve listar campanhas com paginacao', async () => {
      const mockResult: CampaignListResult = {
        data: [createMockCampaign()],
        total: 1,
        limit: 10,
        offset: 0,
      }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockResult))

      const params: CampaignListParams = { limit: 10, offset: 0 }
      const result = await campaignService.list(params)

      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns?limit=10&offset=0')
      expect(result).toEqual(mockResult)
    })

    it('deve incluir search nos parametros da URL', async () => {
      const mockResult: CampaignListResult = { data: [], total: 0, limit: 10, offset: 0 }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockResult))

      await campaignService.list({ limit: 10, offset: 0, search: 'promo' })

      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns?limit=10&offset=0&search=promo')
    })

    it('deve incluir status nos parametros da URL (exceto All)', async () => {
      const mockResult: CampaignListResult = { data: [], total: 0, limit: 10, offset: 0 }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockResult))

      await campaignService.list({ limit: 10, offset: 0, status: CampaignStatus.COMPLETED })

      // Status e URL-encoded pelo URLSearchParams
      expect(mockFetch).toHaveBeenCalledWith(`/api/campaigns?limit=10&offset=0&status=${encodeURIComponent(CampaignStatus.COMPLETED)}`)
    })

    it('nao deve incluir status=All nos parametros', async () => {
      const mockResult: CampaignListResult = { data: [], total: 0, limit: 10, offset: 0 }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockResult))

      await campaignService.list({ limit: 10, offset: 0, status: 'All' })

      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns?limit=10&offset=0')
    })

    it('deve retornar lista vazia quando fetch falha', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, statusText: 'Internal Server Error' }))

      const result = await campaignService.list({ limit: 10, offset: 0 })

      expect(result).toEqual({ data: [], total: 0, limit: 10, offset: 0 })
      expect(console.error).toHaveBeenCalledWith('Failed to fetch campaigns:', 'Internal Server Error')
    })
  })

  // =============================================================================
  // GET ALL
  // =============================================================================
  describe('getAll', () => {
    it('deve retornar todas as campanhas', async () => {
      const mockCampaigns = [createMockCampaign(), createMockCampaign({ id: 'campaign-456' })]
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockCampaigns))

      const result = await campaignService.getAll()

      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns')
      expect(result).toEqual(mockCampaigns)
    })

    it('deve retornar array vazio quando fetch falha', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, statusText: 'Not Found' }))

      const result = await campaignService.getAll()

      expect(result).toEqual([])
    })
  })

  // =============================================================================
  // GET BY ID
  // =============================================================================
  describe('getById', () => {
    it('deve retornar campanha por ID', async () => {
      const mockCampaign = createMockCampaign()
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockCampaign))

      const result = await campaignService.getById('campaign-123')

      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns/campaign-123')
      expect(result).toEqual(mockCampaign)
    })

    it('deve retornar undefined para 404', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 404 }))

      const result = await campaignService.getById('nonexistent')

      expect(result).toBeUndefined()
    })

    it('deve retornar undefined para outros erros', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 500, statusText: 'Server Error' }))

      const result = await campaignService.getById('campaign-123')

      expect(result).toBeUndefined()
      expect(console.error).toHaveBeenCalledWith('Failed to fetch campaign:', 'Server Error')
    })
  })

  // =============================================================================
  // GET METRICS
  // =============================================================================
  describe('getMetrics', () => {
    it('deve retornar metricas da campanha', async () => {
      const mockMetrics = { sent: 50, delivered: 45, read: 20, failed: 0 }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockMetrics))

      const result = await campaignService.getMetrics('campaign-123')

      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns/campaign-123/metrics', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      expect(result).toEqual(mockMetrics)
    })

    it('deve retornar null quando fetch falha', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false }))

      const result = await campaignService.getMetrics('campaign-123')

      expect(result).toBeNull()
    })

    it('deve retornar null em caso de excecao', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await campaignService.getMetrics('campaign-123')

      expect(result).toBeNull()
    })
  })

  // =============================================================================
  // GET PENDING MESSAGES
  // =============================================================================
  describe('getPendingMessages', () => {
    it('deve retornar array vazio (stub)', () => {
      const result = campaignService.getPendingMessages('campaign-123')

      expect(result).toEqual([])
    })
  })

  // =============================================================================
  // GET MESSAGES
  // =============================================================================
  describe('getMessages', () => {
    it('deve retornar mensagens com paginacao', async () => {
      const mockResponse = {
        messages: [
          { id: 'msg-1', campaignId: 'campaign-123', contactName: 'Joao', contactPhone: '+5511999999999', status: MessageStatus.SENT, sentAt: '2024-01-01' },
        ],
        stats: { total: 1, pending: 0, sent: 1, delivered: 0, read: 0, skipped: 0, failed: 0 },
        pagination: { limit: 50, offset: 0, total: 1, hasMore: false },
      }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockResponse))

      const result = await campaignService.getMessages('campaign-123')

      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns/campaign-123/messages')
      expect(result).toEqual(mockResponse)
    })

    it('deve incluir parametros de opcoes na URL', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ messages: [], stats: {}, pagination: {} }))

      await campaignService.getMessages('campaign-123', { limit: 20, offset: 10, status: 'sent', includeRead: true })

      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns/campaign-123/messages?limit=20&offset=10&status=sent&includeRead=1')
    })

    it('deve retornar estrutura vazia quando fetch falha', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, statusText: 'Error' }))

      const result = await campaignService.getMessages('campaign-123')

      expect(result).toEqual({
        messages: [],
        stats: { total: 0, pending: 0, sent: 0, delivered: 0, read: 0, skipped: 0, failed: 0 },
        pagination: { limit: 50, offset: 0, total: 0, hasMore: false },
      })
    })
  })

  // =============================================================================
  // GET REAL STATUS
  // =============================================================================
  describe('getRealStatus', () => {
    it('deve retornar status em tempo real', async () => {
      const mockStatus = {
        campaignId: 'campaign-123',
        stats: { sent: 50, delivered: 45, read: 20, skipped: 5, failed: 0, total: 100 },
        messages: [],
      }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockStatus))

      const result = await campaignService.getRealStatus('campaign-123')

      expect(mockFetch).toHaveBeenCalledWith('/api/campaign/campaign-123/status', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      expect(result).toEqual(mockStatus)
    })

    it('deve retornar null quando fetch falha', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false }))

      const result = await campaignService.getRealStatus('campaign-123')

      expect(result).toBeNull()
    })

    it('deve retornar null em caso de excecao', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await campaignService.getRealStatus('campaign-123')

      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalledWith('Failed to fetch real status:', expect.any(Error))
    })
  })

  // =============================================================================
  // CREATE
  // =============================================================================
  describe('create', () => {
    const mockInput = {
      name: 'Nova Campanha',
      templateName: 'promo_template',
      recipients: 10,
      selectedContacts: [
        { id: 'c1', name: 'Maria', phone: '+5511999999999' },
      ],
    }

    it('deve criar campanha e disparar para backend', async () => {
      const createdCampaign = createMockCampaign({ id: 'new-campaign', name: 'Nova Campanha' })

      // Mock para POST /api/campaigns
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(createdCampaign))
      // Mock para POST /api/campaign/dispatch
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ success: true }))

      const result = await campaignService.create(mockInput)

      expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      })
      expect(result).toEqual(createdCampaign)
    })

    it('deve criar campanha agendada sem disparar', async () => {
      const scheduledCampaign = createMockCampaign({
        id: 'scheduled-campaign',
        status: CampaignStatus.SCHEDULED,
        scheduledAt: '2024-12-25T10:00:00.000Z',
      })

      mockFetch.mockResolvedValueOnce(createMockFetchResponse(scheduledCampaign))

      const result = await campaignService.create({
        ...mockInput,
        scheduledAt: '2024-12-25T10:00:00.000Z',
      })

      // Apenas uma chamada (POST /api/campaigns), sem dispatch
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(result).toEqual(scheduledCampaign)
    })

    it('deve lancar erro quando POST falha', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false }))

      await expect(campaignService.create(mockInput)).rejects.toThrow('Failed to create campaign')
    })

    it('deve propagar erro do dispatch', async () => {
      const createdCampaign = createMockCampaign()

      mockFetch.mockResolvedValueOnce(createMockFetchResponse(createdCampaign))
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ error: 'QSTASH_TOKEN missing' }, { ok: false }))

      await expect(campaignService.create(mockInput)).rejects.toThrow('QSTASH_TOKEN missing')
    })

    it('nao deve disparar quando nao ha contatos', async () => {
      const createdCampaign = createMockCampaign()

      mockFetch.mockResolvedValueOnce(createMockFetchResponse(createdCampaign))

      await campaignService.create({ ...mockInput, selectedContacts: [] })

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  // =============================================================================
  // PRECHECK
  // =============================================================================
  describe('precheck', () => {
    it('deve validar contatos e retornar resultado', async () => {
      const mockResult: CampaignPrecheckResult = {
        ok: true,
        templateName: 'test_template',
        totals: { total: 10, valid: 8, skipped: 2 },
        results: [
          { ok: true, name: 'Joao', phone: '+5511999999999', normalizedPhone: '+5511999999999' },
        ],
      }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockResult))

      const result = await campaignService.precheck({
        templateName: 'test_template',
        contacts: [{ phone: '+5511999999999', name: 'Joao' }],
      })

      expect(mockFetch).toHaveBeenCalledWith('/api/campaign/precheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      })
      expect(result).toEqual(mockResult)
    })

    it('deve lancar erro quando validacao falha', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ error: 'Template not found' }, { ok: false }))

      await expect(campaignService.precheck({
        templateName: 'invalid_template',
        contacts: [],
      })).rejects.toThrow('Template not found')
    })

    it('deve usar mensagem padrao quando erro nao tem detalhes', async () => {
      const mockResponse = {
        ok: false,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      await expect(campaignService.precheck({
        templateName: 'test',
        contacts: [],
      })).rejects.toThrow('Falha ao validar destinatários')
    })
  })

  // =============================================================================
  // DISPATCH TO BACKEND
  // =============================================================================
  describe('dispatchToBackend', () => {
    it('deve disparar campanha para o backend', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ success: true }))

      await campaignService.dispatchToBackend('campaign-123', 'template_name', [
        { id: 'c1', contactId: 'c1', name: 'Joao', phone: '+5511999999999' },
      ])

      expect(mockFetch).toHaveBeenCalledWith('/api/campaign/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('campaign-123'),
      })
    })

    it('deve lancar erro com detalhes quando dispatch falha', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(
        { error: 'Queue failed', details: 'QSTASH_TOKEN not configured' },
        { ok: false }
      ))

      await expect(campaignService.dispatchToBackend('campaign-123', 'template_name'))
        .rejects.toThrow('Queue failed: QSTASH_TOKEN not configured')
    })

    it('deve propagar excecao de rede', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failed'))

      await expect(campaignService.dispatchToBackend('campaign-123', 'template_name'))
        .rejects.toThrow('Network failed')
    })
  })

  // =============================================================================
  // RESEND SKIPPED
  // =============================================================================
  describe('resendSkipped', () => {
    it('deve reenviar contatos ignorados', async () => {
      const mockResult = { status: 'success', resent: 5, stillSkipped: 2 }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockResult))

      const result = await campaignService.resendSkipped('campaign-123')

      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns/campaign-123/resend-skipped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      expect(result).toEqual(mockResult)
    })

    it('deve lancar erro quando falha', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(
        { error: 'No skipped contacts', details: 'Campaign has no contacts to resend' },
        { ok: false }
      ))

      await expect(campaignService.resendSkipped('campaign-123'))
        .rejects.toThrow('No skipped contacts: Campaign has no contacts to resend')
    })
  })

  // =============================================================================
  // DELETE
  // =============================================================================
  describe('delete', () => {
    it('deve deletar campanha', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null))

      await campaignService.delete('campaign-123')

      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns/campaign-123', { method: 'DELETE' })
    })

    it('deve lancar erro quando delete falha', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false }))

      await expect(campaignService.delete('campaign-123')).rejects.toThrow('Failed to delete campaign')
    })
  })

  // =============================================================================
  // DUPLICATE
  // =============================================================================
  describe('duplicate', () => {
    it('deve duplicar campanha', async () => {
      const duplicatedCampaign = createMockCampaign({ id: 'duplicated-123', name: 'Test Campaign (copia)' })
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(duplicatedCampaign))

      const result = await campaignService.duplicate('campaign-123')

      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns/campaign-123/clone', { method: 'POST' })
      expect(result).toEqual(duplicatedCampaign)
    })

    it('deve lancar erro quando duplicacao falha', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false }))

      await expect(campaignService.duplicate('campaign-123')).rejects.toThrow('Failed to duplicate campaign')
    })
  })

  // =============================================================================
  // PAUSE
  // =============================================================================
  describe('pause', () => {
    it('deve pausar campanha', async () => {
      const pausedCampaign = createMockCampaign({ status: CampaignStatus.PAUSED, pausedAt: '2024-01-01T12:00:00.000Z' })

      // Mock PATCH
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(pausedCampaign))
      // Mock POST pause backend
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ success: true }))

      const result = await campaignService.pause('campaign-123')

      expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/campaigns/campaign-123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining(CampaignStatus.PAUSED),
      })
      expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/campaign/campaign-123/pause', { method: 'POST' })
      expect(result).toEqual(pausedCampaign)
    })

    it('deve retornar undefined quando PATCH falha', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false }))

      const result = await campaignService.pause('campaign-123')

      expect(result).toBeUndefined()
    })

    it('deve continuar mesmo quando backend pause falha', async () => {
      const pausedCampaign = createMockCampaign({ status: CampaignStatus.PAUSED })

      mockFetch.mockResolvedValueOnce(createMockFetchResponse(pausedCampaign))
      mockFetch.mockRejectedValueOnce(new Error('Backend error'))

      const result = await campaignService.pause('campaign-123')

      expect(result).toEqual(pausedCampaign)
      expect(console.error).toHaveBeenCalledWith('Failed to pause campaign on backend:', expect.any(Error))
    })
  })

  // =============================================================================
  // RESUME
  // =============================================================================
  describe('resume', () => {
    it('deve retomar campanha pausada', async () => {
      const pausedCampaign = createMockCampaign({ status: CampaignStatus.PAUSED })
      const resumedCampaign = createMockCampaign({ status: CampaignStatus.SENDING, pausedAt: undefined })

      // Mock getById
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(pausedCampaign))
      // Mock PATCH
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(resumedCampaign))
      // Mock POST resume backend
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ success: true }))

      const result = await campaignService.resume('campaign-123')

      expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/campaigns/campaign-123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining(CampaignStatus.SENDING),
      })
      expect(result).toEqual(resumedCampaign)
    })

    it('deve retornar undefined quando campanha nao existe', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 404 }))

      const result = await campaignService.resume('nonexistent')

      expect(result).toBeUndefined()
    })

    it('deve continuar mesmo quando backend resume falha', async () => {
      const pausedCampaign = createMockCampaign({ status: CampaignStatus.PAUSED })
      const resumedCampaign = createMockCampaign({ status: CampaignStatus.SENDING })

      mockFetch.mockResolvedValueOnce(createMockFetchResponse(pausedCampaign))
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(resumedCampaign))
      mockFetch.mockRejectedValueOnce(new Error('Backend error'))

      const result = await campaignService.resume('campaign-123')

      expect(result).toEqual(resumedCampaign)
    })
  })

  // =============================================================================
  // CANCEL
  // =============================================================================
  describe('cancel', () => {
    it('deve cancelar campanha', async () => {
      const cancelledCampaign = createMockCampaign({ status: CampaignStatus.CANCELLED })
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ campaign: cancelledCampaign }))

      const result = await campaignService.cancel('campaign-123')

      expect(mockFetch).toHaveBeenCalledWith('/api/campaign/campaign-123/cancel', { method: 'POST' })
      expect(result).toEqual(cancelledCampaign)
    })

    it('deve lancar erro quando cancelamento falha', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(
        { error: 'Cannot cancel', details: 'Campaign already completed' },
        { ok: false }
      ))

      await expect(campaignService.cancel('campaign-123'))
        .rejects.toThrow('Cannot cancel: Campaign already completed')
    })
  })

  // =============================================================================
  // START
  // =============================================================================
  describe('start', () => {
    it('deve iniciar campanha agendada', async () => {
      const scheduledCampaign = createMockCampaign({
        status: CampaignStatus.SCHEDULED,
        scheduledAt: '2024-12-25T10:00:00.000Z',
      })
      const startedCampaign = createMockCampaign({
        status: CampaignStatus.SENDING,
        startedAt: '2024-01-01T12:00:00.000Z',
      })

      // Mock getById
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(scheduledCampaign))
      // Mock dispatch
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ success: true }))
      // Mock PATCH
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(startedCampaign))
      // Mock getById final
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(startedCampaign))

      const result = await campaignService.start('campaign-123')

      expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/campaign/dispatch', expect.any(Object))
      expect(result).toEqual(startedCampaign)
    })

    it('deve retornar undefined quando campanha nao existe', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 404 }))

      const result = await campaignService.start('nonexistent')

      expect(result).toBeUndefined()
    })

    it('deve retornar undefined quando dispatch falha', async () => {
      const scheduledCampaign = createMockCampaign({ status: CampaignStatus.SCHEDULED })

      mockFetch.mockResolvedValueOnce(createMockFetchResponse(scheduledCampaign))
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ error: 'Dispatch failed' }, { ok: false }))

      const result = await campaignService.start('campaign-123')

      expect(result).toBeUndefined()
    })
  })

  // =============================================================================
  // CANCEL SCHEDULE
  // =============================================================================
  describe('cancelSchedule', () => {
    it('deve cancelar agendamento', async () => {
      const campaign = createMockCampaign({ status: CampaignStatus.DRAFT })
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ campaign }))

      const result = await campaignService.cancelSchedule('campaign-123')

      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns/campaign-123/cancel-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      expect(result).toEqual({ ok: true, campaign })
    })

    it('deve retornar erro quando cancelamento falha', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(
        { error: 'Schedule not found' },
        { ok: false }
      ))

      const result = await campaignService.cancelSchedule('campaign-123')

      expect(result).toEqual({ ok: false, error: 'Schedule not found' })
    })
  })

  // =============================================================================
  // UPDATE STATS
  // =============================================================================
  describe('updateStats', () => {
    it('deve atualizar estatisticas da campanha', async () => {
      const realStatus = {
        campaignId: 'campaign-123',
        stats: { sent: 100, delivered: 95, read: 80, skipped: 0, failed: 0, total: 100 },
        messages: [],
      }
      const campaign = createMockCampaign({ recipients: 100, sent: 50 })
      const updatedCampaign = createMockCampaign({
        recipients: 100,
        sent: 100,
        delivered: 95,
        read: 80,
        status: CampaignStatus.COMPLETED,
      })

      // Mock getRealStatus
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(realStatus))
      // Mock getById
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(campaign))
      // Mock PATCH
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(updatedCampaign))

      const result = await campaignService.updateStats('campaign-123')

      expect(result).toEqual(updatedCampaign)
    })

    it('deve retornar campanha sem atualizar quando nao ha status real', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false }))

      const campaign = createMockCampaign()
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(campaign))

      const result = await campaignService.updateStats('campaign-123')

      expect(result).toEqual(campaign)
    })

    it('deve retornar campanha quando PATCH falha', async () => {
      const realStatus = {
        campaignId: 'campaign-123',
        stats: { sent: 50, delivered: 45, read: 20, skipped: 0, failed: 0, total: 100 },
        messages: [],
      }
      const campaign = createMockCampaign()

      mockFetch.mockResolvedValueOnce(createMockFetchResponse(realStatus))
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(campaign))
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false }))

      const result = await campaignService.updateStats('campaign-123')

      expect(result).toEqual(campaign)
    })

    it('nao deve completar campanha quando ainda ha mensagens pendentes', async () => {
      const realStatus = {
        campaignId: 'campaign-123',
        stats: { sent: 50, delivered: 45, read: 20, skipped: 0, failed: 0, total: 100 },
        messages: [],
      }
      const campaign = createMockCampaign({ recipients: 100, status: CampaignStatus.SENDING })
      const updatedCampaign = createMockCampaign({ sent: 50, delivered: 45, read: 20 })

      mockFetch.mockResolvedValueOnce(createMockFetchResponse(realStatus))
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(campaign))
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(updatedCampaign))

      await campaignService.updateStats('campaign-123')

      // Verifica que o status NAO foi alterado para COMPLETED
      const patchCall = mockFetch.mock.calls[2]
      const body = JSON.parse(patchCall[1].body)
      expect(body.status).toBe(CampaignStatus.SENDING)
    })
  })

  // =============================================================================
  // ERROR HANDLING - NETWORK FAILURES
  // =============================================================================
  describe('error handling - network failures', () => {
    it('list deve tratar erros de rede graciosamente', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(campaignService.list({ limit: 10, offset: 0 })).rejects.toThrow('Network error')
    })

    it('getAll deve tratar erros de rede graciosamente', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(campaignService.getAll()).rejects.toThrow('Network error')
    })

    it('getById deve tratar erros de rede graciosamente', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(campaignService.getById('campaign-123')).rejects.toThrow('Network error')
    })

    it('delete deve tratar erros de rede graciosamente', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(campaignService.delete('campaign-123')).rejects.toThrow('Network error')
    })
  })

  // =============================================================================
  // ERROR HANDLING - HTTP ERRORS
  // =============================================================================
  describe('error handling - HTTP 500', () => {
    it('list deve retornar lista vazia para 500', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 500, statusText: 'Internal Server Error' }))

      const result = await campaignService.list({ limit: 10, offset: 0 })

      expect(result).toEqual({ data: [], total: 0, limit: 10, offset: 0 })
    })

    it('getAll deve retornar array vazio para 500', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 500 }))

      const result = await campaignService.getAll()

      expect(result).toEqual([])
    })

    it('getById deve retornar undefined para 500', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(null, { ok: false, status: 500, statusText: 'Server Error' }))

      const result = await campaignService.getById('campaign-123')

      expect(result).toBeUndefined()
    })
  })
})
