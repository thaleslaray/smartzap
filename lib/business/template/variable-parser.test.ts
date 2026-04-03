import { describe, it, expect } from 'vitest'
import type { Template } from '@/types/template.types'
import {
  VARIABLE_REGEX,
  extractVariablesFromText,
  parseVariableId,
  parseTemplateVariables,
  getTemplateVariableInfo,
  countTemplateVariables,
} from './variable-parser'

// =============================================================================
// Helpers
// =============================================================================

function makeTemplate(components: Template['components'] = []): Template {
  return {
    id: 'tpl-1',
    name: 'teste',
    category: 'MARKETING',
    language: 'pt_BR',
    status: 'APPROVED',
    content: '',
    preview: '',
    lastUpdated: '2024-01-01T00:00:00Z',
    components,
  }
}

// =============================================================================
// VARIABLE_REGEX
// =============================================================================

describe('VARIABLE_REGEX', () => {
  it('captura variáveis posicionais', () => {
    const text = 'Olá {{1}}, seu pedido {{2}}'
    const matches = text.match(new RegExp(VARIABLE_REGEX.source, 'g'))
    expect(matches).toEqual(['{{1}}', '{{2}}'])
  })

  it('captura variáveis nomeadas', () => {
    const text = '{{nome}} comprou {{produto}}'
    const matches = text.match(new RegExp(VARIABLE_REGEX.source, 'g'))
    expect(matches).toEqual(['{{nome}}', '{{produto}}'])
  })

  it('captura variáveis com underscore e números', () => {
    const text = '{{campo_1}} e {{var_2_extra}}'
    const matches = text.match(new RegExp(VARIABLE_REGEX.source, 'g'))
    expect(matches).toEqual(['{{campo_1}}', '{{var_2_extra}}'])
  })

  it('não captura chaves simples', () => {
    const text = 'Valor: {nao_variavel}'
    const matches = text.match(new RegExp(VARIABLE_REGEX.source, 'g'))
    expect(matches).toBeNull()
  })
})

// =============================================================================
// extractVariablesFromText
// =============================================================================

describe('extractVariablesFromText', () => {
  it('extrai variáveis únicas em ordem de aparição', () => {
    const result = extractVariablesFromText('{{nome}}, seu pedido {{pedido}} está pronto!')
    expect(result).toEqual(['nome', 'pedido'])
  })

  it('remove duplicatas mantendo a primeira ocorrência', () => {
    const result = extractVariablesFromText('{{1}} e {{2}} e {{1}} de novo')
    expect(result).toEqual(['1', '2'])
  })

  it('retorna array vazio para texto sem variáveis', () => {
    const result = extractVariablesFromText('Texto sem variáveis')
    expect(result).toEqual([])
  })

  it('retorna array vazio para texto vazio', () => {
    expect(extractVariablesFromText('')).toEqual([])
  })

  it('retorna array vazio para null/undefined', () => {
    expect(extractVariablesFromText(null as unknown as string)).toEqual([])
    expect(extractVariablesFromText(undefined as unknown as string)).toEqual([])
  })

  it('extrai variáveis mistas (posicionais e nomeadas)', () => {
    const result = extractVariablesFromText('{{1}} de {{nome}}')
    expect(result).toEqual(['1', 'nome'])
  })
})

// =============================================================================
// parseVariableId
// =============================================================================

describe('parseVariableId', () => {
  it('identifica variável numérica', () => {
    const result = parseVariableId('{{1}}')
    expect(result).toEqual({ isNumeric: true, value: '1' })
  })

  it('identifica variável nomeada', () => {
    const result = parseVariableId('{{nome}}')
    expect(result).toEqual({ isNumeric: false, value: 'nome' })
  })

  it('identifica número multi-dígitos', () => {
    const result = parseVariableId('{{10}}')
    expect(result).toEqual({ isNumeric: true, value: '10' })
  })

  it('identifica variável com underscore como não-numérica', () => {
    const result = parseVariableId('{{campo_1}}')
    expect(result).toEqual({ isNumeric: false, value: 'campo_1' })
  })
})

// =============================================================================
// parseTemplateVariables
// =============================================================================

