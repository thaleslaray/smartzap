import { describe, it, expect } from 'vitest'
import {
  GeneratedTemplateSchema,
  IssueSchema,
  JudgmentSchema,
  JudgedTemplateSchema,
} from './template-schemas'

// =============================================================================
// GeneratedTemplateSchema
// =============================================================================

describe('GeneratedTemplateSchema', () => {
  const validTemplate = {
    name: 'confirmacao_agendamento',
    header: 'Confirmacao de Agendamento',
    body: 'Ola {{1}}, seu agendamento foi confirmado para {{2}}.',
    footer: 'SmartZap - Automacao',
    button: 'Confirmar',
  }

  it('deve aceitar template valido com todos os campos', () => {
    const result = GeneratedTemplateSchema.safeParse(validTemplate)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validTemplate)
    }
  })

  it('deve aceitar template com header null', () => {
    const template = { ...validTemplate, header: null }
    const result = GeneratedTemplateSchema.safeParse(template)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.header).toBeNull()
    }
  })

  it('deve rejeitar template sem name', () => {
    const { name: _, ...template } = validTemplate
    const result = GeneratedTemplateSchema.safeParse(template)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar template sem body', () => {
    const { body: _, ...template } = validTemplate
    const result = GeneratedTemplateSchema.safeParse(template)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar template sem footer', () => {
    const { footer: _, ...template } = validTemplate
    const result = GeneratedTemplateSchema.safeParse(template)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar template sem button', () => {
    const { button: _, ...template } = validTemplate
    const result = GeneratedTemplateSchema.safeParse(template)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar template com header undefined (nao e nullable)', () => {
    const { header: _, ...template } = validTemplate
    const result = GeneratedTemplateSchema.safeParse(template)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar template com name numerico', () => {
    const template = { ...validTemplate, name: 123 }
    const result = GeneratedTemplateSchema.safeParse(template)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar template com body numerico', () => {
    const template = { ...validTemplate, body: 456 }
    const result = GeneratedTemplateSchema.safeParse(template)
    expect(result.success).toBe(false)
  })

  it('deve aceitar template com strings vazias (sem minLength)', () => {
    const template = {
      name: '',
      header: '',
      body: '',
      footer: '',
      button: '',
    }
    const result = GeneratedTemplateSchema.safeParse(template)
    expect(result.success).toBe(true)
  })
})

// =============================================================================
// IssueSchema
// =============================================================================

