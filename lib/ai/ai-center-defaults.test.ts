import { describe, it, expect } from 'vitest'
import {
  toGatewayModelId,
  fromGatewayModelId,
  DEFAULT_AI_ROUTES,
  DEFAULT_AI_FALLBACK,
  DEFAULT_AI_GATEWAY,
  DEFAULT_AI_PROMPTS,
} from './ai-center-defaults'

// =============================================================================
// toGatewayModelId
// =============================================================================

describe('toGatewayModelId', () => {
  it('deve combinar provider Google com modelId', () => {
    expect(toGatewayModelId('google', 'gemini-2.5-flash')).toBe('google/gemini-2.5-flash')
  })

  it('deve combinar provider OpenAI com modelId', () => {
    expect(toGatewayModelId('openai', 'gpt-5-mini')).toBe('openai/gpt-5-mini')
  })

  it('deve combinar provider Anthropic com modelId', () => {
    expect(toGatewayModelId('anthropic', 'claude-sonnet-4-5')).toBe('anthropic/claude-sonnet-4-5')
  })

  it('deve funcionar com modelId contendo caracteres variados', () => {
    expect(toGatewayModelId('google', 'gemini-3-flash-preview')).toBe('google/gemini-3-flash-preview')
  })

  it('deve funcionar com modelId vazio', () => {
    expect(toGatewayModelId('google', '')).toBe('google/')
  })
})

// =============================================================================
// fromGatewayModelId
// =============================================================================

describe('fromGatewayModelId', () => {
  describe('entradas validas', () => {
    it('deve parsear modelo Google corretamente', () => {
      const result = fromGatewayModelId('google/gemini-2.5-flash')
      expect(result).toEqual({ provider: 'google', modelId: 'gemini-2.5-flash' })
    })

    it('deve parsear modelo OpenAI corretamente', () => {
      const result = fromGatewayModelId('openai/gpt-5-mini')
      expect(result).toEqual({ provider: 'openai', modelId: 'gpt-5-mini' })
    })

    it('deve parsear modelo Anthropic corretamente', () => {
      const result = fromGatewayModelId('anthropic/claude-sonnet-4-5')
      expect(result).toEqual({ provider: 'anthropic', modelId: 'claude-sonnet-4-5' })
    })
  })

  describe('entradas invalidas', () => {
    it('deve retornar null para string sem barra', () => {
      expect(fromGatewayModelId('google-gemini-2.5-flash')).toBeNull()
    })

    it('deve retornar null para string vazia', () => {
      expect(fromGatewayModelId('')).toBeNull()
    })

    it('deve retornar null para barras extras (3 partes)', () => {
      expect(fromGatewayModelId('google/gemini/2.5-flash')).toBeNull()
    })

    it('deve retornar null para provider desconhecido', () => {
      expect(fromGatewayModelId('mistral/mistral-large')).toBeNull()
    })

    it('deve retornar null para provider "meta"', () => {
      expect(fromGatewayModelId('meta/llama-3')).toBeNull()
    })

    it('deve retornar null para apenas uma barra sem provider', () => {
      expect(fromGatewayModelId('/gemini-2.5-flash')).toBeNull()
    })

    it('deve retornar null para string que e so uma barra', () => {
      expect(fromGatewayModelId('/')).toBeNull()
    })
  })

  describe('roundtrip com toGatewayModelId', () => {
    it('deve fazer roundtrip com Google', () => {
      const gatewayId = toGatewayModelId('google', 'gemini-2.5-flash')
      const parsed = fromGatewayModelId(gatewayId)
      expect(parsed).toEqual({ provider: 'google', modelId: 'gemini-2.5-flash' })
    })

    it('deve fazer roundtrip com OpenAI', () => {
      const gatewayId = toGatewayModelId('openai', 'gpt-5-mini')
      const parsed = fromGatewayModelId(gatewayId)
      expect(parsed).toEqual({ provider: 'openai', modelId: 'gpt-5-mini' })
    })

    it('deve fazer roundtrip com Anthropic', () => {
      const gatewayId = toGatewayModelId('anthropic', 'claude-sonnet-4-5')
      const parsed = fromGatewayModelId(gatewayId)
      expect(parsed).toEqual({ provider: 'anthropic', modelId: 'claude-sonnet-4-5' })
    })
  })
})

