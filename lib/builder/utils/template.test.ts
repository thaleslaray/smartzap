import { describe, it, expect } from 'vitest'
import {
  processTemplate,
  processConfigTemplates,
  formatTemplateForDisplay,
  hasTemplateVariables,
  extractTemplateVariables,
  getAvailableFields,
  type NodeOutputs,
} from './template'

// =============================================================================
// FIXTURES
// =============================================================================

const createNodeOutputs = (overrides?: Partial<NodeOutputs>): NodeOutputs => ({
  'node-1': {
    label: 'Entrada',
    data: {
      nome: 'João',
      telefone: '+5511999999999',
      idade: 30,
    },
  },
  'node-2': {
    label: 'API Call',
    data: {
      status: 200,
      items: [
        { id: 1, name: 'Item A' },
        { id: 2, name: 'Item B' },
      ],
      user: {
        name: 'Maria',
        address: {
          city: 'São Paulo',
          state: 'SP',
        },
      },
    },
  },
  'node-3': {
    label: 'Mensagem',
    data: 'Texto simples como string',
  },
  ...overrides,
})

const createStandardizedNodeOutputs = (): NodeOutputs => ({
  'node-std': {
    label: 'Step Result',
    data: {
      success: true,
      data: {
        firstName: 'Carlos',
        lastName: 'Silva',
        contacts: [
          { phone: '+5511111111111' },
          { phone: '+5522222222222' },
        ],
      },
    },
  },
  'node-std-fail': {
    label: 'Failed Step',
    data: {
      success: false,
      data: null,
      error: 'Timeout ao conectar',
    },
  },
})

