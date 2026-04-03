import { describe, it, expect } from 'vitest'
import {
  validateConditionExpression,
  preValidateConditionExpression,
  sanitizeForDisplay,
} from './condition-validator'

// ─── validateConditionExpression ─────────────────────────────────────────────

describe('validateConditionExpression', () => {
  // ── Expressões vazias / inválidas ──────────────────────────────────────────

  describe('expressões vazias e inválidas', () => {
    it('deve rejeitar expressão vazia (string vazia)', () => {
      const result = validateConditionExpression('')
      expect(result).toEqual({ valid: false, error: 'Condition expression cannot be empty' })
    })

    it('deve rejeitar expressão apenas com espaços', () => {
      const result = validateConditionExpression('   ')
      expect(result).toEqual({ valid: false, error: 'Condition expression cannot be empty' })
    })

    it('deve rejeitar undefined coerced como string vazia', () => {
      const result = validateConditionExpression(undefined as unknown as string)
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar null coerced como string vazia', () => {
      const result = validateConditionExpression(null as unknown as string)
      expect(result.valid).toBe(false)
    })
  })

  // ── Expressões válidas ─────────────────────────────────────────────────────

  describe('expressões válidas', () => {
    it('deve aceitar comparação simples com ===', () => {
      expect(validateConditionExpression("__v0 === 'test'")).toEqual({ valid: true })
    })

    it('deve aceitar comparação com !==', () => {
      expect(validateConditionExpression("__v0 !== 'hello'")).toEqual({ valid: true })
    })

    it('deve aceitar comparação com ==', () => {
      expect(validateConditionExpression('__v0 == 42')).toEqual({ valid: true })
    })

    it('deve aceitar comparação com !=', () => {
      expect(validateConditionExpression("__v0 != 'x'")).toEqual({ valid: true })
    })

    it('deve aceitar operadores > e <', () => {
      expect(validateConditionExpression('__v0 > 10')).toEqual({ valid: true })
      expect(validateConditionExpression('__v0 < 100')).toEqual({ valid: true })
    })

    it('deve aceitar operadores >= e <=', () => {
      expect(validateConditionExpression('__v0 >= 5')).toEqual({ valid: true })
      expect(validateConditionExpression('__v0 <= 50')).toEqual({ valid: true })
    })

    it('deve aceitar operadores lógicos && e ||', () => {
      expect(validateConditionExpression('__v0 > 10 && __v1 < 20')).toEqual({ valid: true })
      expect(validateConditionExpression("__v0 === 'a' || __v1 === 'b'")).toEqual({ valid: true })
    })

    it('deve aceitar operador de negação !', () => {
      expect(validateConditionExpression('!__v0')).toEqual({ valid: true })
    })

    it('deve aceitar parênteses para agrupamento', () => {
      expect(
        validateConditionExpression("(__v0 > 10) && (__v1 === 'test')")
      ).toEqual({ valid: true })
    })

    it('deve aceitar literais booleanos', () => {
      expect(validateConditionExpression('__v0 === true')).toEqual({ valid: true })
      expect(validateConditionExpression('__v0 === false')).toEqual({ valid: true })
    })

    it('deve aceitar literais null e undefined', () => {
      expect(validateConditionExpression('__v0 === null')).toEqual({ valid: true })
      expect(validateConditionExpression('__v0 === undefined')).toEqual({ valid: true })
    })

    it('deve aceitar comparação com números', () => {
      expect(validateConditionExpression('__v0 === 42')).toEqual({ valid: true })
    })

    it('deve aceitar comparação com strings aspas simples', () => {
      expect(validateConditionExpression("__v0 === 'hello world'")).toEqual({ valid: true })
    })

    it('deve aceitar comparação com strings aspas duplas', () => {
      expect(validateConditionExpression('__v0 === "hello"')).toEqual({ valid: true })
    })

    it('deve aceitar múltiplas variáveis', () => {
      expect(validateConditionExpression('__v0 === __v1')).toEqual({ valid: true })
      expect(validateConditionExpression('__v0 > __v1 && __v2 < __v3')).toEqual({ valid: true })
    })
  })

  // ── Métodos permitidos ─────────────────────────────────────────────────────

  describe('métodos permitidos', () => {
    it('deve aceitar .includes()', () => {
      expect(validateConditionExpression("__v0.includes('test')")).toEqual({ valid: true })
    })

    it('deve aceitar .startsWith()', () => {
      expect(validateConditionExpression("__v0.startsWith('abc')")).toEqual({ valid: true })
    })

    it('deve aceitar .endsWith()', () => {
      expect(validateConditionExpression("__v0.endsWith('xyz')")).toEqual({ valid: true })
    })

    it('deve aceitar .toString()', () => {
      expect(validateConditionExpression("__v0.toString() === '42'")).toEqual({ valid: true })
    })

    it('deve aceitar .toLowerCase()', () => {
      expect(validateConditionExpression("__v0.toLowerCase() === 'abc'")).toEqual({ valid: true })
    })

    it('deve aceitar .toUpperCase()', () => {
      expect(validateConditionExpression("__v0.toUpperCase() === 'ABC'")).toEqual({ valid: true })
    })

    it('deve aceitar .trim()', () => {
      expect(validateConditionExpression("__v0.trim() === 'hello'")).toEqual({ valid: true })
    })
  })

  // ── Acesso por bracket válido ──────────────────────────────────────────────

  describe('acesso por bracket', () => {
    it('deve aceitar acesso por índice numérico em variável', () => {
      expect(validateConditionExpression("__v0[0] === 'a'")).toEqual({ valid: true })
    })

    it('deve aceitar acesso por string literal com aspas simples', () => {
      expect(validateConditionExpression("__v0['name'] === 'test'")).toEqual({ valid: true })
    })

    it('deve aceitar acesso por string literal com aspas duplas', () => {
      expect(validateConditionExpression('__v0["name"] === "test"')).toEqual({ valid: true })
    })

    it('deve rejeitar bracket em variável não-workflow', () => {
      const result = validateConditionExpression("obj[0] === 'a'")
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('Bracket notation is only allowed on workflow variables')
    })

    it('deve rejeitar conteúdo perigoso dentro de brackets', () => {
      const result = validateConditionExpression("__v0[eval('x')]")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar array literal standalone (interceptado pela regra de vírgula)', () => {
      // DANGEROUS_PATTERNS intercepta a vírgula antes de checkBracketExpressions rodar
      const result = validateConditionExpression("[1, 2, 3]")
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('disallowed syntax')
    })
  })

  // ── Padrões perigosos: operadores de atribuição ────────────────────────────

  describe('bloqueio de operadores de atribuição', () => {
    it('deve rejeitar atribuição simples (=)', () => {
      const result = validateConditionExpression('__v0 = 42')
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('disallowed syntax')
    })

    it('deve rejeitar += ', () => {
      const result = validateConditionExpression('__v0 += 1')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar -=', () => {
      const result = validateConditionExpression('__v0 -= 1')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar *=', () => {
      const result = validateConditionExpression('__v0 *= 2')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar /=', () => {
      const result = validateConditionExpression('__v0 /= 2')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar %=', () => {
      const result = validateConditionExpression('__v0 %= 2')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar ^=', () => {
      const result = validateConditionExpression('__v0 ^= 1')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar |=', () => {
      const result = validateConditionExpression('__v0 |= 1')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar &=', () => {
      const result = validateConditionExpression('__v0 &= 1')
      expect(result.valid).toBe(false)
    })
  })

  // ── Padrões perigosos: execução de código ──────────────────────────────────

  describe('bloqueio de execução de código', () => {
    it('deve rejeitar eval()', () => {
      const result = validateConditionExpression("eval('malicious')")
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('disallowed syntax')
    })

    it('deve rejeitar Function()', () => {
      const result = validateConditionExpression("Function('return 1')()")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar import()', () => {
      const result = validateConditionExpression("import('fs')")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar require()', () => {
      const result = validateConditionExpression("require('fs')")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar new', () => {
      const result = validateConditionExpression('new Date()')
      expect(result.valid).toBe(false)
    })
  })

  // ── Padrões perigosos: globais ─────────────────────────────────────────────

  describe('bloqueio de globais perigosos', () => {
    it('deve rejeitar process', () => {
      const result = validateConditionExpression('process.env.SECRET')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar global', () => {
      const result = validateConditionExpression('global.something')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar window', () => {
      const result = validateConditionExpression('window.location')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar document', () => {
      const result = validateConditionExpression('document.cookie')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar constructor', () => {
      const result = validateConditionExpression('__v0.constructor')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar __proto__', () => {
      const result = validateConditionExpression('__v0.__proto__')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar prototype', () => {
      const result = validateConditionExpression('__v0.prototype')
      expect(result.valid).toBe(false)
    })
  })

  // ── Padrões perigosos: fluxo de controle ───────────────────────────────────

  describe('bloqueio de fluxo de controle', () => {
    it('deve rejeitar while', () => {
      const result = validateConditionExpression('while (true) {}')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar for', () => {
      const result = validateConditionExpression('for (let i = 0; i < 10; i++) {}')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar do', () => {
      const result = validateConditionExpression('do { } while (true)')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar switch', () => {
      const result = validateConditionExpression('switch (__v0) {}')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar try/catch/finally', () => {
      expect(validateConditionExpression('try { } catch (e) { }')).toHaveProperty('valid', false)
    })

    it('deve rejeitar throw', () => {
      const result = validateConditionExpression("throw new Error('x')")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar return', () => {
      const result = validateConditionExpression('return true')
      expect(result.valid).toBe(false)
    })
  })

  // ── Padrões perigosos: template literals, incremento, bitwise, etc. ────────

  describe('bloqueio de padrões diversos', () => {
    it('deve rejeitar template literals com expressões', () => {
      const result = validateConditionExpression('`hello ${__v0}`')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar incremento ++', () => {
      const result = validateConditionExpression('__v0++')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar decremento --', () => {
      const result = validateConditionExpression('__v0--')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar operadores bitwise <<', () => {
      const result = validateConditionExpression('__v0 << 2')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar operadores bitwise >>', () => {
      const result = validateConditionExpression('__v0 >> 2')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar operadores bitwise >>>', () => {
      const result = validateConditionExpression('__v0 >>> 2')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar ponto e vírgula (separador de statements)', () => {
      const result = validateConditionExpression("__v0 === 'a'; __v1 === 'b'")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar object literals', () => {
      const result = validateConditionExpression("{ key: 'value' }")
      expect(result.valid).toBe(false)
    })
  })

  // ── Métodos não permitidos ─────────────────────────────────────────────────

  describe('bloqueio de métodos não permitidos', () => {
    it('deve rejeitar .map() (interceptado pelo = do arrow function)', () => {
      // O `=>` contém `=` que casa com o padrão de atribuição antes de checkMethodCalls
      const result = validateConditionExpression('__v0.map(x => x)')
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('disallowed syntax')
    })

    it('deve rejeitar .map() sem arrow function', () => {
      // Sem arrow function, checkMethodCalls detecta o método
      const result = validateConditionExpression("__v0.map()")
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('Method "map" is not allowed')
    })

    it('deve rejeitar .forEach()', () => {
      const result = validateConditionExpression('__v0.forEach(console.log)')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar .exec()', () => {
      const result = validateConditionExpression("__v0.exec('test')")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar .replace()', () => {
      const result = validateConditionExpression("__v0.replace('a', 'b')")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar .split()', () => {
      const result = validateConditionExpression("__v0.split(',')")
      expect(result.valid).toBe(false)
    })
  })

  // ── Parênteses ─────────────────────────────────────────────────────────────

  describe('validação de parênteses', () => {
    it('deve rejeitar parênteses não balanceados (mais abertos)', () => {
      const result = validateConditionExpression('(__v0 === 1')
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('Unbalanced parentheses')
    })

    it('deve rejeitar parênteses não balanceados (mais fechados)', () => {
      const result = validateConditionExpression('__v0 === 1)')
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('Unbalanced parentheses')
    })

    it('deve aceitar parênteses aninhados corretamente', () => {
      expect(
        validateConditionExpression('((__v0 === 1) && (__v1 === 2))')
      ).toEqual({ valid: true })
    })
  })

  // ── Identificadores não autorizados ────────────────────────────────────────

  describe('identificadores não autorizados', () => {
    it('deve rejeitar identificador desconhecido', () => {
      const result = validateConditionExpression('myVar === 10')
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('Unknown identifier "myVar"')
    })

    it('deve rejeitar múltiplos identificadores desconhecidos', () => {
      const result = validateConditionExpression('foo === bar')
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('Unknown identifier')
    })
  })

  // ── Case insensitivity dos padrões perigosos ───────────────────────────────

  describe('case insensitivity dos padrões perigosos', () => {
    it('deve rejeitar EVAL em maiúsculas', () => {
      const result = validateConditionExpression("EVAL('x')")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar Window em mixed case', () => {
      const result = validateConditionExpression('Window.location')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar PROCESS em maiúsculas', () => {
      const result = validateConditionExpression('PROCESS.env')
      expect(result.valid).toBe(false)
    })
  })

  // ── Chamadas consecutivas (estabilidade com regex globais) ─────────────────

  describe('estabilidade com múltiplas chamadas consecutivas', () => {
    it('deve retornar resultados consistentes em chamadas consecutivas', () => {
      // Regex com flag /g mantém lastIndex, então precisamos validar o reset
      for (let i = 0; i < 5; i++) {
        expect(validateConditionExpression("__v0 === 'test'")).toEqual({ valid: true })
        expect(validateConditionExpression("eval('x')")).toHaveProperty('valid', false)
      }
    })
  })
})

