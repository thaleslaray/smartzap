import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  redactSensitiveData,
  containsSensitiveData,
  stripCredentials,
} from './redact'

// ─── redactSensitiveData ─────────────────────────────────────────────────────

describe('redactSensitiveData', () => {
  // ── Valores primitivos passam sem alteração ────────────────────────────────

  describe('valores primitivos', () => {
    it('deve retornar null para null', () => {
      expect(redactSensitiveData(null)).toBeNull()
    })

    it('deve retornar undefined para undefined', () => {
      expect(redactSensitiveData(undefined)).toBeUndefined()
    })

    it('deve retornar string sem alteração', () => {
      expect(redactSensitiveData('hello')).toBe('hello')
    })

    it('deve retornar número sem alteração', () => {
      expect(redactSensitiveData(42)).toBe(42)
    })

    it('deve retornar boolean sem alteração', () => {
      expect(redactSensitiveData(true)).toBe(true)
    })
  })

  // ── Redação de chaves sensíveis ────────────────────────────────────────────

  describe('redação de chaves sensíveis por nome exato', () => {
    // Nota: isSensitiveKey faz key.toLowerCase() antes de checar o Set.
    // Chaves camelCase no Set (como "privateKey") nunca casam por exact match
    // porque "privatekey" (lowercase) não está no Set. Só as snake_case funcionam.
    // As camelCase que têm padrão regex correspondente (ex: "accessToken" casa com /token/i)
    // ainda são detectadas via pattern match.
    const sensitiveKeys = [
      'api_key', 'apikey', 'key',
      'password', 'passwd', 'pwd', 'secret', 'token',
      'access_token', 'refresh_token',
      'private_key',
      'database_url', 'connection_string',
      'authorization', 'auth', 'bearer',
      'credit_card', 'card_number', 'cvv', 'ssn',
      'phone_number', 'social_security',
      // camelCase detectadas via SENSITIVE_PATTERNS (não exact match):
      'apiKey',       // /api[_-]?key/i
      'accessToken',  // /token/i
      'refreshToken', // /token/i
    ]

    for (const key of sensitiveKeys) {
      it(`deve redactar a chave "${key}"`, () => {
        const data = { [key]: 'sensitive-value-12345678' }
        const result = redactSensitiveData(data)
        expect(result[key]).not.toBe('sensitive-value-12345678')
        expect(result[key]).toContain('****')
      })
    }

    // camelCase que NÃO são detectadas (não casam nem exact nem pattern):
    const undetectedCamelCase = [
      'privateKey', 'databaseUrl', 'connectionString',
      'creditCard', 'cardNumber', 'phoneNumber', 'socialSecurity',
    ]

    for (const key of undetectedCamelCase) {
      it(`NÃO detecta "${key}" (camelCase sem pattern match — limitação do .toLowerCase())`, () => {
        const data = { [key]: 'sensitive-value-12345678' }
        const result = redactSensitiveData(data)
        // Valor passa intacto — o Set tem a chave, mas .toLowerCase() impede o match
        expect(result[key]).toBe('sensitive-value-12345678')
      })
    }
  })

  describe('redação de chaves sensíveis por padrão regex', () => {
    it('deve redactar chaves que contêm "api_key"', () => {
      const result = redactSensitiveData({ my_api_key_here: 'abc12345' })
      expect(result.my_api_key_here).toContain('****')
    })

    it('deve redactar chaves que contêm "token"', () => {
      const result = redactSensitiveData({ myCustomToken: 'secret12345' })
      expect(result.myCustomToken).toContain('****')
    })

    it('deve redactar chaves que contêm "secret"', () => {
      const result = redactSensitiveData({ app_secret_key: 'mysecretvalue' })
      expect(result.app_secret_key).toContain('****')
    })

    it('deve redactar chaves que contêm "password"', () => {
      const result = redactSensitiveData({ user_password: 'p@ssword123' })
      expect(result.user_password).toContain('****')
    })

    it('deve redactar chaves que contêm "credential"', () => {
      const result = redactSensitiveData({ serviceCredential: 'cred12345' })
      expect(result.serviceCredential).toContain('****')
    })

    it('deve redactar chaves que contêm "auth"', () => {
      const result = redactSensitiveData({ oauthKey: 'oauth12345' })
      expect(result.oauthKey).toContain('****')
    })
  })

  // ── maskValue: lógica de mascaramento ──────────────────────────────────────

  describe('lógica de mascaramento (maskValue)', () => {
    it('deve mostrar os últimos 4 caracteres para strings longas', () => {
      const result = redactSensitiveData({ apiKey: 'sk-1234567890abcdef' })
      expect(result.apiKey).toMatch(/\*+cdef$/)
    })

    it('deve mascarar completamente strings com 4 ou menos caracteres', () => {
      const result = redactSensitiveData({ apiKey: 'abc' })
      expect(result.apiKey).toBe('****')
    })

    it('deve mascarar string com exatamente 4 caracteres', () => {
      const result = redactSensitiveData({ apiKey: 'abcd' })
      expect(result.apiKey).toBe('****')
    })

    it('deve mascarar string com 5 caracteres mostrando último 4', () => {
      const result = redactSensitiveData({ apiKey: '12345' })
      expect(result.apiKey).toBe('*2345')
    })

    it('deve redactar com [REDACTED] para string vazia', () => {
      const result = redactSensitiveData({ apiKey: '' })
      expect(result.apiKey).toBe('[REDACTED]')
    })

    it('deve usar [REDACTED] para valores não-string em chaves sensíveis', () => {
      const result = redactSensitiveData({ apiKey: 12345 })
      expect(result.apiKey).toBe('[REDACTED]')
    })

    it('deve usar [REDACTED] para booleanos em chaves sensíveis', () => {
      const result = redactSensitiveData({ token: true })
      expect(result.token).toBe('[REDACTED]')
    })

    it('deve usar [REDACTED] para null em chaves sensíveis', () => {
      const result = redactSensitiveData({ password: null })
      expect(result.password).toBe('[REDACTED]')
    })

    it('deve limitar asteriscos a no máximo 8', () => {
      // Para string de 20 chars: 20-4=16, mas min(8,16) = 8 asteriscos + last 4
      const result = redactSensitiveData({ apiKey: '12345678901234567890' })
      expect(result.apiKey).toBe('********7890')
    })
  })

  // ── Chaves não-sensíveis permanecem ────────────────────────────────────────

  describe('chaves não-sensíveis', () => {
    it('deve preservar chaves não-sensíveis', () => {
      const data = { name: 'John', age: 30, email: 'john@example.com' }
      const result = redactSensitiveData(data)
      expect(result).toEqual({ name: 'John', age: 30, email: 'john@example.com' })
    })
  })

  // ── Recursividade ──────────────────────────────────────────────────────────

  describe('comportamento recursivo', () => {
    it('deve redactar em objetos aninhados', () => {
      // Nota: "credentials" casa com /credential/i, então é redactada como um todo.
      // Usamos um wrapper não-sensível para testar recursão.
      const data = {
        user: {
          name: 'John',
          settings: {
            api_key: 'sk-12345678',
            password: 'super-secret-pass',
          },
        },
      }
      const result = redactSensitiveData(data)
      expect(result.user.name).toBe('John')
      expect(result.user.settings.api_key).toContain('****')
      expect(result.user.settings.password).toContain('****')
    })

    it('deve redactar em arrays de objetos', () => {
      const data = [
        { name: 'Service A', token: 'token-abc-12345' },
        { name: 'Service B', token: 'token-xyz-67890' },
      ]
      const result = redactSensitiveData(data)
      expect(result[0].name).toBe('Service A')
      expect(result[0].token).toContain('****')
      expect(result[1].token).toContain('****')
    })

    it('deve lidar com arrays aninhados em objetos', () => {
      const data = {
        services: [
          { apiKey: 'key-123456789' },
        ],
      }
      const result = redactSensitiveData(data)
      expect(result.services[0].apiKey).toContain('****')
    })

    it('deve parar recursão na profundidade máxima (10)', () => {
      // Construir objeto com profundidade > 10
      let obj: any = { apiKey: 'should-not-be-redacted' }
      for (let i = 0; i < 12; i++) {
        obj = { nested: obj }
      }
      const result = redactSensitiveData(obj)
      // Objeto na profundidade > 10 será retornado sem alteração
      let current = result
      for (let i = 0; i < 12; i++) {
        current = current.nested
      }
      // Na profundidade > 10, o valor deve passar sem redação
      expect(current.apiKey).toBe('should-not-be-redacted')
    })

    it('deve preservar tipos primitivos dentro de arrays', () => {
      const data = [1, 'two', true, null]
      expect(redactSensitiveData(data)).toEqual([1, 'two', true, null])
    })
  })

  // ── Tratamento de erro ─────────────────────────────────────────────────────

  describe('tratamento de erro interno', () => {
    it('deve retornar [REDACTION_ERROR] quando processamento falha', () => {
      // Forçar erro criando um objeto com getter que lança exceção
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const badObj = {}
      Object.defineProperty(badObj, 'key', {
        get() { throw new Error('cannot access') },
        enumerable: true,
      })

      const result = redactSensitiveData(badObj)
      expect(result).toBe('[REDACTION_ERROR]')

      consoleSpy.mockRestore()
    })
  })
})