describe('parseTemplateVariables', () => {
  it('extrai variáveis do header TEXT', () => {
    const template = makeTemplate([
      { type: 'HEADER', format: 'TEXT', text: 'Olá {{nome}}!' },
      { type: 'BODY', text: 'Texto sem variáveis.' },
    ])
    const result = parseTemplateVariables(template)
    expect(result.header).toEqual(['nome'])
    expect(result.body).toEqual([])
    expect(result.all).toEqual(['nome'])
  })

  it('ignora header não-TEXT (IMAGE, VIDEO)', () => {
    const template = makeTemplate([
      { type: 'HEADER', format: 'IMAGE' },
      { type: 'BODY', text: 'Corpo com {{1}}' },
    ])
    const result = parseTemplateVariables(template)
    expect(result.header).toEqual([])
    expect(result.body).toEqual(['1'])
  })

  it('extrai variáveis do body', () => {
    const template = makeTemplate([
      { type: 'BODY', text: 'Pedido {{pedido}} entregue em {{data}}' },
    ])
    const result = parseTemplateVariables(template)
    expect(result.body).toEqual(['pedido', 'data'])
    expect(result.all).toEqual(['pedido', 'data'])
  })

  it('extrai variáveis de URLs de botões', () => {
    const template = makeTemplate([
      { type: 'BODY', text: 'Acompanhe:' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Rastrear', url: 'https://track.com/{{codigo}}' },
          { type: 'QUICK_REPLY', text: 'OK' },
        ],
      },
    ])
    const result = parseTemplateVariables(template)
    expect(result.buttons).toEqual(['codigo'])
    expect(result.all).toContain('codigo')
  })

  it('combina header, body e buttons no all sem duplicatas', () => {
    const template = makeTemplate([
      { type: 'HEADER', format: 'TEXT', text: 'Olá {{nome}}!' },
      { type: 'BODY', text: '{{nome}}, seu pedido {{1}} chegou.' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Ver', url: 'https://site.com/{{1}}' },
        ],
      },
    ])
    const result = parseTemplateVariables(template)
    expect(result.header).toEqual(['nome'])
    expect(result.body).toEqual(['nome', '1'])
    expect(result.buttons).toEqual(['1'])
    // all é unique: nome, 1
    expect(result.all).toEqual(['nome', '1'])
  })

  it('retorna vazio para template sem components', () => {
    const template = makeTemplate(undefined)
    const result = parseTemplateVariables(template)
    expect(result.header).toEqual([])
    expect(result.body).toEqual([])
    expect(result.buttons).toEqual([])
    expect(result.all).toEqual([])
  })

  it('retorna vazio para template null', () => {
    const result = parseTemplateVariables(null as unknown as Template)
    expect(result.all).toEqual([])
  })

  it('ignora botões não-URL', () => {
    const template = makeTemplate([
      { type: 'BODY', text: 'Teste' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Sim' },
          { type: 'PHONE_NUMBER', text: 'Ligar', phone_number: '+5511999999999' },
        ],
      },
    ])
    const result = parseTemplateVariables(template)
    expect(result.buttons).toEqual([])
  })

  it('deduplica variáveis dentro de button URLs', () => {
    const template = makeTemplate([
      { type: 'BODY', text: 'Teste' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Link1', url: 'https://a.com/{{code}}' },
          { type: 'URL', text: 'Link2', url: 'https://b.com/{{code}}' },
        ],
      },
    ])
    const result = parseTemplateVariables(template)
    expect(result.buttons).toEqual(['code'])
  })
})

// =============================================================================
// getTemplateVariableInfo
// =============================================================================

