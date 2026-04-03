import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import type { AppSettings } from '../types'

vi.mock('../lib/storage', () => ({
  storage: {
    settings: {
      get: vi.fn(() => ({
        phoneNumberId: '',
        businessAccountId: '',
        accessToken: '',
        isConnected: false,
      })),
      save: vi.fn(),
    },
  },
}))

import { storage } from '../lib/storage'
import { settingsService } from './settingsService'

import { createMockFetchResponse, setupFetchMock } from '@/tests/helpers'

describe('settingsService', () => {
  const mockFetch = setupFetchMock()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('getAll', () => {
    it('deve buscar todos os settings', async () => {
      const payload = { timestamp: 'now' }
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(payload))

      const result = await settingsService.getAll()

      expect(mockFetch).toHaveBeenCalledWith('/api/settings/all', { cache: 'no-store' })
      expect(result).toEqual(payload)
    })
  })

  describe('get', () => {
    it('deve retornar settings locais quando servidor não está conectado', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ isConnected: false }))

      const result = await settingsService.get()

      expect(storage.settings.get).toHaveBeenCalled()
      expect(result.isConnected).toBe(false)
    })

    it('deve combinar settings quando servidor retorna credenciais', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({
        isConnected: true,
        phoneNumberId: '123',
        businessAccountId: '456',
        displayPhoneNumber: '+5511999999999',
        verifiedName: 'Empresa',
        hasToken: true,
      }))

      const result = await settingsService.get()

      expect(result.isConnected).toBe(true)
      expect(result.accessToken).toBe('***configured***')
      expect(result.phoneNumberId).toBe('123')
    })
  })

  describe('save', () => {
    it('deve salvar localmente quando token está mascarado', async () => {
      const input: AppSettings = {
        phoneNumberId: '123',
        businessAccountId: '456',
        accessToken: '***configured***',
        isConnected: true,
      }

      const result = await settingsService.save(input)

      expect(storage.settings.save).toHaveBeenCalledWith({
        ...input,
        accessToken: '',
      })
      expect(result).toEqual(input)
    })

    it('deve salvar credenciais no servidor quando token real', async () => {
      const input: AppSettings = {
        phoneNumberId: '123',
        businessAccountId: '456',
        accessToken: 'real_token',
        isConnected: false,
      }

      mockFetch.mockResolvedValueOnce(createMockFetchResponse({
        displayPhoneNumber: '+5511999999999',
        verifiedName: 'Empresa',
      }))

      const result = await settingsService.save(input)

      expect(mockFetch).toHaveBeenCalledWith('/api/settings/credentials', expect.objectContaining({ method: 'POST' }))
      expect(result.isConnected).toBe(true)
      expect(result.displayPhoneNumber).toBe('+5511999999999')
    })
  })

  describe('testConnection', () => {
    it('deve lançar erro com detalhes quando falha', async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({ error: 'Falha', code: 400 }, { ok: false }))

      await expect(settingsService.testConnection()).rejects.toMatchObject({
        message: 'Falha',
        details: { error: 'Falha', code: 400 },
      })
    })
  })
})
