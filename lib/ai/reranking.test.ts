import { describe, it, expect } from 'vitest'
import {
  RERANK_PROVIDERS,
  validateRerankConfig,
  isRerankEnabled,
} from './reranking'
import type { RerankConfig } from './reranking'

// =============================================================================
// RERANK_PROVIDERS
// =============================================================================

describe('RERANK_PROVIDERS', () => {
  it('deve conter exatamente 2 providers', () => {
    expect(RERANK_PROVIDERS).toHaveLength(2)
  })

  it('deve ter Cohere como primeiro provider', () => {
    expect(RERANK_PROVIDERS[0].id).toBe('cohere')
    expect(RERANK_PROVIDERS[0].name).toBe('Cohere')
  })

  it('deve ter Together como segundo provider', () => {
    expect(RERANK_PROVIDERS[1].id).toBe('together')
    expect(RERANK_PROVIDERS[1].name).toBe('Together.ai')
  })

  it('deve ter requiresPackage definido para cada provider', () => {
    for (const provider of RERANK_PROVIDERS) {
      expect(provider.requiresPackage).toBeTruthy()
      expect(typeof provider.requiresPackage).toBe('string')
    }
  })

  it('Cohere deve ter 3 modelos', () => {
    const cohere = RERANK_PROVIDERS.find((p) => p.id === 'cohere')!
    expect(cohere.models).toHaveLength(3)
  })

  it('Together deve ter 1 modelo', () => {
    const together = RERANK_PROVIDERS.find((p) => p.id === 'together')!
    expect(together.models).toHaveLength(1)
  })

  it('todos os modelos devem ter id, name, description e pricePerMillion', () => {
    for (const provider of RERANK_PROVIDERS) {
      for (const model of provider.models) {
        expect(model.id).toBeTruthy()
        expect(model.name).toBeTruthy()
        expect(model.description).toBeTruthy()
        expect(typeof model.pricePerMillion).toBe('number')
        expect(model.pricePerMillion).toBeGreaterThan(0)
      }
    }
  })
})

// =============================================================================
// validateRerankConfig
// =============================================================================

describe('validateRerankConfig', () => {
  const validConfig: Partial<RerankConfig> = {
    provider: 'cohere',
    model: 'rerank-v3.5',
    apiKey: 'test-key-123',
  }

  describe('configuracoes validas', () => {
    it('deve retornar null para config valida do Cohere', () => {
      expect(validateRerankConfig(validConfig)).toBeNull()
    })

    it('deve retornar null para config valida do Together', () => {
      const config: Partial<RerankConfig> = {
        provider: 'together',
        model: 'Salesforce/Llama-Rank-v1',
        apiKey: 'test-key-456',
      }
      expect(validateRerankConfig(config)).toBeNull()
    })

    it('deve retornar null para todos os modelos do Cohere', () => {
      const cohereModels = ['rerank-v3.5', 'rerank-english-v3.0', 'rerank-multilingual-v3.0']
      for (const model of cohereModels) {
        const config: Partial<RerankConfig> = {
          provider: 'cohere',
          model,
          apiKey: 'key',
        }
        expect(validateRerankConfig(config)).toBeNull()
      }
    })
  })

  describe('campo provider ausente ou invalido', () => {
    it('deve retornar erro quando provider nao esta definido', () => {
      const config: Partial<RerankConfig> = {
        model: 'rerank-v3.5',
        apiKey: 'key',
      }
      expect(validateRerankConfig(config)).toBe('Provider de reranking não configurado')
    })

    it('deve retornar erro para provider desconhecido', () => {
      const config = {
        provider: 'unknown' as RerankConfig['provider'],
        model: 'some-model',
        apiKey: 'key',
      }
      expect(validateRerankConfig(config)).toBe('Provider de reranking "unknown" não suportado')
    })
  })

  describe('campo model ausente ou invalido', () => {
    it('deve retornar erro quando model nao esta definido', () => {
      const config: Partial<RerankConfig> = {
        provider: 'cohere',
        apiKey: 'key',
      }
      expect(validateRerankConfig(config)).toBe('Modelo de reranking não configurado')
    })

    it('deve retornar erro para modelo inexistente no provider', () => {
      const config: Partial<RerankConfig> = {
        provider: 'cohere',
        model: 'modelo-que-nao-existe',
        apiKey: 'key',
      }
      expect(validateRerankConfig(config)).toBe(
        'Modelo "modelo-que-nao-existe" não encontrado para provider "cohere"'
      )
    })

    it('deve retornar erro para modelo do Together usado com Cohere', () => {
      const config: Partial<RerankConfig> = {
        provider: 'cohere',
        model: 'Salesforce/Llama-Rank-v1',
        apiKey: 'key',
      }
      expect(validateRerankConfig(config)).toBe(
        'Modelo "Salesforce/Llama-Rank-v1" não encontrado para provider "cohere"'
      )
    })
  })

  describe('campo apiKey ausente', () => {
    it('deve retornar erro quando apiKey nao esta definida', () => {
      const config: Partial<RerankConfig> = {
        provider: 'cohere',
        model: 'rerank-v3.5',
      }
      expect(validateRerankConfig(config)).toBe('API key de reranking não configurada')
    })

    it('deve retornar erro quando apiKey e string vazia', () => {
      const config: Partial<RerankConfig> = {
        provider: 'cohere',
        model: 'rerank-v3.5',
        apiKey: '',
      }
      expect(validateRerankConfig(config)).toBe('API key de reranking não configurada')
    })
  })

  describe('config completamente vazia', () => {
    it('deve retornar erro de provider para config vazia', () => {
      expect(validateRerankConfig({})).toBe('Provider de reranking não configurado')
    })
  })

  describe('ordem de validacao (prioridade dos erros)', () => {
    it('deve verificar provider antes de model', () => {
      const config: Partial<RerankConfig> = { apiKey: 'key' }
      expect(validateRerankConfig(config)).toBe('Provider de reranking não configurado')
    })

    it('deve verificar model antes de apiKey', () => {
      const config: Partial<RerankConfig> = { provider: 'cohere' }
      expect(validateRerankConfig(config)).toBe('Modelo de reranking não configurado')
    })

    it('deve verificar apiKey antes da validacao de provider/modelo', () => {
      const config: Partial<RerankConfig> = { provider: 'cohere', model: 'rerank-v3.5' }
      expect(validateRerankConfig(config)).toBe('API key de reranking não configurada')
    })
  })
})