// =============================================================================
// processTemplate
// =============================================================================
describe('processTemplate', () => {
  // ---------------------------------------------------------------------------
  // Formato novo: {{@nodeId:Label.field}}
  // ---------------------------------------------------------------------------
  describe('formato novo (@nodeId:Label.field)', () => {
    it('deve resolver referência com campo', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('Olá {{@node-1:Entrada.nome}}!', outputs)
      expect(result).toBe('Olá João!')
    })

    it('deve resolver referência sem campo (retorna data inteiro)', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('Valor: {{@node-3:Mensagem}}', outputs)
      expect(result).toBe('Valor: Texto simples como string')
    })

    it('deve resolver campo numérico', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('Idade: {{@node-1:Entrada.idade}}', outputs)
      expect(result).toBe('Idade: 30')
    })

    it('deve resolver campo aninhado profundo', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate(
        'Cidade: {{@node-2:API Call.user.address.city}}',
        outputs
      )
      expect(result).toBe('Cidade: São Paulo')
    })

    it('deve manter placeholder quando nodeId não existe', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{@inexistente:Label.campo}}', outputs)
      expect(result).toBe('{{@inexistente:Label.campo}}')
    })

    it('deve manter placeholder quando campo não existe', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{@node-1:Entrada.cpf}}', outputs)
      expect(result).toBe('{{@node-1:Entrada.cpf}}')
    })

    it('deve manter placeholder sem colonIndex (formato inválido)', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{@semColon}}', outputs)
      expect(result).toBe('{{@semColon}}')
    })

    it('deve resolver referência sem campo quando nodeId existe', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{@node-1:Entrada}}', outputs)
      // Sem campo, retorna data formatada (que é um objeto)
      expect(result).toContain('João')
    })

    it('deve resolver acesso a array via campo aninhado', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate(
        'Primeiro: {{@node-2:API Call.items[0].name}}',
        outputs
      )
      expect(result).toBe('Primeiro: Item A')
    })

    it('deve resolver múltiplas referências no mesmo template', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate(
        '{{@node-1:Entrada.nome}} tem {{@node-1:Entrada.idade}} anos',
        outputs
      )
      expect(result).toBe('João tem 30 anos')
    })
  })

  // ---------------------------------------------------------------------------
  // Formato legado $: {{$nodeId.field}}
  // ---------------------------------------------------------------------------
  describe('formato legado $ ($nodeId.field)', () => {
    it('deve resolver referência por ID com campo', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('Nome: {{$node-1.nome}}', outputs)
      expect(result).toBe('Nome: João')
    })

    it('deve resolver referência por ID sem campo (retorna data inteiro)', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{$node-3}}', outputs)
      expect(result).toBe('Texto simples como string')
    })

    it('deve resolver campo aninhado profundo', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{$node-2.user.address.state}}', outputs)
      expect(result).toBe('SP')
    })

    it('deve resolver acesso a array por índice', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{$node-2.items[0].name}}', outputs)
      expect(result).toBe('Item A')
    })

    it('deve resolver segundo item do array', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{$node-2.items[1].id}}', outputs)
      expect(result).toBe('2')
    })

    it('deve manter placeholder quando nodeId não existe', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{$nao-existe.campo}}', outputs)
      expect(result).toBe('{{$nao-existe.campo}}')
    })

    it('deve manter placeholder quando campo não existe', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{$node-1.email}}', outputs)
      expect(result).toBe('{{$node-1.email}}')
    })

    it('deve manter placeholder para nodeId inexistente sem campo', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{$nao-existe}}', outputs)
      expect(result).toBe('{{$nao-existe}}')
    })

    it('deve resolver mapeamento de campo em array', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{$node-2.items.name}}', outputs)
      // Quando current é array e acessa campo, faz map
      expect(result).toBe('Item A, Item B')
    })
  })

  // ---------------------------------------------------------------------------
  // Formato legado label: {{label.field}}
  // ---------------------------------------------------------------------------
  describe('formato legado label (label.field)', () => {
    it('deve resolver referência por label com campo', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('Nome: {{Entrada.nome}}', outputs)
      expect(result).toBe('Nome: João')
    })

    it('deve resolver referência por label sem campo (retorna data inteiro)', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{Mensagem}}', outputs)
      expect(result).toBe('Texto simples como string')
    })

    it('deve ser case-insensitive na busca por label', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{entrada.nome}}', outputs)
      expect(result).toBe('João')
    })

    it('deve resolver campo aninhado profundo', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{API Call.user.address.city}}', outputs)
      expect(result).toBe('São Paulo')
    })

    it('deve resolver acesso a array por índice', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{API Call.items[0].name}}', outputs)
      expect(result).toBe('Item A')
    })

    it('deve manter placeholder quando label não existe', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{Inexistente.campo}}', outputs)
      expect(result).toBe('{{Inexistente.campo}}')
    })

    it('deve manter placeholder quando label sem campo não existe', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{LabelNaoExiste}}', outputs)
      expect(result).toBe('{{LabelNaoExiste}}')
    })

    it('deve manter placeholder quando campo não existe no label', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{Entrada.cpf}}', outputs)
      expect(result).toBe('{{Entrada.cpf}}')
    })

    it('deve resolver mapeamento de campo em array via label', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{API Call.items.id}}', outputs)
      expect(result).toBe('1, 2')
    })
  })

  // ---------------------------------------------------------------------------
  // Outputs padronizados ({ success, data })
  // ---------------------------------------------------------------------------
  describe('outputs padronizados (standardized)', () => {
    it('deve auto-unwrap standardized output e acessar campo interno', () => {
      const outputs = createStandardizedNodeOutputs()
      const result = processTemplate('{{@node-std:Step Result.firstName}}', outputs)
      expect(result).toBe('Carlos')
    })

    it('deve acessar campo aninhado dentro de output padronizado', () => {
      const outputs = createStandardizedNodeOutputs()
      const result = processTemplate(
        '{{@node-std:Step Result.contacts[0].phone}}',
        outputs
      )
      expect(result).toBe('+5511111111111')
    })

    it('deve permitir acesso explícito ao campo success', () => {
      const outputs = createStandardizedNodeOutputs()
      const result = processTemplate('{{@node-std:Step Result.success}}', outputs)
      expect(result).toBe('true')
    })

    it('deve permitir acesso explícito ao campo data', () => {
      const outputs = createStandardizedNodeOutputs()
      const result = processTemplate('{{@node-std:Step Result.data.firstName}}', outputs)
      expect(result).toBe('Carlos')
    })

    it('deve permitir acesso explícito ao campo error', () => {
      const outputs = createStandardizedNodeOutputs()
      const result = processTemplate('{{@node-std-fail:Failed Step.error}}', outputs)
      expect(result).toBe('Timeout ao conectar')
    })

    it('deve funcionar com formato legado $ e standardized output', () => {
      const outputs = createStandardizedNodeOutputs()
      const result = processTemplate('{{$node-std.firstName}}', outputs)
      // resolveExpressionById NÃO faz unwrap automático, vai para data diretamente
      // O resolveExpressionById usa data como current e acessa .firstName
      // Mas data é { success, data: { firstName } }, então firstName não existe diretamente
      // Na verdade, resolveExpressionById pega nodeOutput.data que é o objeto padronizado
      // e tenta acessar .firstName nele -- que não existe no nível raiz
      // Então esperamos o placeholder mantido
      expect(result).toBe('{{$node-std.firstName}}')
    })

    it('deve funcionar com formato legado $ acessando success diretamente', () => {
      const outputs = createStandardizedNodeOutputs()
      const result = processTemplate('{{$node-std.success}}', outputs)
      expect(result).toBe('true')
    })

    it('deve funcionar com formato legado $ acessando data.firstName', () => {
      const outputs = createStandardizedNodeOutputs()
      const result = processTemplate('{{$node-std.data.firstName}}', outputs)
      expect(result).toBe('Carlos')
    })
  })

  // ---------------------------------------------------------------------------
  // Formatos mistos no mesmo template
  // ---------------------------------------------------------------------------
  describe('formatos mistos', () => {
    it('deve resolver formatos novos e legados no mesmo template', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate(
        '{{@node-1:Entrada.nome}} - {{$node-2.user.name}} - {{Mensagem}}',
        outputs
      )
      expect(result).toBe('João - Maria - Texto simples como string')
    })

    it('deve resolver parcialmente quando alguns nodes faltam', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate(
        '{{@node-1:Entrada.nome}} e {{@inexistente:X.campo}}',
        outputs
      )
      expect(result).toBe('João e {{@inexistente:X.campo}}')
    })
  })

  // ---------------------------------------------------------------------------
  // Edge cases e entradas inválidas
  // ---------------------------------------------------------------------------
  describe('edge cases', () => {
    it('deve retornar string vazia quando template é vazia', () => {
      const result = processTemplate('', createNodeOutputs())
      expect(result).toBe('')
    })

    it('deve retornar template inalterada quando não tem variáveis', () => {
      const result = processTemplate('Sem variáveis aqui', createNodeOutputs())
      expect(result).toBe('Sem variáveis aqui')
    })

    it('deve lidar com nodeOutputs vazio', () => {
      const result = processTemplate('{{@node-1:Test.campo}}', {})
      expect(result).toBe('{{@node-1:Test.campo}}')
    })

    it('deve lidar com null/undefined como template', () => {
      // @ts-expect-error - testando input inválido
      expect(processTemplate(null, {})).toBe(null)
      // @ts-expect-error - testando input inválido
      expect(processTemplate(undefined, {})).toBe(undefined)
    })

    it('deve lidar com tipo não-string como template', () => {
      // @ts-expect-error - testando input inválido
      expect(processTemplate(123, {})).toBe(123)
    })

    it('deve formatar boolean como string', () => {
      const outputs: NodeOutputs = {
        'node-bool': { label: 'Bool', data: true },
      }
      const result = processTemplate('{{@node-bool:Bool}}', outputs)
      expect(result).toBe('true')
    })

    it('deve formatar número como string', () => {
      const outputs: NodeOutputs = {
        'node-num': { label: 'Num', data: 42 },
      }
      const result = processTemplate('{{@node-num:Num}}', outputs)
      expect(result).toBe('42')
    })

    it('deve formatar array como valores separados por vírgula', () => {
      const outputs: NodeOutputs = {
        'node-arr': { label: 'Arr', data: ['a', 'b', 'c'] },
      }
      const result = processTemplate('{{@node-arr:Arr}}', outputs)
      expect(result).toBe('a, b, c')
    })

    it('deve formatar objeto com campo title', () => {
      const outputs: NodeOutputs = {
        'node-obj': { label: 'Obj', data: { title: 'Meu Título' } },
      }
      const result = processTemplate('{{@node-obj:Obj}}', outputs)
      expect(result).toBe('Meu Título')
    })

    it('deve formatar objeto com campo name', () => {
      const outputs: NodeOutputs = {
        'node-obj': { label: 'Obj', data: { name: 'Meu Nome' } },
      }
      const result = processTemplate('{{@node-obj:Obj}}', outputs)
      expect(result).toBe('Meu Nome')
    })

    it('deve formatar objeto com campo id quando não tem title/name', () => {
      const outputs: NodeOutputs = {
        'node-obj': { label: 'Obj', data: { id: 'abc-123' } },
      }
      const result = processTemplate('{{@node-obj:Obj}}', outputs)
      expect(result).toBe('abc-123')
    })

    it('deve formatar objeto com campo message', () => {
      const outputs: NodeOutputs = {
        'node-obj': { label: 'Obj', data: { message: 'Erro ocorreu' } },
      }
      const result = processTemplate('{{@node-obj:Obj}}', outputs)
      expect(result).toBe('Erro ocorreu')
    })

    it('deve formatar objeto genérico como JSON', () => {
      const outputs: NodeOutputs = {
        'node-obj': { label: 'Obj', data: { foo: 'bar', baz: 1 } },
      }
      const result = processTemplate('{{@node-obj:Obj}}', outputs)
      expect(result).toBe(JSON.stringify({ foo: 'bar', baz: 1 }, null, 2))
    })

    it('deve preservar espaço em branco ao redor da expressão', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{ @node-1:Entrada.nome }}', outputs)
      expect(result).toBe('João')
    })

    it('deve lidar com acesso a array com índice fora do range', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{@node-2:API Call.items[99]}}', outputs)
      expect(result).toBe('{{@node-2:API Call.items[99]}}')
    })

    it('deve lidar com acesso a array em campo não-array', () => {
      const outputs = createNodeOutputs()
      const result = processTemplate('{{@node-2:API Call.user[0]}}', outputs)
      expect(result).toBe('{{@node-2:API Call.user[0]}}')
    })

    it('deve lidar com data null no node', () => {
      const outputs: NodeOutputs = {
        'node-null': { label: 'Null', data: null },
      }
      const result = processTemplate('{{@node-null:Null.campo}}', outputs)
      expect(result).toBe('{{@node-null:Null.campo}}')
    })

    it('deve formatar null/undefined como string vazia via formatValue', () => {
      const outputs: NodeOutputs = {
        'node-null': { label: 'Null', data: null },
      }
      // Sem campo, formatValue(null) retorna ""
      const result = processTemplate('{{@node-null:Null}}', outputs)
      expect(result).toBe('')
    })
  })
})