// ─── containsSensitiveData ───────────────────────────────────────────────────

describe('containsSensitiveData', () => {
  it('deve retornar true quando objeto contém chave sensível', () => {
    expect(containsSensitiveData({ apiKey: 'value', name: 'test' })).toBe(true)
  })

  it('deve retornar true para chaves com padrão sensível', () => {
    expect(containsSensitiveData({ myCustomToken: 'value' })).toBe(true)
  })

  it('deve retornar false para objeto sem chaves sensíveis', () => {
    expect(containsSensitiveData({ name: 'John', age: 30 })).toBe(false)
  })

  it('deve retornar false para objeto vazio', () => {
    expect(containsSensitiveData({})).toBe(false)
  })

  it('deve retornar false para null', () => {
    expect(containsSensitiveData(null as unknown as Record<string, unknown>)).toBe(false)
  })

  it('deve retornar false para undefined', () => {
    expect(containsSensitiveData(undefined as unknown as Record<string, unknown>)).toBe(false)
  })

  it('deve retornar false para tipo não-objeto', () => {
    expect(containsSensitiveData('string' as unknown as Record<string, unknown>)).toBe(false)
  })

  it('deve detectar chave password', () => {
    expect(containsSensitiveData({ password: '123' })).toBe(true)
  })

  it('deve detectar chave token', () => {
    expect(containsSensitiveData({ token: 'abc' })).toBe(true)
  })

  it('deve detectar chaves com padrão credential', () => {
    expect(containsSensitiveData({ userCredential: 'data' })).toBe(true)
  })
})