// =============================================================================
// isRerankEnabled
// =============================================================================

describe('isRerankEnabled', () => {
  it('deve retornar true quando todos os campos estao preenchidos', () => {
    expect(
      isRerankEnabled({
        rerank_enabled: true,
        rerank_provider: 'cohere',
        rerank_model: 'rerank-v3.5',
      })
    ).toBe(true)
  })

  it('deve retornar false quando rerank_enabled e false', () => {
    expect(
      isRerankEnabled({
        rerank_enabled: false,
        rerank_provider: 'cohere',
        rerank_model: 'rerank-v3.5',
      })
    ).toBe(false)
  })

  it('deve retornar false quando rerank_enabled e null', () => {
    expect(
      isRerankEnabled({
        rerank_enabled: null,
        rerank_provider: 'cohere',
        rerank_model: 'rerank-v3.5',
      })
    ).toBe(false)
  })

  it('deve retornar false quando rerank_enabled e undefined', () => {
    expect(
      isRerankEnabled({
        rerank_provider: 'cohere',
        rerank_model: 'rerank-v3.5',
      })
    ).toBe(false)
  })

  it('deve retornar false quando rerank_provider e null', () => {
    expect(
      isRerankEnabled({
        rerank_enabled: true,
        rerank_provider: null,
        rerank_model: 'rerank-v3.5',
      })
    ).toBe(false)
  })

  it('deve retornar false quando rerank_provider e undefined', () => {
    expect(
      isRerankEnabled({
        rerank_enabled: true,
        rerank_model: 'rerank-v3.5',
      })
    ).toBe(false)
  })

  it('deve retornar false quando rerank_model e null', () => {
    expect(
      isRerankEnabled({
        rerank_enabled: true,
        rerank_provider: 'cohere',
        rerank_model: null,
      })
    ).toBe(false)
  })

  it('deve retornar false quando rerank_model e undefined', () => {
    expect(
      isRerankEnabled({
        rerank_enabled: true,
        rerank_provider: 'cohere',
      })
    ).toBe(false)
  })

  it('deve retornar false quando todos os campos sao null', () => {
    expect(
      isRerankEnabled({
        rerank_enabled: null,
        rerank_provider: null,
        rerank_model: null,
      })
    ).toBe(false)
  })

  it('deve retornar false para objeto vazio', () => {
    expect(isRerankEnabled({})).toBe(false)
  })

  it('deve retornar false quando rerank_provider e string vazia', () => {
    expect(
      isRerankEnabled({
        rerank_enabled: true,
        rerank_provider: '',
        rerank_model: 'rerank-v3.5',
      })
    ).toBe(false)
  })
})