// =============================================================================
// processConfigTemplates
// =============================================================================
describe('processConfigTemplates', () => {
  it('deve processar strings no primeiro nível', () => {
    const outputs = createNodeOutputs()
    const config = {
      message: 'Olá {{@node-1:Entrada.nome}}',
      target: '{{@node-1:Entrada.telefone}}',
    }
    const result = processConfigTemplates(config, outputs)
    expect(result).toEqual({
      message: 'Olá João',
      target: '+5511999999999',
    })
  })

  it('deve processar objetos aninhados recursivamente', () => {
    const outputs = createNodeOutputs()
    const config = {
      level1: {
        level2: {
          value: '{{@node-1:Entrada.nome}}',
        },
      },
    }
    const result = processConfigTemplates(config, outputs)
    expect(result).toEqual({
      level1: {
        level2: {
          value: 'João',
        },
      },
    })
  })

  it('deve preservar valores não-string', () => {
    const outputs = createNodeOutputs()
    const config = {
      count: 42,
      enabled: true,
      items: ['a', 'b'],
      nothing: null,
    }
    const result = processConfigTemplates(config, outputs)
    expect(result).toEqual({
      count: 42,
      enabled: true,
      items: ['a', 'b'],
      nothing: null,
    })
  })

  it('deve preservar arrays sem processar', () => {
    const outputs = createNodeOutputs()
    const config = {
      tags: ['{{@node-1:Entrada.nome}}', 'fixo'],
    }
    const result = processConfigTemplates(config, outputs)
    // Arrays não são processados recursivamente, são passados como estão
    expect(result.tags).toEqual(['{{@node-1:Entrada.nome}}', 'fixo'])
  })

  it('deve processar config vazia', () => {
    const result = processConfigTemplates({}, createNodeOutputs())
    expect(result).toEqual({})
  })

  it('deve processar config com mix de tipos profundamente aninhados', () => {
    const outputs = createNodeOutputs()
    const config = {
      header: {
        title: '{{@node-1:Entrada.nome}}',
        subtitle: 'Fixo',
        meta: {
          author: '{{Entrada.nome}}',
          count: 5,
          nested: {
            deep: '{{$node-2.user.name}}',
          },
        },
      },
      footer: 'Rodapé',
    }
    const result = processConfigTemplates(config, outputs)
    expect(result).toEqual({
      header: {
        title: 'João',
        subtitle: 'Fixo',
        meta: {
          author: 'João',
          count: 5,
          nested: {
            deep: 'Maria',
          },
        },
      },
      footer: 'Rodapé',
    })
  })
})