describe('IssueSchema', () => {
  const validIssue = {
    word: 'gratis',
    reason: 'Palavra "gratis" ativa classificacao MARKETING',
    suggestion: 'sem custo adicional',
  }

  it('deve aceitar issue valida', () => {
    const result = IssueSchema.safeParse(validIssue)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validIssue)
    }
  })

  it('deve rejeitar issue sem word', () => {
    const { word: _, ...issue } = validIssue
    const result = IssueSchema.safeParse(issue)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar issue sem reason', () => {
    const { reason: _, ...issue } = validIssue
    const result = IssueSchema.safeParse(issue)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar issue sem suggestion', () => {
    const { suggestion: _, ...issue } = validIssue
    const result = IssueSchema.safeParse(issue)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar objeto vazio', () => {
    const result = IssueSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('deve rejeitar issue com campos numericos', () => {
    const result = IssueSchema.safeParse({ word: 1, reason: 2, suggestion: 3 })
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// JudgmentSchema
// =============================================================================

describe('JudgmentSchema', () => {
  const validJudgment = {
    approved: true,
    predictedCategory: 'UTILITY' as const,
    confidence: 0.95,
    issues: [],
  }

  it('deve aceitar julgamento valido aprovado sem issues', () => {
    const result = JudgmentSchema.safeParse(validJudgment)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.approved).toBe(true)
      expect(result.data.predictedCategory).toBe('UTILITY')
      expect(result.data.confidence).toBe(0.95)
      expect(result.data.issues).toEqual([])
    }
  })

  it('deve aceitar julgamento reprovado com issues', () => {
    const judgment = {
      approved: false,
      predictedCategory: 'MARKETING' as const,
      confidence: 0.8,
      issues: [
        {
          word: 'desconto',
          reason: 'Palavra promocional',
          suggestion: 'valor especial',
        },
      ],
      fixedBody: 'Corpo corrigido sem palavras de marketing',
    }
    const result = JudgmentSchema.safeParse(judgment)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.approved).toBe(false)
      expect(result.data.issues).toHaveLength(1)
      expect(result.data.fixedBody).toBe('Corpo corrigido sem palavras de marketing')
    }
  })

  it('deve aceitar fixedHeader como null', () => {
    const judgment = { ...validJudgment, fixedHeader: null }
    const result = JudgmentSchema.safeParse(judgment)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fixedHeader).toBeNull()
    }
  })

  it('deve aceitar fixedHeader como string', () => {
    const judgment = { ...validJudgment, fixedHeader: 'Header corrigido' }
    const result = JudgmentSchema.safeParse(judgment)
    expect(result.success).toBe(true)
  })

  it('deve aceitar sem fixedBody e fixedHeader (campos opcionais)', () => {
    const result = JudgmentSchema.safeParse(validJudgment)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fixedBody).toBeUndefined()
      expect(result.data.fixedHeader).toBeUndefined()
    }
  })

  describe('campo predictedCategory', () => {
    it('deve aceitar UTILITY', () => {
      const judgment = { ...validJudgment, predictedCategory: 'UTILITY' }
      const result = JudgmentSchema.safeParse(judgment)
      expect(result.success).toBe(true)
    })

    it('deve aceitar MARKETING', () => {
      const judgment = { ...validJudgment, predictedCategory: 'MARKETING' }
      const result = JudgmentSchema.safeParse(judgment)
      expect(result.success).toBe(true)
    })

    it('deve rejeitar AUTHENTICATION', () => {
      const judgment = { ...validJudgment, predictedCategory: 'AUTHENTICATION' }
      const result = JudgmentSchema.safeParse(judgment)
      expect(result.success).toBe(false)
    })

    it('deve rejeitar categoria vazia', () => {
      const judgment = { ...validJudgment, predictedCategory: '' }
      const result = JudgmentSchema.safeParse(judgment)
      expect(result.success).toBe(false)
    })

    it('deve rejeitar categoria em lowercase', () => {
      const judgment = { ...validJudgment, predictedCategory: 'utility' }
      const result = JudgmentSchema.safeParse(judgment)
      expect(result.success).toBe(false)
    })
  })

  describe('campo confidence (0-1)', () => {
    it('deve aceitar confidence 0 (minimo)', () => {
      const judgment = { ...validJudgment, confidence: 0 }
      const result = JudgmentSchema.safeParse(judgment)
      expect(result.success).toBe(true)
    })

    it('deve aceitar confidence 1 (maximo)', () => {
      const judgment = { ...validJudgment, confidence: 1 }
      const result = JudgmentSchema.safeParse(judgment)
      expect(result.success).toBe(true)
    })

    it('deve aceitar confidence 0.5 (meio)', () => {
      const judgment = { ...validJudgment, confidence: 0.5 }
      const result = JudgmentSchema.safeParse(judgment)
      expect(result.success).toBe(true)
    })

    it('deve rejeitar confidence negativo', () => {
      const judgment = { ...validJudgment, confidence: -0.1 }
      const result = JudgmentSchema.safeParse(judgment)
      expect(result.success).toBe(false)
    })

    it('deve rejeitar confidence acima de 1', () => {
      const judgment = { ...validJudgment, confidence: 1.1 }
      const result = JudgmentSchema.safeParse(judgment)
      expect(result.success).toBe(false)
    })

    it('deve rejeitar confidence como string', () => {
      const judgment = { ...validJudgment, confidence: '0.9' }
      const result = JudgmentSchema.safeParse(judgment)
      expect(result.success).toBe(false)
    })
  })

  describe('campo issues', () => {
    it('deve aceitar array vazio de issues', () => {
      const result = JudgmentSchema.safeParse(validJudgment)
      expect(result.success).toBe(true)
    })

    it('deve aceitar multiplas issues', () => {
      const judgment = {
        ...validJudgment,
        issues: [
          { word: 'gratis', reason: 'Promocional', suggestion: 'sem custos' },
          { word: 'oferta', reason: 'Promocional', suggestion: 'oportunidade' },
          { word: 'desconto', reason: 'Promocional', suggestion: 'condicao especial' },
        ],
      }
      const result = JudgmentSchema.safeParse(judgment)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.issues).toHaveLength(3)
      }
    })

    it('deve rejeitar issue invalida dentro do array', () => {
      const judgment = {
        ...validJudgment,
        issues: [{ word: 'gratis' }], // falta reason e suggestion
      }
      const result = JudgmentSchema.safeParse(judgment)
      expect(result.success).toBe(false)
    })
  })

  it('deve rejeitar julgamento sem approved', () => {
    const { approved: _, ...judgment } = validJudgment
    const result = JudgmentSchema.safeParse(judgment)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar julgamento sem predictedCategory', () => {
    const { predictedCategory: _, ...judgment } = validJudgment
    const result = JudgmentSchema.safeParse(judgment)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar julgamento sem confidence', () => {
    const { confidence: _, ...judgment } = validJudgment
    const result = JudgmentSchema.safeParse(judgment)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar julgamento sem issues', () => {
    const { issues: _, ...judgment } = validJudgment
    const result = JudgmentSchema.safeParse(judgment)
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// JudgedTemplateSchema
// =============================================================================

describe('JudgedTemplateSchema', () => {
  const validJudgedTemplate = {
    name: 'confirmacao_agendamento',
    header: 'Confirmacao',
    body: 'Ola {{1}}, seu agendamento foi confirmado.',
    footer: 'SmartZap',
    button: 'OK',
    judgment: {
      approved: true,
      predictedCategory: 'UTILITY' as const,
      confidence: 0.92,
      issues: [],
    },
    wasFixed: false,
  }

  it('deve aceitar template julgado valido', () => {
    const result = JudgedTemplateSchema.safeParse(validJudgedTemplate)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('confirmacao_agendamento')
      expect(result.data.judgment.approved).toBe(true)
      expect(result.data.wasFixed).toBe(false)
    }
  })

  it('deve usar default false para wasFixed quando omitido', () => {
    const { wasFixed: _, ...template } = validJudgedTemplate
    const result = JudgedTemplateSchema.safeParse(template)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.wasFixed).toBe(false)
    }
  })

  it('deve aceitar wasFixed como true', () => {
    const template = { ...validJudgedTemplate, wasFixed: true }
    const result = JudgedTemplateSchema.safeParse(template)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.wasFixed).toBe(true)
    }
  })

  it('deve conter todos os campos do GeneratedTemplateSchema', () => {
    const result = JudgedTemplateSchema.safeParse(validJudgedTemplate)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveProperty('name')
      expect(result.data).toHaveProperty('header')
      expect(result.data).toHaveProperty('body')
      expect(result.data).toHaveProperty('footer')
      expect(result.data).toHaveProperty('button')
    }
  })

  it('deve rejeitar template sem judgment', () => {
    const { judgment: _, ...template } = validJudgedTemplate
    const result = JudgedTemplateSchema.safeParse(template)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar template com judgment invalido', () => {
    const template = {
      ...validJudgedTemplate,
      judgment: { approved: true }, // faltam campos obrigatorios
    }
    const result = JudgedTemplateSchema.safeParse(template)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar quando falta campo do GeneratedTemplate (ex: body)', () => {
    const { body: _, ...template } = validJudgedTemplate
    const result = JudgedTemplateSchema.safeParse(template)
    expect(result.success).toBe(false)
  })

  it('deve aceitar template julgado com issues e correcoes', () => {
    const template = {
      ...validJudgedTemplate,
      wasFixed: true,
      judgment: {
        approved: false,
        predictedCategory: 'MARKETING' as const,
        confidence: 0.75,
        issues: [
          {
            word: 'promocao',
            reason: 'Termo promocional',
            suggestion: 'novidade',
          },
        ],
        fixedBody: 'Body sem termos de marketing',
        fixedHeader: null,
      },
    }
    const result = JudgedTemplateSchema.safeParse(template)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.wasFixed).toBe(true)
      expect(result.data.judgment.approved).toBe(false)
      expect(result.data.judgment.issues).toHaveLength(1)
      expect(result.data.judgment.fixedBody).toBe('Body sem termos de marketing')
      expect(result.data.judgment.fixedHeader).toBeNull()
    }
  })
})
