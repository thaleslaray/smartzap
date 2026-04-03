import { describe, it, expect } from 'vitest'
import {
  replacePositionalPlaceholders,
  replaceNamedPlaceholders,
  replaceTemplatePlaceholders,
  extractAllPlaceholders,
} from './placeholder'

// =============================================================================
// replacePositionalPlaceholders
// =============================================================================
describe('replacePositionalPlaceholders', () => {
  it('deve substituir placeholders posicionais {{1}}, {{2}}', () => {
    const result = replacePositionalPlaceholders('Olá {{1}}, seu pedido {{2}} está pronto', ['Maria', '#123'])
    expect(result).toBe('Olá Maria, seu pedido #123 está pronto')
  })

  it('deve substituir múltiplas ocorrências do mesmo placeholder', () => {
    const result = replacePositionalPlaceholders('{{1}} e {{1}} novamente', ['teste'])
    expect(result).toBe('teste e teste novamente')
  })

  it('deve retornar string vazia quando text é vazio', () => {
    expect(replacePositionalPlaceholders('', ['valor'])).toBe('')
  })

  it('deve retornar texto original quando values é undefined', () => {
    expect(replacePositionalPlaceholders('Olá {{1}}', undefined)).toBe('Olá {{1}}')
  })

  it('deve retornar texto original quando values é array vazio', () => {
    expect(replacePositionalPlaceholders('Olá {{1}}', [])).toBe('Olá {{1}}')
  })

  it('deve retornar texto original quando values não é array', () => {
    // @ts-expect-error - testando input inválido
    expect(replacePositionalPlaceholders('Olá {{1}}', 'não é array')).toBe('Olá {{1}}')
  })

  it('deve manter placeholders sem valor correspondente', () => {
    const result = replacePositionalPlaceholders('{{1}} e {{2}} e {{3}}', ['um', 'dois'])
    expect(result).toBe('um e dois e {{3}}')
  })

  it('deve lidar com texto sem placeholders', () => {
    expect(replacePositionalPlaceholders('texto simples', ['valor'])).toBe('texto simples')
  })

  it('deve lidar com caracteres especiais de regex nos valores', () => {
    const result = replacePositionalPlaceholders('Preço: {{1}}', ['R$ 10.00 (promoção)'])
    expect(result).toBe('Preço: R$ 10.00 (promoção)')
  })
})

// =============================================================================
// replaceNamedPlaceholders
// =============================================================================
describe('replaceNamedPlaceholders', () => {
  it('deve substituir placeholders nomeados', () => {
    const result = replaceNamedPlaceholders('Olá {{name}}, seu telefone é {{phone}}', {
      name: 'Maria',
      phone: '11999999999',
    })
    expect(result).toBe('Olá Maria, seu telefone é 11999999999')
  })

  it('deve retornar string vazia quando text é vazio', () => {
    expect(replaceNamedPlaceholders('', { name: 'valor' })).toBe('')
  })

  it('deve retornar texto original quando values é undefined', () => {
    expect(replaceNamedPlaceholders('Olá {{name}}', undefined)).toBe('Olá {{name}}')
  })

  it('deve manter placeholders sem valor correspondente no objeto', () => {
    const result = replaceNamedPlaceholders('{{name}} e {{email}}', { name: 'Maria' })
    expect(result).toBe('Maria e {{email}}')
  })

  it('deve aceitar underscores e números no nome do placeholder', () => {
    const result = replaceNamedPlaceholders('{{first_name}} {{item_2}}', {
      first_name: 'João',
      item_2: 'sapato',
    })
    expect(result).toBe('João sapato')
  })

  it('não deve substituir placeholders com maiúsculas (regex só aceita lowercase)', () => {
    const result = replaceNamedPlaceholders('{{Name}} e {{name}}', { Name: 'A', name: 'B' })
    expect(result).toBe('{{Name}} e B')
  })

  it('não deve substituir placeholders com espaços', () => {
    const result = replaceNamedPlaceholders('{{first name}}', { 'first name': 'João' })
    expect(result).toBe('{{first name}}')
  })

  it('deve retornar texto original quando values não é objeto', () => {
    // @ts-expect-error - testando input inválido
    expect(replaceNamedPlaceholders('{{name}}', 'não é objeto')).toBe('{{name}}')
  })

  it('deve lidar com texto sem placeholders', () => {
    expect(replaceNamedPlaceholders('texto simples', { name: 'valor' })).toBe('texto simples')
  })
})

// =============================================================================
// replaceTemplatePlaceholders
// =============================================================================
describe('replaceTemplatePlaceholders', () => {
  it('deve usar placeholders posicionais quando parameterFormat é "positional"', () => {
    const result = replaceTemplatePlaceholders({
      text: 'Olá {{1}}',
      parameterFormat: 'positional',
      positionalValues: ['Maria'],
    })
    expect(result).toBe('Olá Maria')
  })

  it('deve usar placeholders nomeados quando parameterFormat é "named"', () => {
    const result = replaceTemplatePlaceholders({
      text: 'Olá {{name}}',
      parameterFormat: 'named',
      namedValues: { name: 'Maria' },
    })
    expect(result).toBe('Olá Maria')
  })

  it('deve ignorar namedValues quando formato é positional', () => {
    const result = replaceTemplatePlaceholders({
      text: 'Olá {{1}}',
      parameterFormat: 'positional',
      positionalValues: ['Maria'],
      namedValues: { '1': 'João' },
    })
    expect(result).toBe('Olá Maria')
  })

  it('deve ignorar positionalValues quando formato é named', () => {
    const result = replaceTemplatePlaceholders({
      text: 'Olá {{name}}',
      parameterFormat: 'named',
      positionalValues: ['Maria'],
      namedValues: { name: 'João' },
    })
    expect(result).toBe('Olá João')
  })
})

// =============================================================================
// extractAllPlaceholders
// =============================================================================
describe('extractAllPlaceholders', () => {
  it('deve extrair placeholders posicionais', () => {
    const result = extractAllPlaceholders('{{1}} e {{2}} e {{3}}')
    expect(result).toEqual(['{{1}}', '{{2}}', '{{3}}'])
  })

  it('deve extrair placeholders nomeados', () => {
    const result = extractAllPlaceholders('{{name}} e {{phone}}')
    expect(result).toEqual(['{{name}}', '{{phone}}'])
  })

  it('deve retornar array vazio para texto sem placeholders', () => {
    expect(extractAllPlaceholders('texto sem placeholder')).toEqual([])
  })

  it('deve retornar placeholders únicos (sem duplicatas)', () => {
    const result = extractAllPlaceholders('{{1}} e {{1}} e {{2}}')
    expect(result).toEqual(['{{1}}', '{{2}}'])
  })

  it('deve retornar array vazio para string vazia', () => {
    expect(extractAllPlaceholders('')).toEqual([])
  })

  it('deve extrair placeholders mistos (posicionais e nomeados)', () => {
    const result = extractAllPlaceholders('{{1}} e {{name}}')
    expect(result).toEqual(['{{1}}', '{{name}}'])
  })
})
