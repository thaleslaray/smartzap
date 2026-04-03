import { describe, it, expect } from 'vitest'
import { cn, getErrorMessage, getErrorMessageAsync } from './utils'

// ─── cn ──────────────────────────────────────────────────────────────────────

describe('cn', () => {
  it('deve combinar classes simples', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('deve lidar com valores condicionais', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible')
  })

  it('deve mesclar classes Tailwind conflitantes (tailwind-merge)', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('deve lidar com undefined e null', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })

  it('deve lidar com string vazia', () => {
    expect(cn('')).toBe('')
  })

  it('deve aceitar arrays', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })

  it('deve aceitar objetos condicionais', () => {
    expect(cn({ 'text-red': true, 'text-blue': false })).toBe('text-red')
  })

  it('deve retornar string vazia sem argumentos', () => {
    expect(cn()).toBe('')
  })
})

// ─── getErrorMessage ─────────────────────────────────────────────────────────

describe('getErrorMessage', () => {
  // ── null/undefined ─────────────────────────────────────────────────────────

  describe('null e undefined', () => {
    it('deve retornar "Unknown error" para null', () => {
      expect(getErrorMessage(null)).toBe('Unknown error')
    })

    it('deve retornar "Unknown error" para undefined', () => {
      expect(getErrorMessage(undefined)).toBe('Unknown error')
    })
  })

  // ── Error instances ────────────────────────────────────────────────────────

  describe('instâncias de Error', () => {
    it('deve retornar message de Error simples', () => {
      expect(getErrorMessage(new Error('algo deu errado'))).toBe('algo deu errado')
    })

    it('deve incluir cause quando é Error', () => {
      const cause = new Error('causa raiz')
      const error = new Error('erro principal', { cause })
      expect(getErrorMessage(error)).toBe('erro principal: causa raiz')
    })

    it('deve ignorar cause quando não é Error', () => {
      const error = new Error('erro principal')
      ;(error as any).cause = 'string cause'
      expect(getErrorMessage(error)).toBe('erro principal')
    })

    it('deve lidar com TypeError', () => {
      expect(getErrorMessage(new TypeError('tipo inválido'))).toBe('tipo inválido')
    })

    it('deve lidar com RangeError', () => {
      expect(getErrorMessage(new RangeError('fora do range'))).toBe('fora do range')
    })
  })

  // ── Strings ────────────────────────────────────────────────────────────────

  describe('strings', () => {
    it('deve retornar string diretamente', () => {
      expect(getErrorMessage('erro como string')).toBe('erro como string')
    })

    it('deve retornar string vazia como está', () => {
      expect(getErrorMessage('')).toBe('')
    })
  })

  // ── Objetos com propriedade message ────────────────────────────────────────

  describe('objetos com message', () => {
    it('deve extrair message de objeto simples', () => {
      expect(getErrorMessage({ message: 'erro no objeto' })).toBe('erro no objeto')
    })

    it('deve ignorar message vazia', () => {
      const result = getErrorMessage({ message: '' })
      // message é string mas falsy, deve cair para outro handler
      expect(typeof result).toBe('string')
    })

    it('deve ignorar message não-string', () => {
      const result = getErrorMessage({ message: 42 })
      expect(typeof result).toBe('string')
    })
  })

  // ── Objetos com responseBody (AI SDK) ──────────────────────────────────────

  describe('objetos com responseBody (padrão AI SDK)', () => {
    it('deve extrair error string de responseBody', () => {
      expect(
        getErrorMessage({ responseBody: { error: 'rate limit exceeded' } })
      ).toBe('rate limit exceeded')
    })

    it('deve extrair error.message de responseBody', () => {
      expect(
        getErrorMessage({
          responseBody: { error: { message: 'invalid API key' } },
        })
      ).toBe('invalid API key')
    })

    it('deve ignorar responseBody sem error', () => {
      const result = getErrorMessage({ responseBody: { data: 'ok' } })
      expect(typeof result).toBe('string')
    })
  })

  // ── Objetos com error ──────────────────────────────────────────────────────

  describe('objetos com propriedade error', () => {
    it('deve extrair error string', () => {
      expect(getErrorMessage({ error: 'something failed' })).toBe('something failed')
    })

    it('deve extrair error.message quando error é objeto', () => {
      expect(
        getErrorMessage({ error: { message: 'nested error message' } })
      ).toBe('nested error message')
    })

    it('deve ignorar error vazia', () => {
      const result = getErrorMessage({ error: '' })
      expect(typeof result).toBe('string')
    })
  })

  // ── Objetos com data.error / data.message ──────────────────────────────────

  describe('objetos com data (padrão API)', () => {
    it('deve extrair data.error', () => {
      expect(getErrorMessage({ data: { error: 'api error' } })).toBe('api error')
    })

    it('deve extrair data.message', () => {
      expect(getErrorMessage({ data: { message: 'api message' } })).toBe('api message')
    })
  })

  // ── Objetos com reason ─────────────────────────────────────────────────────

  describe('objetos com reason', () => {
    it('deve extrair reason', () => {
      expect(getErrorMessage({ reason: 'timeout' })).toBe('timeout')
    })
  })

  // ── Objetos com statusText (HTTP errors) ───────────────────────────────────

  describe('objetos com statusText (HTTP)', () => {
    it('deve extrair statusText', () => {
      expect(getErrorMessage({ statusText: 'Not Found' })).toBe('Not Found')
    })

    it('deve combinar statusText com status numérico', () => {
      expect(
        getErrorMessage({ statusText: 'Internal Server Error', status: 500 })
      ).toBe('Internal Server Error (500)')
    })

    it('deve ignorar status não-numérico', () => {
      expect(
        getErrorMessage({ statusText: 'Bad Request', status: '400' })
      ).toBe('Bad Request')
    })
  })

  // ── JSON stringify fallback ────────────────────────────────────────────────

  describe('fallback JSON.stringify', () => {
    it('deve fazer stringify de objeto genérico', () => {
      expect(getErrorMessage({ code: 42, detail: 'info' })).toBe(
        '{"code":42,"detail":"info"}'
      )
    })

    it('deve retornar "Unknown error" para objeto vazio', () => {
      // {} stringifica para "{}" que não é "{}" !== "{}" — verificar lógica:
      // stringified !== "{}" é condição, então "{}" é filtrado
      expect(getErrorMessage({})).toBe('Unknown error')
    })
  })

  // ── Tipos primitivos não-string ────────────────────────────────────────────

  describe('outros tipos primitivos', () => {
    it('deve lidar com number', () => {
      // number não é null, não é Error, não é string, não é object
      expect(getErrorMessage(42)).toBe('Unknown error')
    })

    it('deve lidar com boolean', () => {
      expect(getErrorMessage(true)).toBe('Unknown error')
    })

    it('deve lidar com symbol', () => {
      expect(getErrorMessage(Symbol('test'))).toBe('Unknown error')
    })
  })

  // ── Prioridade de propriedades ─────────────────────────────────────────────

  describe('prioridade de extração', () => {
    it('message tem prioridade sobre error', () => {
      expect(
        getErrorMessage({ message: 'from message', error: 'from error' })
      ).toBe('from message')
    })

    it('message tem prioridade sobre reason', () => {
      expect(
        getErrorMessage({ message: 'from message', reason: 'from reason' })
      ).toBe('from message')
    })

    it('error tem prioridade sobre data', () => {
      expect(
        getErrorMessage({ error: 'from error', data: { error: 'from data' } })
      ).toBe('from error')
    })

    it('responseBody tem prioridade sobre error string direto', () => {
      // responseBody vem antes de error no código
      expect(
        getErrorMessage({
          responseBody: { error: 'from responseBody' },
          error: 'from error',
        })
      ).toBe('from responseBody')
    })
  })
})