// =============================================================================
// Constantes DEFAULT
// =============================================================================

describe('DEFAULT_AI_ROUTES', () => {
  it('deve ter generateUtilityTemplates habilitado', () => {
    expect(DEFAULT_AI_ROUTES.generateUtilityTemplates).toBe(true)
  })

  it('deve ter generateFlowForm habilitado', () => {
    expect(DEFAULT_AI_ROUTES.generateFlowForm).toBe(true)
  })

  it('deve ter exatamente as chaves esperadas', () => {
    expect(Object.keys(DEFAULT_AI_ROUTES).sort()).toEqual([
      'generateFlowForm',
      'generateUtilityTemplates',
    ])
  })
})

describe('DEFAULT_AI_FALLBACK', () => {
  it('deve estar desabilitado por padrao', () => {
    expect(DEFAULT_AI_FALLBACK.enabled).toBe(false)
  })

  it('deve ter ordem google, openai, anthropic', () => {
    expect(DEFAULT_AI_FALLBACK.order).toEqual(['google', 'openai', 'anthropic'])
  })

  it('deve ter modelo definido para cada provider da ordem', () => {
    for (const provider of DEFAULT_AI_FALLBACK.order) {
      expect(DEFAULT_AI_FALLBACK.models[provider]).toBeDefined()
      expect(typeof DEFAULT_AI_FALLBACK.models[provider]).toBe('string')
      expect(DEFAULT_AI_FALLBACK.models[provider].length).toBeGreaterThan(0)
    }
  })

  it('deve ter modelos para todos os 3 providers', () => {
    expect(Object.keys(DEFAULT_AI_FALLBACK.models).sort()).toEqual([
      'anthropic',
      'google',
      'openai',
    ])
  })
})

describe('DEFAULT_AI_GATEWAY', () => {
  it('deve estar desabilitado por padrao', () => {
    expect(DEFAULT_AI_GATEWAY.enabled).toBe(false)
  })

  it('deve ter apiKey vazia por padrao', () => {
    expect(DEFAULT_AI_GATEWAY.apiKey).toBe('')
  })

  it('deve ter useBYOK habilitado', () => {
    expect(DEFAULT_AI_GATEWAY.useBYOK).toBe(true)
  })

  it('deve ter fallbackModels como array nao vazio', () => {
    expect(Array.isArray(DEFAULT_AI_GATEWAY.fallbackModels)).toBe(true)
    expect(DEFAULT_AI_GATEWAY.fallbackModels.length).toBeGreaterThan(0)
  })

  it('deve ter fallbackModels no formato provider/model', () => {
    for (const model of DEFAULT_AI_GATEWAY.fallbackModels) {
      const parsed = fromGatewayModelId(model)
      expect(parsed).not.toBeNull()
    }
  })
})

describe('DEFAULT_AI_PROMPTS', () => {
  it('deve ter todas as 6 chaves de prompt', () => {
    expect(Object.keys(DEFAULT_AI_PROMPTS).sort()).toEqual([
      'flowFormTemplate',
      'strategyBypass',
      'strategyMarketing',
      'strategyUtility',
      'utilityGenerationTemplate',
      'utilityJudgeTemplate',
    ])
  })

  it('deve ter strings nao vazias para todos os prompts', () => {
    for (const [key, value] of Object.entries(DEFAULT_AI_PROMPTS)) {
      expect(typeof value).toBe('string')
      expect(value.length, `${key} deve ser nao vazio`).toBeGreaterThan(0)
    }
  })
})