// =============================================================================
// formatTemplateForDisplay
// =============================================================================
describe('formatTemplateForDisplay', () => {
  it('deve converter formato novo para exibição legível', () => {
    const result = formatTemplateForDisplay('{{@node-1:Entrada.nome}}')
    expect(result).toBe('{{Entrada.nome}}')
  })

  it('deve converter múltiplas referências', () => {
    const result = formatTemplateForDisplay(
      '{{@node-1:Entrada.nome}} e {{@node-2:API Call.status}}'
    )
    expect(result).toBe('{{Entrada.nome}} e {{API Call.status}}')
  })

  it('deve converter referência sem campo', () => {
    const result = formatTemplateForDisplay('{{@node-1:Entrada}}')
    expect(result).toBe('{{Entrada}}')
  })

  it('deve deixar formato legado inalterado', () => {
    const result = formatTemplateForDisplay('{{$node-1.nome}}')
    expect(result).toBe('{{$node-1.nome}}')
  })

  it('deve deixar formato label inalterado', () => {
    const result = formatTemplateForDisplay('{{Entrada.nome}}')
    expect(result).toBe('{{Entrada.nome}}')
  })

  it('deve retornar string sem variáveis inalterada', () => {
    const result = formatTemplateForDisplay('Texto sem variáveis')
    expect(result).toBe('Texto sem variáveis')
  })

  it('deve lidar com null/undefined', () => {
    // @ts-expect-error - testando input inválido
    expect(formatTemplateForDisplay(null)).toBe(null)
    // @ts-expect-error - testando input inválido
    expect(formatTemplateForDisplay(undefined)).toBe(undefined)
  })

  it('deve lidar com string vazia', () => {
    expect(formatTemplateForDisplay('')).toBe('')
  })

  it('deve preservar texto ao redor das referências', () => {
    const result = formatTemplateForDisplay(
      'Olá {{@abc:Nome.primeiro}}, bem-vindo!'
    )
    expect(result).toBe('Olá {{Nome.primeiro}}, bem-vindo!')
  })
})

