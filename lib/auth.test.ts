import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  verifyApiKey,
  verifyAdminAccess,
  isAdminEndpoint,
  isPublicEndpoint,
  unauthorizedResponse,
  forbiddenResponse,
  generateApiKey,
  ADMIN_ENDPOINTS,
  PUBLIC_ENDPOINTS,
} from './auth'

// Helper: cria um NextRequest fake com headers
function createFakeRequest(headers: Record<string, string> = {}, url = 'http://localhost:3000/api/test'): any {
  return {
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
    nextUrl: {
      pathname: new URL(url).pathname,
    },
  }
}

describe('auth', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    // Copia env original e configura chaves de teste
    process.env = {
      ...ORIGINAL_ENV,
      SMARTZAP_API_KEY: 'test-api-key-123',
      SMARTZAP_ADMIN_KEY: 'test-admin-key-456',
    }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  // ============================================================
  // verifyApiKey
  // ============================================================
  describe('verifyApiKey', () => {
    it('deve rejeitar requisicao sem header de autenticacao', async () => {
      const req = createFakeRequest({})
      const result = await verifyApiKey(req)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Missing API key')
    })

    it('deve aceitar API key via Authorization Bearer', async () => {
      const req = createFakeRequest({
        authorization: 'Bearer test-api-key-123',
      })
      const result = await verifyApiKey(req)

      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('api')
    })

    it('deve aceitar API key via X-API-Key header', async () => {
      const req = createFakeRequest({
        'x-api-key': 'test-api-key-123',
      })
      const result = await verifyApiKey(req)

      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('api')
    })

    it('deve aceitar admin key via Authorization Bearer', async () => {
      const req = createFakeRequest({
        authorization: 'Bearer test-admin-key-456',
      })
      const result = await verifyApiKey(req)

      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('admin')
    })

    it('deve aceitar admin key via X-API-Key header', async () => {
      const req = createFakeRequest({
        'x-api-key': 'test-admin-key-456',
      })
      const result = await verifyApiKey(req)

      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('admin')
    })

    it('deve rejeitar chave invalida', async () => {
      const req = createFakeRequest({
        authorization: 'Bearer chave-errada',
      })
      const result = await verifyApiKey(req)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid API key')
    })

    it('deve rejeitar Authorization sem prefixo Bearer', async () => {
      const req = createFakeRequest({
        authorization: 'test-api-key-123',
      })
      const result = await verifyApiKey(req)

      // Sem "Bearer " o header nao e reconhecido, cai no "Missing API key"
      expect(result.valid).toBe(false)
    })

    it('deve priorizar admin key quando ambas conferem', async () => {
      // Se a mesma chave for configurada como admin E api, admin deve ter prioridade
      process.env.SMARTZAP_API_KEY = 'same-key'
      process.env.SMARTZAP_ADMIN_KEY = 'same-key'

      const req = createFakeRequest({
        authorization: 'Bearer same-key',
      })
      const result = await verifyApiKey(req)

      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('admin')
    })

    it('deve rejeitar quando env vars nao estao configuradas', async () => {
      delete process.env.SMARTZAP_API_KEY
      delete process.env.SMARTZAP_ADMIN_KEY

      const req = createFakeRequest({
        authorization: 'Bearer qualquer-coisa',
      })
      const result = await verifyApiKey(req)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid API key')
    })

    it('deve preferir Authorization sobre X-API-Key quando ambos presentes', async () => {
      const req = createFakeRequest({
        authorization: 'Bearer test-api-key-123',
        'x-api-key': 'chave-errada',
      })
      const result = await verifyApiKey(req)

      // Authorization Bearer e processado primeiro
      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('api')
    })
  })

  // ============================================================
  // verifyAdminAccess
  // ============================================================
  describe('verifyAdminAccess', () => {
    it('deve aceitar admin key', async () => {
      const req = createFakeRequest({
        authorization: 'Bearer test-admin-key-456',
      })
      const result = await verifyAdminAccess(req)

      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('admin')
    })

    it('deve rejeitar API key regular em endpoint admin', async () => {
      const req = createFakeRequest({
        authorization: 'Bearer test-api-key-123',
      })
      const result = await verifyAdminAccess(req)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Admin access required')
    })

    it('deve rejeitar requisicao sem autenticacao', async () => {
      const req = createFakeRequest({})
      const result = await verifyAdminAccess(req)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Missing API key')
    })
  })

  // ============================================================
  // isAdminEndpoint
  // ============================================================
  describe('isAdminEndpoint', () => {
    it('deve identificar endpoints admin conhecidos', () => {
      expect(isAdminEndpoint('/api/database/init')).toBe(true)
      expect(isAdminEndpoint('/api/database/cleanup')).toBe(true)
      expect(isAdminEndpoint('/api/database/migrate')).toBe(true)
      expect(isAdminEndpoint('/api/database/fix-schema')).toBe(true)
      expect(isAdminEndpoint('/api/vercel/redeploy')).toBe(true)
      expect(isAdminEndpoint('/api/vercel/info')).toBe(true)
    })

    it('deve rejeitar endpoints que nao sao admin', () => {
      expect(isAdminEndpoint('/api/campaigns')).toBe(false)
      expect(isAdminEndpoint('/api/contacts')).toBe(false)
      expect(isAdminEndpoint('/api/webhook')).toBe(false)
      expect(isAdminEndpoint('/api/health')).toBe(false)
    })

    it('deve reconhecer sub-paths de endpoints admin', () => {
      // startsWith match
      expect(isAdminEndpoint('/api/database/init/extra')).toBe(true)
      expect(isAdminEndpoint('/api/vercel/redeploy/force')).toBe(true)
    })
  })

  // ============================================================
  // isPublicEndpoint
  // ============================================================
  describe('isPublicEndpoint', () => {
    it('deve identificar endpoints publicos conhecidos', () => {
      expect(isPublicEndpoint('/api/webhook')).toBe(true)
      expect(isPublicEndpoint('/api/health')).toBe(true)
      expect(isPublicEndpoint('/api/system')).toBe(true)
      expect(isPublicEndpoint('/api/flows')).toBe(true)
      expect(isPublicEndpoint('/api/flow-engine')).toBe(true)
      expect(isPublicEndpoint('/api/campaign/dispatch')).toBe(true)
    })

    it('deve rejeitar endpoints protegidos', () => {
      expect(isPublicEndpoint('/api/campaigns')).toBe(false)
      expect(isPublicEndpoint('/api/contacts')).toBe(false)
      expect(isPublicEndpoint('/api/templates')).toBe(false)
      expect(isPublicEndpoint('/api/settings/credentials')).toBe(false)
    })

    it('deve reconhecer sub-paths de endpoints publicos', () => {
      expect(isPublicEndpoint('/api/webhook/validate')).toBe(true)
      expect(isPublicEndpoint('/api/flows/send')).toBe(true)
    })
  })

  // ============================================================
  // unauthorizedResponse
  // ============================================================
  describe('unauthorizedResponse', () => {
    it('deve retornar status 401', () => {
      const response = unauthorizedResponse()
      expect(response.status).toBe(401)
    })

    it('deve incluir header WWW-Authenticate', () => {
      const response = unauthorizedResponse()
      expect(response.headers.get('WWW-Authenticate')).toContain('Bearer')
    })

    it('deve aceitar mensagem customizada', async () => {
      const response = unauthorizedResponse('Token expirado')
      const body = await response.json()
      expect(body.message).toBe('Token expirado')
    })
  })

  // ============================================================
  // forbiddenResponse
  // ============================================================
  describe('forbiddenResponse', () => {
    it('deve retornar status 403', () => {
      const response = forbiddenResponse()
      expect(response.status).toBe(403)
    })

    it('deve aceitar mensagem customizada', async () => {
      const response = forbiddenResponse('Acesso negado')
      const body = await response.json()
      expect(body.message).toBe('Acesso negado')
    })
  })

  // ============================================================
  // generateApiKey
  // ============================================================
  describe('generateApiKey', () => {
    it('deve gerar chave com prefixo szap_', () => {
      const key = generateApiKey()
      expect(key.startsWith('szap_')).toBe(true)
    })

    it('deve gerar chaves unicas', () => {
      const keys = new Set(Array.from({ length: 20 }, () => generateApiKey()))
      expect(keys.size).toBe(20)
    })

    it('deve gerar chave com comprimento consistente', () => {
      const key = generateApiKey()
      // szap_ (5) + 32 chars = 37 total
      expect(key.length).toBe(37)
    })
  })

  // ============================================================
  // Constantes
  // ============================================================
  describe('constantes', () => {
    it('ADMIN_ENDPOINTS deve conter pelo menos os endpoints documentados', () => {
      expect(ADMIN_ENDPOINTS).toContain('/api/database/init')
      expect(ADMIN_ENDPOINTS).toContain('/api/vercel/redeploy')
      expect(ADMIN_ENDPOINTS.length).toBeGreaterThanOrEqual(4)
    })

    it('PUBLIC_ENDPOINTS deve conter pelo menos os endpoints documentados', () => {
      expect(PUBLIC_ENDPOINTS).toContain('/api/webhook')
      expect(PUBLIC_ENDPOINTS).toContain('/api/health')
      expect(PUBLIC_ENDPOINTS.length).toBeGreaterThanOrEqual(4)
    })

    it('nao deve haver sobreposicao entre ADMIN e PUBLIC endpoints', () => {
      const overlap = ADMIN_ENDPOINTS.filter((ep) => PUBLIC_ENDPOINTS.includes(ep))
      expect(overlap).toHaveLength(0)
    })
  })
})
