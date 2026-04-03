import { describe, it, expect } from 'vitest'
import type { Template, GeneratedTemplate } from '@/types/template.types'
import {
  toggleTemplateSelection,
  selectAllTemplates,
  selectAllTemplatesByName,
  selectAllGeneratedTemplates,
  clearSelection,
  pruneSelection,
  removeFromSelection,
  areAllSelected,
  getSelectedAsArray,
} from './selection'

// =============================================================================
// Helpers
// =============================================================================

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'tpl-1',
    name: 'template_um',
    category: 'MARKETING',
    language: 'pt_BR',
    status: 'APPROVED',
    content: 'Conteúdo',
    preview: 'Preview',
    lastUpdated: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeGenerated(overrides: Partial<GeneratedTemplate> = {}): GeneratedTemplate {
  return {
    id: 'gen-1',
    name: 'generated_um',
    category: 'MARKETING',
    content: 'Conteúdo gerado',
    variables: [],
    description: 'Descrição',
    language: 'pt_BR',
    status: 'DRAFT',
    ...overrides,
  }
}

// =============================================================================
// toggleTemplateSelection
// =============================================================================

describe('toggleTemplateSelection', () => {
  it('adiciona id quando não existe no Set', () => {
    const prev = new Set(['a'])
    const result = toggleTemplateSelection(prev, 'b')
    expect(result.has('b')).toBe(true)
    expect(result.size).toBe(2)
  })

  it('remove id quando já existe no Set', () => {
    const prev = new Set(['a', 'b'])
    const result = toggleTemplateSelection(prev, 'b')
    expect(result.has('b')).toBe(false)
    expect(result.size).toBe(1)
  })

  it('não muta o Set original', () => {
    const prev = new Set(['a'])
    toggleTemplateSelection(prev, 'b')
    expect(prev.size).toBe(1)
    expect(prev.has('b')).toBe(false)
  })

  it('funciona com Set vazio', () => {
    const result = toggleTemplateSelection(new Set(), 'x')
    expect(result.size).toBe(1)
    expect(result.has('x')).toBe(true)
  })
})

// =============================================================================
// selectAllTemplates
// =============================================================================

describe('selectAllTemplates', () => {
  const templates = [
    makeTemplate({ id: '1' }),
    makeTemplate({ id: '2' }),
    makeTemplate({ id: '3' }),
  ]

  it('seleciona todos quando nenhum está selecionado', () => {
    const result = selectAllTemplates(templates, new Set())
    expect(result.size).toBe(3)
    expect(result.has('1')).toBe(true)
    expect(result.has('2')).toBe(true)
    expect(result.has('3')).toBe(true)
  })

  it('seleciona todos quando só parte está selecionada', () => {
    const result = selectAllTemplates(templates, new Set(['1']))
    expect(result.size).toBe(3)
  })

  it('limpa seleção quando todos já estão selecionados', () => {
    const result = selectAllTemplates(templates, new Set(['1', '2', '3']))
    expect(result.size).toBe(0)
  })

  it('retorna Set vazio para lista vazia de templates', () => {
    const result = selectAllTemplates([], new Set())
    expect(result.size).toBe(0)
  })
})

// =============================================================================
// selectAllTemplatesByName
// =============================================================================

describe('selectAllTemplatesByName', () => {
  const templates = [
    makeTemplate({ id: '1', name: 'alpha' }),
    makeTemplate({ id: '2', name: 'beta' }),
  ]

  it('seleciona por nome quando nenhum está selecionado', () => {
    const result = selectAllTemplatesByName(templates, new Set())
    expect(result.size).toBe(2)
    expect(result.has('alpha')).toBe(true)
    expect(result.has('beta')).toBe(true)
  })

  it('limpa seleção quando todos estão selecionados (por tamanho)', () => {
    const result = selectAllTemplatesByName(templates, new Set(['alpha', 'beta']))
    expect(result.size).toBe(0)
  })

  it('retorna Set vazio para lista vazia', () => {
    const result = selectAllTemplatesByName([], new Set())
    expect(result.size).toBe(0)
  })
})

// =============================================================================
// selectAllGeneratedTemplates
// =============================================================================