// ─── getErrorMessageAsync ────────────────────────────────────────────────────

describe('getErrorMessageAsync', () => {
  it('deve lidar com Promise que resolve com erro', async () => {
    const promise = Promise.resolve({ message: 'resolved error' })
    expect(await getErrorMessageAsync(promise)).toBe('resolved error')
  })

  it('deve lidar com Promise que rejeita', async () => {
    const promise = Promise.reject(new Error('rejected'))
    expect(await getErrorMessageAsync(promise)).toBe('rejected')
  })

  it('deve lidar com thenable que resolve', async () => {
    const thenable = {
      then: (resolve: (v: unknown) => void) => resolve({ message: 'thenable resolved' }),
    }
    expect(await getErrorMessageAsync(thenable)).toBe('thenable resolved')
  })

  it('deve lidar com thenable que rejeita', async () => {
    const thenable = {
      then: (_resolve: (v: unknown) => void, reject: (v: unknown) => void) =>
        reject(new Error('thenable rejected')),
    }
    expect(await getErrorMessageAsync(thenable)).toBe('thenable rejected')
  })

  it('deve fazer fallback para getErrorMessage para não-Promises', async () => {
    expect(await getErrorMessageAsync(new Error('sync error'))).toBe('sync error')
    expect(await getErrorMessageAsync('string error')).toBe('string error')
    expect(await getErrorMessageAsync(null)).toBe('Unknown error')
  })

  it('deve lidar com Promise que resolve com null', async () => {
    const promise = Promise.resolve(null)
    expect(await getErrorMessageAsync(promise)).toBe('Unknown error')
  })

  it('deve lidar com Promise que resolve com string', async () => {
    const promise = Promise.resolve('error string')
    expect(await getErrorMessageAsync(promise)).toBe('error string')
  })
})