// =============================================================================
// hasTemplateVariables
// =============================================================================
describe('hasTemplateVariables', () => {
  it('deve retornar true para formato novo', () => {
    expect(hasTemplateVariables('{{@node-1:Label.field}}')).toBe(true)
  })

  it('deve retornar true para formato legado $', () => {
    expect(hasTemplateVariables('{{$node.field}}')).toBe(true)
  })

  it('deve retornar true para formato legado label', () => {
    expect(hasTemplateVariables('{{Label.field}}')).toBe(true)
  })

  it('deve retornar true para variável sem campo', () => {
    expect(hasTemplateVariables('{{Label}}')).toBe(true)
  })

  it('deve retornar false para string sem variáveis', () => {
    expect(hasTemplateVariables('Texto normal')).toBe(false)
  })

  it('deve retornar false para string vazia', () => {
    expect(hasTemplateVariables('')).toBe(false)
  })

  it('deve retornar false para chaves abertas sem fechar', () => {
    expect(hasTemplateVariables('{{ incompleto')).toBe(false)
  })

  it('deve retornar false para chaves vazias', () => {
    expect(hasTemplateVariables('{{}}')).toBe(false)
  })

  it('deve retornar true quando variável está no meio do texto', () => {
    expect(hasTemplateVariables('Olá {{nome}}, tudo bem?')).toBe(true)
  })

  it('deve retornar true para múltiplas variáveis', () => {
    expect(hasTemplateVariables('{{a}} e {{b}}')).toBe(true)
  })
})