describe('selectAllGeneratedTemplates', () => {
  const generated = [
    makeGenerated({ id: 'g1' }),
    makeGenerated({ id: 'g2' }),
  ]

  it('seleciona todos quando nenhum está selecionado', () => {
    const result = selectAllGeneratedTemplates(generated, new Set())
    expect(result.size).toBe(2)
    expect(result.has('g1')).toBe(true)
  })

  it('limpa seleção quando todos estão selecionados', () => {
    const result = selectAllGeneratedTemplates(generated, new Set(['g1', 'g2']))
    expect(result.size).toBe(0)
  })

  it('retorna Set vazio para lista vazia', () => {
    const result = selectAllGeneratedTemplates([], new Set())
    expect(result.size).toBe(0)
  })
})

// =============================================================================
// clearSelection
// =============================================================================

describe('clearSelection', () => {
  it('retorna Set vazio', () => {
    const result = clearSelection()
    expect(result.size).toBe(0)
    expect(result).toBeInstanceOf(Set)
  })
})

// =============================================================================
// pruneSelection
// =============================================================================

describe('pruneSelection', () => {
  it('remove ids que não estão nos válidos', () => {
    const selected = new Set(['a', 'b', 'c'])
    const valid = new Set(['a', 'c'])
    const result = pruneSelection(selected, valid)
    expect(result.size).toBe(2)
    expect(result.has('b')).toBe(false)
  })

  it('retorna Set vazio quando nenhum é válido', () => {
    const selected = new Set(['x', 'y'])
    const valid = new Set(['a'])
    const result = pruneSelection(selected, valid)
    expect(result.size).toBe(0)
  })

  it('retorna o mesmo Set quando está vazio', () => {
    const selected = new Set<string>()
    const valid = new Set(['a'])
    const result = pruneSelection(selected, valid)
    expect(result).toBe(selected) // mesma referência por otimização
  })

  it('mantém todos quando todos são válidos', () => {
    const selected = new Set(['a', 'b'])
    const valid = new Set(['a', 'b', 'c'])
    const result = pruneSelection(selected, valid)
    expect(result.size).toBe(2)
  })
})

// =============================================================================
// removeFromSelection
// =============================================================================

describe('removeFromSelection', () => {
  it('remove o id do Set', () => {
    const selected = new Set(['a', 'b'])
    const result = removeFromSelection(selected, 'b')
    expect(result.size).toBe(1)
    expect(result.has('b')).toBe(false)
  })

  it('retorna o mesmo Set quando id não existe', () => {
    const selected = new Set(['a'])
    const result = removeFromSelection(selected, 'z')
    expect(result).toBe(selected) // mesma referência
  })

  it('não muta o Set original', () => {
    const selected = new Set(['a', 'b'])
    removeFromSelection(selected, 'a')
    expect(selected.size).toBe(2)
  })
})

// =============================================================================
// areAllSelected
// =============================================================================

describe('areAllSelected', () => {
  it('retorna true quando todos os ids estão selecionados', () => {
    const selected = new Set(['1', '2', '3'])
    expect(areAllSelected(selected, ['1', '2', '3'])).toBe(true)
  })

  it('retorna false quando falta algum id', () => {
    const selected = new Set(['1', '2'])
    expect(areAllSelected(selected, ['1', '2', '3'])).toBe(false)
  })

  it('retorna false quando allIds está vazio', () => {
    const selected = new Set(['1'])
    expect(areAllSelected(selected, [])).toBe(false)
  })

  it('retorna false quando tamanhos diferem mas todos existem no Set', () => {
    // selected tem ids extras que não estão em allIds
    const selected = new Set(['1', '2', '3', '4'])
    expect(areAllSelected(selected, ['1', '2', '3'])).toBe(false)
  })
})

// =============================================================================
// getSelectedAsArray
// =============================================================================

describe('getSelectedAsArray', () => {
  it('converte Set em array', () => {
    const selected = new Set(['a', 'b', 'c'])
    const result = getSelectedAsArray(selected)
    expect(result).toEqual(['a', 'b', 'c'])
    expect(Array.isArray(result)).toBe(true)
  })

  it('retorna array vazio para Set vazio', () => {
    const result = getSelectedAsArray(new Set())
    expect(result).toEqual([])
  })
})
