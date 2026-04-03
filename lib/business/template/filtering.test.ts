import { describe, it, expect } from 'vitest'
import type { Template } from '@/types/template.types'
import type { ManualDraftTemplate } from '@/services/manualDraftsService'
import {
  filterTemplates,
  filterManualDrafts,
  filterByDraftIds,
  filterExcludingIds,
} from './filtering'

// =============================================================================
// Helpers
// =============================================================================

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'tpl-1',
    name: 'boas_vindas',
    category: 'MARKETING',
    language: 'pt_BR',
    status: 'APPROVED',
    content: 'Olá, seja bem-vindo!',
    preview: 'Olá...',
    lastUpdated: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeDraft(overrides: Partial<ManualDraftTemplate> = {}): ManualDraftTemplate {
  return {
    id: 'draft-1',
    name: 'pedido_confirmado',
    language: 'pt_BR',
    category: 'UTILITY',
    status: 'DRAFT',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

// =============================================================================
// filterTemplates
// =============================================================================

describe('filterTemplates', () => {
  const templates: Template[] = [
    makeTemplate({ id: '1', name: 'welcome_message', category: 'MARKETING', status: 'APPROVED', content: 'Bem-vindo ao nosso serviço' }),
    makeTemplate({ id: '2', name: 'order_update', category: 'UTILIDADE', status: 'APPROVED', content: 'Seu pedido foi atualizado' }),
    makeTemplate({ id: '3', name: 'promo_natal', category: 'MARKETING', status: 'DRAFT', content: 'Promoção de natal' }),
    makeTemplate({ id: '4', name: 'auth_code', category: 'AUTENTICACAO', status: 'PENDING', content: 'Seu código é {{1}}' }),
  ]

  it('retorna todos quando os critérios estão vazios', () => {
    const result = filterTemplates(templates, {})
    expect(result).toHaveLength(4)
  })

  it('retorna todos com critérios ALL', () => {
    const result = filterTemplates(templates, { category: 'ALL', status: 'ALL', searchTerm: '' })
    expect(result).toHaveLength(4)
  })

  it('filtra por searchTerm no nome (case-insensitive)', () => {
    const result = filterTemplates(templates, { searchTerm: 'WELCOME' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('filtra por searchTerm no conteúdo', () => {
    const result = filterTemplates(templates, { searchTerm: 'pedido' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('filtra por category', () => {
    const result = filterTemplates(templates, { category: 'MARKETING' })
    expect(result).toHaveLength(2)
    expect(result.map((t) => t.id)).toEqual(['1', '3'])
  })

  it('filtra por status', () => {
    const result = filterTemplates(templates, { status: 'APPROVED' })
    expect(result).toHaveLength(2)
    expect(result.map((t) => t.id)).toEqual(['1', '2'])
  })

  it('combina searchTerm + category + status', () => {
    const result = filterTemplates(templates, {
      searchTerm: 'promo',
      category: 'MARKETING',
      status: 'DRAFT',
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('3')
  })

  it('retorna array vazio quando nenhum template combina', () => {
    const result = filterTemplates(templates, { searchTerm: 'inexistente' })
    expect(result).toHaveLength(0)
  })

  it('retorna array vazio para lista vazia', () => {
    const result = filterTemplates([], { searchTerm: 'qualquer' })
    expect(result).toHaveLength(0)
  })
})

// =============================================================================
// filterManualDrafts
// =============================================================================

describe('filterManualDrafts', () => {
  const drafts: ManualDraftTemplate[] = [
    makeDraft({ id: '1', name: 'pedido_confirmado' }),
    makeDraft({ id: '2', name: 'AVISO_ENTREGA' }),
    makeDraft({ id: '3', name: 'lembrete_pagamento' }),
  ]

  it('retorna todos quando searchTerm é vazio', () => {
    const result = filterManualDrafts(drafts, '')
    expect(result).toHaveLength(3)
  })

  it('filtra por nome case-insensitive', () => {
    const result = filterManualDrafts(drafts, 'PEDIDO')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('busca parcial funciona', () => {
    const result = filterManualDrafts(drafts, 'entrega')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('retorna array vazio quando nenhum draft combina', () => {
    const result = filterManualDrafts(drafts, 'xyz')
    expect(result).toHaveLength(0)
  })

  it('retorna array vazio para lista vazia', () => {
    const result = filterManualDrafts([], 'teste')
    expect(result).toHaveLength(0)
  })
})

// =============================================================================
// filterByDraftIds
// =============================================================================

describe('filterByDraftIds', () => {
  const templates: Template[] = [
    makeTemplate({ id: '1' }),
    makeTemplate({ id: '2' }),
    makeTemplate({ id: '3' }),
  ]

  it('retorna apenas os templates cujo id está no Set', () => {
    const ids = new Set(['1', '3'])
    const result = filterByDraftIds(templates, ids)
    expect(result).toHaveLength(2)
    expect(result.map((t) => t.id)).toEqual(['1', '3'])
  })

  it('retorna array vazio quando nenhum id bate', () => {
    const ids = new Set(['99'])
    const result = filterByDraftIds(templates, ids)
    expect(result).toHaveLength(0)
  })

  it('retorna array vazio para Set vazio', () => {
    const result = filterByDraftIds(templates, new Set())
    expect(result).toHaveLength(0)
  })

  it('retorna array vazio para lista vazia', () => {
    const result = filterByDraftIds([], new Set(['1']))
    expect(result).toHaveLength(0)
  })
})

// =============================================================================
// filterExcludingIds
// =============================================================================

describe('filterExcludingIds', () => {
  const templates: Template[] = [
    makeTemplate({ id: '1' }),
    makeTemplate({ id: '2' }),
    makeTemplate({ id: '3' }),
  ]

  it('exclui templates cujo id está no Set', () => {
    const ids = new Set(['2'])
    const result = filterExcludingIds(templates, ids)
    expect(result).toHaveLength(2)
    expect(result.map((t) => t.id)).toEqual(['1', '3'])
  })

  it('retorna todos quando nenhum id está no Set', () => {
    const ids = new Set(['99'])
    const result = filterExcludingIds(templates, ids)
    expect(result).toHaveLength(3)
  })

  it('retorna todos para Set vazio', () => {
    const result = filterExcludingIds(templates, new Set())
    expect(result).toHaveLength(3)
  })

  it('retorna array vazio quando todos são excluídos', () => {
    const ids = new Set(['1', '2', '3'])
    const result = filterExcludingIds(templates, ids)
    expect(result).toHaveLength(0)
  })
})