// =============================================================================
// extractTemplateVariables
// =============================================================================
describe('extractTemplateVariables', () => {
  it('deve extrair variável no formato novo', () => {
    const result = extractTemplateVariables('{{@node-1:Label.field}}')
    expect(result).toEqual(['@node-1:Label.field'])
  })

  it('deve extrair variável no formato legado $', () => {
    const result = extractTemplateVariables('{{$node.field}}')
    expect(result).toEqual(['$node.field'])
  })

  it('deve extrair variável no formato legado label', () => {
    const result = extractTemplateVariables('{{Label.field}}')
    expect(result).toEqual(['Label.field'])
  })

  it('deve extrair múltiplas variáveis de formatos diferentes', () => {
    const result = extractTemplateVariables(
      '{{@node-1:Label.a}} e {{$node-2.b}} e {{Label.c}}'
    )
    expect(result).toEqual(['@node-1:Label.a', '$node-2.b', 'Label.c'])
  })

  it('deve retornar array vazio para string sem variáveis', () => {
    expect(extractTemplateVariables('Texto normal')).toEqual([])
  })

  it('deve retornar array vazio para string vazia', () => {
    expect(extractTemplateVariables('')).toEqual([])
  })

  it('deve retornar array vazio para null/undefined', () => {
    // @ts-expect-error - testando input inválido
    expect(extractTemplateVariables(null)).toEqual([])
    // @ts-expect-error - testando input inválido
    expect(extractTemplateVariables(undefined)).toEqual([])
  })

  it('deve fazer trim do conteúdo das variáveis', () => {
    const result = extractTemplateVariables('{{  @node-1:Label.field  }}')
    expect(result).toEqual(['@node-1:Label.field'])
  })

  it('deve extrair variável simples sem campo', () => {
    const result = extractTemplateVariables('{{Label}}')
    expect(result).toEqual(['Label'])
  })

  it('deve extrair múltiplas variáveis iguais', () => {
    const result = extractTemplateVariables('{{nome}} e {{nome}}')
    expect(result).toEqual(['nome', 'nome'])
  })
})