// ─── stripCredentials ────────────────────────────────────────────────────────

describe('stripCredentials', () => {
  it('deve remover chaves sensíveis de objeto simples', () => {
    const data = { name: 'John', apiKey: 'sk-123', age: 30 }
    const result = stripCredentials(data)
    expect(result).toEqual({ name: 'John', age: 30 })
    expect(result.apiKey).toBeUndefined()
  })

  it('deve remover múltiplas chaves sensíveis', () => {
    const data = { name: 'test', password: 'secret', token: 'abc', level: 5 }
    const result = stripCredentials(data)
    expect(result).toEqual({ name: 'test', level: 5 })
  })

  it('deve remover chaves sensíveis recursivamente', () => {
    // Nota: "credentials" casa com /credential/i, logo é removida inteira.
    // Usamos wrapper não-sensível para testar recursão.
    const data = {
      user: {
        name: 'John',
        config: {
          api_key: 'key-123',
          display: 'admin',
        },
      },
    }
    const result = stripCredentials(data)
    expect(result.user.name).toBe('John')
    expect(result.user.config).toEqual({ display: 'admin' })
  })

  it('deve processar arrays recursivamente', () => {
    const data = [
      { name: 'A', token: 'abc' },
      { name: 'B', secret: 'xyz' },
    ]
    const result = stripCredentials(data)
    expect(result).toEqual([{ name: 'A' }, { name: 'B' }])
  })

  it('deve retornar null para null', () => {
    expect(stripCredentials(null)).toBeNull()
  })

  it('deve retornar undefined para undefined', () => {
    expect(stripCredentials(undefined)).toBeUndefined()
  })

  it('deve retornar valor primitivo sem alteração', () => {
    expect(stripCredentials('hello')).toBe('hello')
    expect(stripCredentials(42)).toBe(42)
    expect(stripCredentials(true)).toBe(true)
  })

  it('deve preservar chaves não-sensíveis', () => {
    const data = { name: 'Test', email: 'test@example.com', count: 5 }
    expect(stripCredentials(data)).toEqual(data)
  })

  it('deve remover chaves detectadas por padrão regex', () => {
    const data = { mySecretValue: 'hidden', visible: 'shown' }
    const result = stripCredentials(data)
    expect(result).toEqual({ visible: 'shown' })
  })
})