// ─── preValidateConditionExpression ──────────────────────────────────────────

describe('preValidateConditionExpression', () => {
  it('deve rejeitar expressão vazia', () => {
    const result = preValidateConditionExpression('')
    expect(result).toEqual({ valid: false, error: 'Condition must be a non-empty string' })
  })

  it('deve rejeitar null', () => {
    const result = preValidateConditionExpression(null as unknown as string)
    expect(result).toEqual({ valid: false, error: 'Condition must be a non-empty string' })
  })

  it('deve rejeitar undefined', () => {
    const result = preValidateConditionExpression(undefined as unknown as string)
    expect(result).toEqual({ valid: false, error: 'Condition must be a non-empty string' })
  })

  it('deve rejeitar número (tipo inválido)', () => {
    const result = preValidateConditionExpression(42 as unknown as string)
    expect(result).toEqual({ valid: false, error: 'Condition must be a non-empty string' })
  })

  it('deve aceitar expressão segura', () => {
    expect(preValidateConditionExpression("{{@node1:Label.field}} === 'test'")).toEqual({ valid: true })
  })

  describe('deve detectar cada keyword perigosa', () => {
    const keywords = [
      'eval', 'Function', 'import', 'require', 'process',
      'global', 'window', 'document', '__proto__', 'constructor', 'prototype',
    ]

    for (const keyword of keywords) {
      it(`deve rejeitar keyword "${keyword}"`, () => {
        const result = preValidateConditionExpression(`${keyword}('test')`)
        expect(result.valid).toBe(false)
        expect((result as { error: string }).error).toContain('disallowed keyword')
      })
    }
  })

  it('deve ser case-insensitive na detecção de keywords', () => {
    expect(preValidateConditionExpression('EVAL()')).toHaveProperty('valid', false)
    expect(preValidateConditionExpression('Process.env')).toHaveProperty('valid', false)
    expect(preValidateConditionExpression('WINDOW.alert')).toHaveProperty('valid', false)
  })
})