// =============================================================================
// getAvailableFields
// =============================================================================
describe('getAvailableFields', () => {
  it('deve retornar campo raiz para cada node', () => {
    const outputs: NodeOutputs = {
      'node-1': { label: 'Entrada', data: { nome: 'João' } },
    }
    const fields = getAvailableFields(outputs)
    const rootField = fields.find((f) => f.field === '' && f.nodeLabel === 'Entrada')
    expect(rootField).toBeDefined()
    expect(rootField?.path).toBe('{{Entrada}}')
  })

  it('deve extrair campos de primeiro nível', () => {
    const outputs: NodeOutputs = {
      'node-1': { label: 'Entrada', data: { nome: 'João', idade: 30 } },
    }
    const fields = getAvailableFields(outputs)
    const nomeField = fields.find((f) => f.field === 'nome')
    expect(nomeField).toBeDefined()
    expect(nomeField?.path).toBe('{{Entrada.nome}}')
    expect(nomeField?.sample).toBe('João')
  })

  it('deve extrair campos aninhados recursivamente', () => {
    const outputs: NodeOutputs = {
      'node-1': {
        label: 'API',
        data: {
          user: {
            address: {
              city: 'SP',
            },
          },
        },
      },
    }
    const fields = getAvailableFields(outputs)
    const cityField = fields.find((f) => f.field === 'city')
    expect(cityField).toBeDefined()
    expect(cityField?.path).toBe('{{API.user.address.city}}')
  })

  it('deve unwrap standardized output para autocomplete', () => {
    const outputs: NodeOutputs = {
      'node-std': {
        label: 'Step',
        data: {
          success: true,
          data: {
            firstName: 'Carlos',
          },
        },
      },
    }
    const fields = getAvailableFields(outputs)
    const firstNameField = fields.find((f) => f.field === 'firstName')
    expect(firstNameField).toBeDefined()
    expect(firstNameField?.sample).toBe('Carlos')
  })

  it('deve retornar array vazio para nodeOutputs vazio', () => {
    const fields = getAvailableFields({})
    expect(fields).toEqual([])
  })

  it('deve respeitar maxDepth (não extrair além de 3 níveis)', () => {
    const outputs: NodeOutputs = {
      'node-1': {
        label: 'Deep',
        data: {
          l1: {
            l2: {
              l3: {
                l4: 'muito profundo',
              },
            },
          },
        },
      },
    }
    const fields = getAvailableFields(outputs)
    // l4 está no depth 3 (l1=0, l2=1, l3=2, l4=3), não deve ser extraído
    const l4Field = fields.find((f) => f.field === 'l4')
    expect(l4Field).toBeUndefined()
    // Mas l3 deve existir
    const l3Field = fields.find((f) => f.field === 'l3')
    expect(l3Field).toBeDefined()
  })

  it('deve lidar com data primitiva (não objeto)', () => {
    const outputs: NodeOutputs = {
      'node-str': { label: 'Str', data: 'texto' },
    }
    const fields = getAvailableFields(outputs)
    // Apenas o campo raiz
    expect(fields).toHaveLength(1)
    expect(fields[0].field).toBe('')
  })

  it('não deve recursir em arrays', () => {
    const outputs: NodeOutputs = {
      'node-arr': {
        label: 'Arr',
        data: {
          items: [{ name: 'a' }, { name: 'b' }],
          fixed: 'valor',
        },
      },
    }
    const fields = getAvailableFields(outputs)
    // items é array, não deve gerar subcampos
    const itemsField = fields.find((f) => f.field === 'items')
    expect(itemsField).toBeDefined()
    // Mas não deve ter items.name como campo
    const itemNameField = fields.find(
      (f) => f.path.includes('items.name')
    )
    expect(itemNameField).toBeUndefined()
  })

  it('deve gerar campos de múltiplos nodes', () => {
    const outputs: NodeOutputs = {
      'node-1': { label: 'A', data: { x: 1 } },
      'node-2': { label: 'B', data: { y: 2 } },
    }
    const fields = getAvailableFields(outputs)
    const nodeLabels = [...new Set(fields.map((f) => f.nodeLabel))]
    expect(nodeLabels).toContain('A')
    expect(nodeLabels).toContain('B')
  })
})

// =============================================================================
// resolveFieldPath (testado indiretamente via processTemplate)
// =============================================================================
describe('resolveFieldPath (via processTemplate)', () => {
  it('deve resolver campo simples', () => {
    const outputs: NodeOutputs = {
      'n1': { label: 'N1', data: { campo: 'valor' } },
    }
    expect(processTemplate('{{@n1:N1.campo}}', outputs)).toBe('valor')
  })

  it('deve resolver campo aninhado em 3 níveis', () => {
    const outputs: NodeOutputs = {
      'n1': { label: 'N1', data: { a: { b: { c: 'profundo' } } } },
    }
    expect(processTemplate('{{@n1:N1.a.b.c}}', outputs)).toBe('profundo')
  })

  it('deve resolver array com índice', () => {
    const outputs: NodeOutputs = {
      'n1': { label: 'N1', data: { list: ['x', 'y', 'z'] } },
    }
    expect(processTemplate('{{@n1:N1.list[1]}}', outputs)).toBe('y')
  })

  it('deve resolver campo dentro de item de array', () => {
    const outputs: NodeOutputs = {
      'n1': {
        label: 'N1',
        data: { users: [{ name: 'Ana' }, { name: 'Bia' }] },
      },
    }
    expect(processTemplate('{{@n1:N1.users[1].name}}', outputs)).toBe('Bia')
  })

  it('deve retornar undefined para caminho inexistente', () => {
    const outputs: NodeOutputs = {
      'n1': { label: 'N1', data: { a: 1 } },
    }
    expect(processTemplate('{{@n1:N1.b.c.d}}', outputs)).toBe('{{@n1:N1.b.c.d}}')
  })

  it('deve retornar undefined para data null', () => {
    const outputs: NodeOutputs = {
      'n1': { label: 'N1', data: null },
    }
    expect(processTemplate('{{@n1:N1.campo}}', outputs)).toBe('{{@n1:N1.campo}}')
  })

  it('deve mapear campo sobre array quando acessado diretamente', () => {
    const outputs: NodeOutputs = {
      'n1': {
        label: 'N1',
        data: {
          items: [
            { code: 'A' },
            { code: 'B' },
            { code: 'C' },
          ],
        },
      },
    }
    // Quando resolveFieldPath encontra um array e tenta acessar .code, faz map
    expect(processTemplate('{{@n1:N1.items.code}}', outputs)).toBe('A, B, C')
  })

  it('deve lidar com partes vazias no path (pontos consecutivos)', () => {
    const outputs: NodeOutputs = {
      'n1': { label: 'N1', data: { a: { b: 'ok' } } },
    }
    // "a..b" tem uma parte vazia que é ignorada via continue
    expect(processTemplate('{{@n1:N1.a..b}}', outputs)).toBe('ok')
  })
})

