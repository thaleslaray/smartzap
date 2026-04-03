import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { templateService, TemplateServiceError } from './templateService'

import { createMockFetchResponse, setupFetchMock } from '@/tests/helpers'

describe('templateService', () => {
  const mockFetch = setupFetchMock()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('deve normalizar categoria no getAll', async () => {
    const payload = [
      {
        id: 't1',
        name: 'promo',
        category: 'UTILITY',
        language: 'pt_BR',
        status: 'APPROVED',
        content: 'oi {{1}}',
        preview: 'oi Ana',
        lastUpdated: '2025-01-01',
      },
    ]

    mockFetch.mockResolvedValueOnce(createMockFetchResponse(payload))

    const result = await templateService.getAll()

    expect(result[0].category).toBe('UTILIDADE')
  })

  it('deve lançar NOT_CONFIGURED quando 401', async () => {
    mockFetch.mockResolvedValueOnce(createMockFetchResponse({ error: 'Sem token' }, { ok: false, status: 401 }))

    let error: unknown
    try {
      await templateService.getAll()
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(TemplateServiceError)
    expect(error).toMatchObject({ code: 'NOT_CONFIGURED' })
  })

  it('sync deve retornar total por count/total/array', async () => {
    mockFetch
      .mockResolvedValueOnce(createMockFetchResponse([{ id: '1' }, { id: '2' }]))
      .mockResolvedValueOnce(createMockFetchResponse({ count: 3 }))
      .mockResolvedValueOnce(createMockFetchResponse({ total: 4 }))

    await expect(templateService.sync()).resolves.toBe(2)
    await expect(templateService.sync()).resolves.toBe(3)
    await expect(templateService.sync()).resolves.toBe(4)
  })

  it('generateUtilityTemplates deve propagar erro', async () => {
    mockFetch.mockResolvedValueOnce(createMockFetchResponse({ error: 'Falha' }, { ok: false }))

    await expect(templateService.generateUtilityTemplates({ prompt: 'teste' })).rejects.toThrow('Falha')
  })

  it('createInMeta deve enviar categoria UTILITY', async () => {
    mockFetch.mockResolvedValueOnce(createMockFetchResponse({ message: 'ok' }))

    await templateService.createInMeta({ name: 't', content: 'c', language: 'pt_BR' })

    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.category).toBe('UTILITY')
  })

  it('getByName deve adicionar refresh_preview', async () => {
    mockFetch.mockResolvedValueOnce(createMockFetchResponse({ id: 't1' }))

    await templateService.getByName('teste', { refreshPreview: true })

    expect(mockFetch).toHaveBeenCalledWith('/api/templates/teste?refresh_preview=1', expect.any(Object))
  })

  it('deleteBulk deve retornar payload', async () => {
    const payload = { total: 2, deleted: 2, failed: 0, success: ['a', 'b'], errors: [] }
    mockFetch.mockResolvedValueOnce(createMockFetchResponse(payload))

    const result = await templateService.deleteBulk(['a', 'b'])

    expect(result).toEqual(payload)
  })

  it('uploadHeaderMedia deve retornar handle', async () => {
    mockFetch.mockResolvedValueOnce(createMockFetchResponse({ handle: 'h1' }))

    const file = new File(['x'], 'x.png', { type: 'image/png' })
    const result = await templateService.uploadHeaderMedia(file, 'image')

    expect(result.handle).toBe('h1')
  })

  it('uploadHeaderMedia deve falhar se não houver handle', async () => {
    mockFetch.mockResolvedValueOnce(createMockFetchResponse({}))

    const file = new File(['x'], 'x.png', { type: 'image/png' })

    await expect(templateService.uploadHeaderMedia(file, 'image')).rejects.toThrow('header_handle')
  })
})
