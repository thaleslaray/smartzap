import { describe, it, expect } from 'vitest'
import type { ManualDraftTemplate } from '@/services/manualDraftsService'
import {
  validateManualDraft,
  computeDraftSendStates,
  canSendDraft,
  getDraftBlockReason,
} from './draft-validation'

// =============================================================================
// Helpers
// =============================================================================

function makeDraft(overrides: Partial<ManualDraftTemplate> = {}): ManualDraftTemplate {
  return {
    id: 'draft-1',
    name: 'meu_template',
    language: 'pt_BR',
    category: 'UTILITY',
    status: 'DRAFT',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Cria um spec mínimo válido para o CreateTemplateSchema.
 * Precisa de name, body (ou content) e category válidos.
 */
function makeValidSpec(overrides: Record<string, unknown> = {}) {
  return {
    name: 'meu_template',
    category: 'UTILITY',
    language: 'pt_BR',
    body: { text: 'Olá, seu pedido {{1}} foi confirmado.' },
    ...overrides,
  }
}

// =============================================================================
// validateManualDraft
// =============================================================================

describe('validateManualDraft', () => {
  it('retorna canSend=false quando spec é undefined', () => {
    const draft = makeDraft({ spec: undefined })
    const result = validateManualDraft(draft)
    expect(result.canSend).toBe(false)
    expect(result.reason).toContain('incompleto')
  })

  it('retorna canSend=false quando spec é null', () => {
    const draft = makeDraft({ spec: null })
    const result = validateManualDraft(draft)
    expect(result.canSend).toBe(false)
    expect(result.reason).toContain('incompleto')
  })

  it('retorna canSend=true para spec válido', () => {
    const draft = makeDraft({ spec: makeValidSpec() })
    const result = validateManualDraft(draft)
    expect(result.canSend).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('retorna canSend=false para spec com nome inválido (maiúsculas)', () => {
    const draft = makeDraft({
      spec: makeValidSpec({ name: 'Template_Invalido' }),
    })
    const result = validateManualDraft(draft)
    expect(result.canSend).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('retorna canSend=true para spec sem body/content (schema permite ambos opcionais)', () => {
    const draft = makeDraft({
      spec: { name: 'ok_name', category: 'UTILITY', language: 'pt_BR' },
    })
    const result = validateManualDraft(draft)
    // body e content são ambos opcionais no CreateTemplateSchema
    expect(result.canSend).toBe(true)
  })

  it('retorna canSend=false para spec com body vazio', () => {
    const draft = makeDraft({
      spec: makeValidSpec({ body: { text: '' } }),
    })
    const result = validateManualDraft(draft)
    expect(result.canSend).toBe(false)
  })

  it('retorna canSend=false para spec com nome vazio', () => {
    const draft = makeDraft({
      spec: makeValidSpec({ name: '' }),
    })
    const result = validateManualDraft(draft)
    expect(result.canSend).toBe(false)
  })

  it('retorna canSend=false para spec com categoria inválida', () => {
    const draft = makeDraft({
      spec: makeValidSpec({ category: 'INVALIDA' }),
    })
    const result = validateManualDraft(draft)
    expect(result.canSend).toBe(false)
  })

  it('lida com draft undefined/null graciosamente', () => {
    const result = validateManualDraft(null as unknown as ManualDraftTemplate)
    expect(result.canSend).toBe(false)
    expect(result.reason).toContain('incompleto')
  })
})

// =============================================================================
// computeDraftSendStates
// =============================================================================

describe('computeDraftSendStates', () => {
  it('retorna mapa vazio para lista vazia', () => {
    const result = computeDraftSendStates([])
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('computa estados para múltiplos drafts', () => {
    const drafts = [
      makeDraft({ id: 'd1', spec: makeValidSpec() }),
      makeDraft({ id: 'd2', spec: undefined }),
      makeDraft({ id: 'd3', spec: makeValidSpec({ name: 'INVALIDO' }) }),
    ]
    const result = computeDraftSendStates(drafts)

    expect(Object.keys(result)).toHaveLength(3)
    expect(result['d1'].canSend).toBe(true)
    expect(result['d2'].canSend).toBe(false)
    expect(result['d3'].canSend).toBe(false)
  })

  it('mapeia pelo id do draft', () => {
    const drafts = [makeDraft({ id: 'abc', spec: makeValidSpec() })]
    const result = computeDraftSendStates(drafts)
    expect(result['abc']).toBeDefined()
    expect(result['abc'].canSend).toBe(true)
  })
})

// =============================================================================
// canSendDraft
// =============================================================================

describe('canSendDraft', () => {
  it('retorna true quando o draft pode ser enviado', () => {
    const states = { 'd1': { canSend: true } }
    expect(canSendDraft(states, 'd1')).toBe(true)
  })

  it('retorna false quando o draft não pode ser enviado', () => {
    const states = { 'd1': { canSend: false, reason: 'erro' } }
    expect(canSendDraft(states, 'd1')).toBe(false)
  })

  it('retorna false quando o id não existe no mapa', () => {
    const states = { 'd1': { canSend: true } }
    expect(canSendDraft(states, 'd99')).toBe(false)
  })

  it('retorna false para mapa vazio', () => {
    expect(canSendDraft({}, 'qualquer')).toBe(false)
  })
})

// =============================================================================
// getDraftBlockReason
// =============================================================================

describe('getDraftBlockReason', () => {
  it('retorna o motivo quando o draft está bloqueado', () => {
    const states = { 'd1': { canSend: false, reason: 'Nome inválido' } }
    expect(getDraftBlockReason(states, 'd1')).toBe('Nome inválido')
  })

  it('retorna undefined quando o draft pode ser enviado', () => {
    const states = { 'd1': { canSend: true } }
    expect(getDraftBlockReason(states, 'd1')).toBeUndefined()
  })

  it('retorna undefined quando o id não existe no mapa', () => {
    const states = { 'd1': { canSend: false, reason: 'erro' } }
    expect(getDraftBlockReason(states, 'd99')).toBeUndefined()
  })

  it('retorna undefined para mapa vazio', () => {
    expect(getDraftBlockReason({}, 'qualquer')).toBeUndefined()
  })
})