// =============================================================================
// Cenários de integração
// =============================================================================
describe('cenários de integração', () => {
  it('deve processar template de mensagem WhatsApp completa', () => {
    const outputs: NodeOutputs = {
      'input-node': {
        label: 'Dados do Cliente',
        data: {
          success: true,
          data: {
            nome: 'Maria Silva',
            telefone: '+5511988887777',
            pedido: {
              numero: 'PED-001',
              valor: 149.90,
              items: [
                { produto: 'Camiseta', qtd: 2 },
                { produto: 'Calça', qtd: 1 },
              ],
            },
          },
        },
      },
    }

    const template = 'Olá {{@input-node:Dados do Cliente.nome}}! ' +
      'Seu pedido {{@input-node:Dados do Cliente.pedido.numero}} ' +
      'no valor de R$ {{@input-node:Dados do Cliente.pedido.valor}} ' +
      'foi confirmado.'

    const result = processTemplate(template, outputs)
    expect(result).toBe(
      'Olá Maria Silva! Seu pedido PED-001 no valor de R$ 149.9 foi confirmado.'
    )
  })

  it('deve processar config completa de um node de workflow', () => {
    const outputs: NodeOutputs = {
      'trigger': {
        label: 'Trigger',
        data: { contactName: 'Ana', contactPhone: '+5511999' },
      },
      'ai-node': {
        label: 'AI Response',
        data: { success: true, data: { response: 'Olá! Como posso ajudar?' } },
      },
    }

    const config = {
      message: {
        text: '{{@ai-node:AI Response.response}}',
        to: '{{@trigger:Trigger.contactPhone}}',
      },
      metadata: {
        contact: '{{@trigger:Trigger.contactName}}',
        timestamp: '2024-01-01',
      },
    }

    const result = processConfigTemplates(config, outputs)
    expect(result).toEqual({
      message: {
        text: 'Olá! Como posso ajudar?',
        to: '+5511999',
      },
      metadata: {
        contact: 'Ana',
        timestamp: '2024-01-01',
      },
    })
  })

  it('deve combinar extractTemplateVariables + hasTemplateVariables + processTemplate', () => {
    const template = 'Olá {{@n1:Nome.primeiro}}, sua conta é {{$n2.numero}}'

    expect(hasTemplateVariables(template)).toBe(true)

    const vars = extractTemplateVariables(template)
    expect(vars).toHaveLength(2)
    expect(vars[0]).toBe('@n1:Nome.primeiro')
    expect(vars[1]).toBe('$n2.numero')

    const outputs: NodeOutputs = {
      'n1': { label: 'Nome', data: { primeiro: 'Carlos' } },
      'n2': { label: 'Conta', data: { numero: '12345' } },
    }

    const result = processTemplate(template, outputs)
    expect(result).toBe('Olá Carlos, sua conta é 12345')
    expect(hasTemplateVariables(result)).toBe(false)
  })

  it('deve processar formatTemplateForDisplay + extractTemplateVariables juntos', () => {
    const internal = '{{@node-1:Entrada de Dados.nome}} - {{@node-2:API.resultado}}'
    const display = formatTemplateForDisplay(internal)
    expect(display).toBe('{{Entrada de Dados.nome}} - {{API.resultado}}')

    const displayVars = extractTemplateVariables(display)
    expect(displayVars).toEqual(['Entrada de Dados.nome', 'API.resultado'])
  })
})
