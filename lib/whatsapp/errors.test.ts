import { describe, it, expect } from 'vitest'
import { MetaAPIError } from './errors'
import type { MetaErrorPayload } from './errors'

function makeError(overrides: Partial<MetaErrorPayload['error']> = {}): MetaErrorPayload['error'] {
  return {
    message: 'An error occurred',
    type: 'OAuthException',
    code: 100,
    fbtrace_id: 'trace123',
    ...overrides,
  }
}

describe('MetaAPIError', () => {
  // =========================================================================
  // Propriedades do construtor
  // =========================================================================
  describe('construtor', () => {
    it('deve definir name como "MetaAPIError"', () => {
      const error = new MetaAPIError(makeError())
      expect(error.name).toBe('MetaAPIError')
    })

    it('deve definir message a partir do payload', () => {
      const error = new MetaAPIError(makeError({ message: 'Custom error' }))
      expect(error.message).toBe('Custom error')
    })

    it('deve definir code, type e fbtrace_id', () => {
      const error = new MetaAPIError(makeError({ code: 190, type: 'OAuthException', fbtrace_id: 'abc' }))
      expect(error.code).toBe(190)
      expect(error.type).toBe('OAuthException')
      expect(error.fbtrace_id).toBe('abc')
    })

    it('deve definir subcode quando presente', () => {
      const error = new MetaAPIError(makeError({ error_subcode: 2388005 }))
      expect(error.subcode).toBe(2388005)
    })

    it('deve ter subcode undefined quando não presente', () => {
      const error = new MetaAPIError(makeError())
      expect(error.subcode).toBeUndefined()
    })

    it('deve definir userTitle quando presente', () => {
      const error = new MetaAPIError(makeError({ error_user_title: 'Título' }))
      expect(error.userTitle).toBe('Título')
    })

    it('deve ser instância de Error', () => {
      const error = new MetaAPIError(makeError())
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(MetaAPIError)
    })
  })

  // =========================================================================
  // Mapeamento de códigos de erro
  // =========================================================================
  describe('mapToUserMessage', () => {
    it('código 368 - bloqueio de spam/política', () => {
      const error = new MetaAPIError(makeError({ code: 368 }))
      expect(error.userMessage).toContain('Bloqueio de Política')
      expect(error.userMessage).toContain('Spam')
    })

    it('código 100 + subcode 2388005 - nome duplicado', () => {
      const error = new MetaAPIError(makeError({ code: 100, error_subcode: 2388005 }))
      expect(error.userMessage).toContain('Nome Duplicado')
    })

    it('código 100 + subcode 2388024 - template duplicado', () => {
      const error = new MetaAPIError(makeError({ code: 100, error_subcode: 2388024 }))
      expect(error.userMessage).toContain('Template Duplicado')
    })

    it('código 135000 - nome indisponível', () => {
      const error = new MetaAPIError(makeError({ code: 135000 }))
      expect(error.userMessage).toContain('Nome Indisponível')
    })

    it('código 100 + subcode 2388299 - variável na borda', () => {
      const error = new MetaAPIError(makeError({ code: 100, error_subcode: 2388299 }))
      expect(error.userMessage).toContain('Variável na borda')
    })

    it('código 100 + subcode 2388043 - erro de validação de exemplos', () => {
      const error = new MetaAPIError(makeError({ code: 100, error_subcode: 2388043 }))
      expect(error.userMessage).toContain('Erro de Validação')
      expect(error.userMessage).toContain('Exemplos de Variáveis')
    })

    it('código 100 com "does not exist" na mensagem - erro de configuração', () => {
      const error = new MetaAPIError(makeError({ code: 100, message: 'WABA does not exist' }))
      expect(error.userMessage).toContain('Erro de Configuração')
    })

    it('código 100 genérico - parâmetro inválido', () => {
      const error = new MetaAPIError(makeError({ code: 100, message: 'Invalid parameter' }))
      expect(error.userMessage).toContain('Parâmetro Inválido')
      expect(error.userMessage).toContain('Invalid parameter')
    })

    it('código 190 - erro de autenticação', () => {
      const error = new MetaAPIError(makeError({ code: 190 }))
      expect(error.userMessage).toContain('Erro de Autenticação')
      expect(error.userMessage).toContain('Token')
    })

    it('código 80007 - rate limit', () => {
      const error = new MetaAPIError(makeError({ code: 80007 }))
      expect(error.userMessage).toContain('Excesso de Requisições')
      expect(error.userMessage).toContain('Rate Limit')
    })

    it('código 200 - permissão negada', () => {
      const error = new MetaAPIError(makeError({ code: 200 }))
      expect(error.userMessage).toContain('Permissão Negada')
    })

    it('código desconhecido com error_user_msg - usa mensagem do usuário', () => {
      const error = new MetaAPIError(makeError({
        code: 999,
        error_user_msg: 'Mensagem personalizada da Meta',
      }))
      expect(error.userMessage).toBe('Mensagem personalizada da Meta')
    })

    it('código desconhecido sem error_user_msg - usa fallback genérico', () => {
      const error = new MetaAPIError(makeError({ code: 999, message: 'Unknown error' }))
      expect(error.userMessage).toBe('Erro Meta (999): Unknown error')
    })
  })

  // =========================================================================
  // Prioridade dos subcodes sobre code genérico
  // =========================================================================
  describe('prioridade de mapeamento', () => {
    it('subcode 2388005 tem prioridade sobre code 100 genérico', () => {
      const error = new MetaAPIError(makeError({ code: 100, error_subcode: 2388005 }))
      expect(error.userMessage).toContain('Nome Duplicado')
      expect(error.userMessage).not.toContain('Parâmetro Inválido')
    })

    it('código 368 é verificado antes de qualquer outro', () => {
      const error = new MetaAPIError(makeError({ code: 368, error_subcode: 2388005 }))
      expect(error.userMessage).toContain('Bloqueio de Política')
    })
  })
})
