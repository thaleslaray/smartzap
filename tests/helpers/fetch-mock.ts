/**
 * Fetch Mock Helpers
 *
 * Centraliza o padrão de mock de global.fetch usado em service tests.
 * Elimina duplicação do createMockResponse (definido inline em 7 arquivos).
 *
 * @example
 * ```ts
 * import { createMockFetchResponse, setupFetchMock } from '@/tests/helpers'
 *
 * describe('myService', () => {
 *   const mockFetch = setupFetchMock()
 *
 *   it('fetches data', async () => {
 *     mockFetch.mockResolvedValueOnce(createMockFetchResponse({ ok: true }))
 *     const result = await myService.getData()
 *     expect(result).toEqual({ ok: true })
 *   })
 * })
 * ```
 */

import { vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// createMockFetchResponse
// ---------------------------------------------------------------------------

interface MockFetchResponseOptions {
  ok?: boolean
  status?: number
  statusText?: string
}

/**
 * Cria um objeto Response-like para uso com global.fetch mockado.
 *
 * Superset dos campos usados em todos os service tests:
 * ok, status, statusText, json(), text()
 */
export function createMockFetchResponse(
  data: unknown,
  options?: MockFetchResponseOptions,
) {
  return {
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    statusText: options?.statusText ?? 'OK',
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  }
}

// ---------------------------------------------------------------------------
// setupFetchMock
// ---------------------------------------------------------------------------

/**
 * Configura global.fetch como vi.fn() com save/restore automático.
 *
 * Deve ser chamado dentro de um describe().
 * Registra beforeEach (assign) e afterEach (restore) automaticamente.
 * Retorna o mockFetch para uso em mockResolvedValueOnce().
 */
export function setupFetchMock(): ReturnType<typeof vi.fn> {
  const mockFetch = vi.fn()
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    ;(globalThis as any).fetch = mockFetch
  })

  afterEach(() => {
    ;(globalThis as any).fetch = originalFetch
  })

  return mockFetch
}