describe('getTemplateVariableInfo', () => {
  it('retorna info detalhada para variáveis do body', () => {
    const template = makeTemplate([
      { type: 'BODY', text: 'Olá {{nome}}, pedido {{1}}' },
    ])
    const result = getTemplateVariableInfo(template)
    expect(result.body).toHaveLength(2)
    expect(result.body[0]).toEqual({
      index: 0,
      key: 'nome',
      placeholder: '{{nome}}',
      context: 'Variável do corpo ({{nome}})',
    })
    expect(result.body[1]).toEqual({
      index: 1,
      key: '1',
      placeholder: '{{1}}',
      context: 'Variável do corpo ({{1}})',
    })
    expect(result.totalCount).toBe(2)
  })

  it('retorna info detalhada para variáveis do header', () => {
    const template = makeTemplate([
      { type: 'HEADER', format: 'TEXT', text: 'Promoção {{1}}!' },
      { type: 'BODY', text: 'Texto' },
    ])
    const result = getTemplateVariableInfo(template)
    expect(result.header).toHaveLength(1)
    expect(result.header[0].context).toContain('cabeçalho')
    expect(result.header[0].index).toBe(1)
  })

  it('retorna info detalhada para variáveis de botão', () => {
    const template = makeTemplate([
      { type: 'BODY', text: 'Texto' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Rastrear', url: 'https://site.com/{{track_id}}' },
        ],
      },
    ])
    const result = getTemplateVariableInfo(template)
    expect(result.buttons).toHaveLength(1)
    expect(result.buttons[0].buttonIndex).toBe(0)
    expect(result.buttons[0].buttonText).toBe('Rastrear')
    expect(result.buttons[0].context).toContain('URL')
  })

  it('usa fallback para buttonText quando btn.text é vazio', () => {
    const template = makeTemplate([
      { type: 'BODY', text: 'Texto' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: '', url: 'https://site.com/{{1}}' },
        ],
      },
    ])
    const result = getTemplateVariableInfo(template)
    expect(result.buttons[0].buttonText).toBe('Botão 1')
  })

  it('retorna resultado vazio para template null', () => {
    const result = getTemplateVariableInfo(null)
    expect(result.header).toEqual([])
    expect(result.body).toEqual([])
    expect(result.buttons).toEqual([])
    expect(result.totalCount).toBe(0)
  })

  it('retorna resultado vazio para template undefined', () => {
    const result = getTemplateVariableInfo(undefined)
    expect(result.totalCount).toBe(0)
  })

  it('retorna resultado vazio para template sem components', () => {
    const template = makeTemplate(undefined)
    const result = getTemplateVariableInfo(template)
    expect(result.totalCount).toBe(0)
  })

  it('fallback: parseia variáveis do corpo via template.content quando components está vazio', () => {
    const template: Template = {
      ...makeTemplate([]),
      content: 'Olá {{1}}, seu pedido {{2}} foi confirmado',
    }
    const result = getTemplateVariableInfo(template)
    expect(result.body).toHaveLength(2)
    expect(result.body[0]).toMatchObject({ key: '1', placeholder: '{{1}}' })
    expect(result.body[1]).toMatchObject({ key: '2', placeholder: '{{2}}' })
    expect(result.totalCount).toBe(2)
  })

  it('fallback: não ativa quando components já tem variáveis de corpo', () => {
    const template = makeTemplate([
      { type: 'BODY', text: 'Corpo com {{nome}}' },
    ])
    const result = getTemplateVariableInfo(template)
    expect(result.body).toHaveLength(1)
    expect(result.body[0].key).toBe('nome')
    expect(result.totalCount).toBe(1)
  })

  it('calcula totalCount corretamente somando todas as seções', () => {
    const template = makeTemplate([
      { type: 'HEADER', format: 'TEXT', text: '{{1}} info' },
      { type: 'BODY', text: '{{nome}} recebeu {{pedido}}' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Ver', url: 'https://x.com/{{code}}' },
        ],
      },
    ])
    const result = getTemplateVariableInfo(template)
    expect(result.totalCount).toBe(4) // 1 header + 2 body + 1 button
  })

  it('deduplica variáveis dentro da mesma seção', () => {
    const template = makeTemplate([
      { type: 'BODY', text: '{{nome}} e {{nome}} repetido' },
    ])
    const result = getTemplateVariableInfo(template)
    expect(result.body).toHaveLength(1)
  })
})

// =============================================================================
// countTemplateVariables
// =============================================================================

describe('countTemplateVariables', () => {
  it('conta variáveis únicas do template', () => {
    const template = makeTemplate([
      { type: 'HEADER', format: 'TEXT', text: 'Olá {{1}}!' },
      { type: 'BODY', text: 'Pedido {{2}} em {{3}}' },
    ])
    expect(countTemplateVariables(template)).toBe(3)
  })

  it('retorna 0 para template sem variáveis', () => {
    const template = makeTemplate([
      { type: 'BODY', text: 'Texto simples sem variáveis' },
    ])
    expect(countTemplateVariables(template)).toBe(0)
  })

  it('retorna 0 para template sem components', () => {
    const template = makeTemplate(undefined)
    expect(countTemplateVariables(template)).toBe(0)
  })

  it('não conta variáveis duplicadas entre seções', () => {
    const template = makeTemplate([
      { type: 'HEADER', format: 'TEXT', text: 'Oi {{nome}}!' },
      { type: 'BODY', text: '{{nome}}, seu pedido {{1}}' },
    ])
    // unique: nome, 1
    expect(countTemplateVariables(template)).toBe(2)
  })
})