// ─── sanitizeForDisplay ──────────────────────────────────────────────────────

describe('sanitizeForDisplay', () => {
  it('deve escapar < para &lt;', () => {
    expect(sanitizeForDisplay('<script>')).toBe('&lt;script&gt;')
  })

  it('deve escapar > para &gt;', () => {
    expect(sanitizeForDisplay('a > b')).toBe('a &gt; b')
  })

  it('deve escapar " para &quot;', () => {
    expect(sanitizeForDisplay('"hello"')).toBe('&quot;hello&quot;')
  })

  it("deve escapar ' para &#39;", () => {
    expect(sanitizeForDisplay("it's")).toBe('it&#39;s')
  })

  it('deve escapar múltiplos caracteres na mesma string', () => {
    expect(sanitizeForDisplay('<div class="test">it\'s</div>')).toBe(
      '&lt;div class=&quot;test&quot;&gt;it&#39;s&lt;/div&gt;'
    )
  })

  it('deve retornar string vazia para entrada vazia', () => {
    expect(sanitizeForDisplay('')).toBe('')
  })

  it('deve preservar texto sem caracteres especiais', () => {
    expect(sanitizeForDisplay('hello world 123')).toBe('hello world 123')
  })

  it('deve lidar com & (não mencionado no código, mas verifica ausência)', () => {
    // O código NÃO escapa & — verificamos o comportamento real
    expect(sanitizeForDisplay('a & b')).toBe('a & b')
  })
})
