import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { metaDiagnosticsService } from './metaDiagnosticsService'
import type { MetaDiagnosticsResponse, MetaDiagnosticsAction } from './metaDiagnosticsService'

import { createMockFetchResponse, setupFetchMock } from '@/tests/helpers'

const mockDiagnostics: MetaDiagnosticsResponse = {
  ok: true,
  ts: '2026-01-01T00:00:00.000Z',
  checks: [
    { id: 'token', title: 'Token', status: 'pass', message: 'Token valido' },
  ],
}

describe('metaDiagnosticsService', () => {
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
    it('deve buscar diagnostico com no-cache', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockDiagnostics))

      const result = await metaDiagnosticsService.get()

      expect(mockFetch).toHaveBeenCalledWith('/api/meta/diagnostics', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      expect(result).toEqual(mockDiagnostics)
    })

    it('deve lancar erro quando fetch falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ error: 'Credenciais invalidas' }, { ok: false, status: 401 })
      )

      await expect(metaDiagnosticsService.get()).rejects.toThrow('Credenciais invalidas')
    })
  })

  // ===========================================================================
  // RUN ACTION
  // ===========================================================================
  describe('runAction', () => {
    it('deve executar acao API com sucesso', async () => {
      const action: MetaDiagnosticsAction = {
        id: 'refresh-token',
        label: 'Atualizar Token',
        kind: 'api',
        method: 'POST',
        endpoint: '/api/meta/refresh-token',
        body: { force: true },
      }
      const actionResult = { success: true }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(actionResult))

      const result = await metaDiagnosticsService.runAction(action)

      expect(mockFetch).toHaveBeenCalledWith('/api/meta/refresh-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      })
      expect(result).toEqual(actionResult)
    })

    it('deve montar mensagem de erro detalhada com userTitle, userMsg e code', async () => {
      const action: MetaDiagnosticsAction = {
        id: 'delete-webhook',
        label: 'Remover Webhook',
        kind: 'api',
        method: 'DELETE',
        endpoint: '/api/meta/webhook',
      }
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(
          {
            error: 'Falha ao executar',
            details: {
              code: 190,
              error_user_title: 'Token Expirado',
              error_user_msg: 'Renove o token de acesso',
            },
          },
          { ok: false, status: 400 }
        )
      )

      await expect(metaDiagnosticsService.runAction(action)).rejects.toThrow(
        'Token Expirado — Falha ao executar — Renove o token de acesso — (código 190)'
      )
    })

    it('deve lancar erro para acao com kind diferente de api', async () => {
      const action: MetaDiagnosticsAction = {
        id: 'link-action',
        label: 'Abrir Link',
        kind: 'link',
        href: 'https://meta.com',
      }

      await expect(metaDiagnosticsService.runAction(action)).rejects.toThrow('Ação inválida (não é API)')
    })

    it('deve lancar erro quando endpoint esta ausente', async () => {
      const action: MetaDiagnosticsAction = {
        id: 'no-endpoint',
        label: 'Sem Endpoint',
        kind: 'api',
      }

      await expect(metaDiagnosticsService.runAction(action)).rejects.toThrow('Ação inválida: endpoint ausente')
    })
  })

  // ===========================================================================
  // SIMULATE 10033
  // ===========================================================================
  describe('simulate10033', () => {
    it('deve simular erro 10033 com sucesso', async () => {
      const simResult = {
        ok: true,
        attempt: { status: 400 },
        result: {
          normalizedError: {
            code: 10033,
            subcode: 0,
            message: 'Parameter value is not valid',
            fbtraceId: 'trace-123',
          },
        },
      }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(simResult))

      const result = await metaDiagnosticsService.simulate10033()

      expect(mockFetch).toHaveBeenCalledWith('/api/meta/diagnostics/simulate-10033', {
        method: 'POST',
      })
      expect(result).toEqual(simResult)
    })

    it('deve retornar objeto de erro sem lancar excecao quando falha', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(
          { error: 'Token expirado', details: { code: 190 } },
          { ok: false, status: 401 }
        )
      )

      const result = await metaDiagnosticsService.simulate10033()

      // simulate10033 nao lanca erro, retorna { ok: false, error }
      expect(result).toEqual({
        ok: false,
        error: 'Token expirado',
        details: { code: 190 },
      })
    })
  })
})
