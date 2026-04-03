import { describe, it, expect } from 'vitest'

import {
  validatePhoneNumber,
  validateAnyPhoneNumber,
  normalizePhoneNumber,
  getCountryCallingCodeFromPhone,
  formatPhoneNumberDisplay,
  processPhoneNumber,
  getPhoneCountryInfo,
  validatePhoneNumbers,
} from './phone-formatter'

/**
 * Testes de casos extremos e formatos incomuns para phone-formatter.
 * Complementa os testes basicos de phone-formatter.test.ts
 */
describe('phone-formatter (edge cases)', () => {
  // ============================================================
  // normalizePhoneNumber - formatos incomuns
  // ============================================================
  describe('normalizePhoneNumber - formatos incomuns', () => {
    it('deve retornar string vazia para input vazio', () => {
      expect(normalizePhoneNumber('')).toBe('')
    })

    it('deve retornar string vazia para input so com caracteres especiais', () => {
      expect(normalizePhoneNumber('---')).toBe('')
      expect(normalizePhoneNumber('(  )')).toBe('')
    })

    it('deve normalizar numero com espacos e hifens', () => {
      const result = normalizePhoneNumber('+55 11 9 1234-5678')
      expect(result).toBe('+5511912345678')
    })

    it('deve normalizar numero BR com parenteses no DDD', () => {
      const result = normalizePhoneNumber('(21) 99876-5432')
      expect(result).toBe('+5521998765432')
    })

    it('deve lidar com prefixo 00 para numero internacional', () => {
      const result = normalizePhoneNumber('005511912345678')
      expect(result.startsWith('+55')).toBe(true)
    })

    it('deve aceitar numero apenas com digitos (13 digitos BR)', () => {
      const result = normalizePhoneNumber('5521999887766')
      expect(result).toBe('+5521999887766')
    })

    it('deve lidar com numero curto graciosamente', () => {
      // Numero muito curto - deve retornar algo sem quebrar
      const result = normalizePhoneNumber('123')
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('deve preservar + quando numero ja esta em E.164', () => {
      const result = normalizePhoneNumber('+5511912345678')
      expect(result).toBe('+5511912345678')
    })

    it('deve normalizar numero USA', () => {
      const result = normalizePhoneNumber('+12025551234')
      expect(result).toBe('+12025551234')
    })

    it('deve normalizar numero portugues', () => {
      const result = normalizePhoneNumber('+351912345678')
      expect(result).toBe('+351912345678')
    })

    it('deve lidar com numero contendo letras (ignorar letras)', () => {
      // Caracteres nao numericos (exceto +) sao removidos
      const result = normalizePhoneNumber('+55abc11912345678')
      expect(result).toBe('+5511912345678')
    })
  })

  // ============================================================
  // validatePhoneNumber - rejeicoes e aceites
  // ============================================================
  describe('validatePhoneNumber - validacoes detalhadas', () => {
    it('deve rejeitar string com apenas espacos', () => {
      const result = validatePhoneNumber('   ')
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('vazio')
    })

    it('deve rejeitar numero com formato invalido (letras)', () => {
      const result = validatePhoneNumber('abcdef')
      expect(result.isValid).toBe(false)
    })

    it('deve validar numero celular BR completo com +55', () => {
      const result = validatePhoneNumber('+5521999887766')
      expect(result.isValid).toBe(true)
      expect(result.metadata?.countryCallingCode).toBe('55')
      expect(result.metadata?.country).toBe('BR')
    })

    it('deve validar numero com pais diferente de BR (USA)', () => {
      const result = validatePhoneNumber('+12025551234', 'US')
      expect(result.isValid).toBe(true)
      expect(result.metadata?.countryCallingCode).toBe('1')
    })

    it('deve validar numero Portugal', () => {
      const result = validatePhoneNumber('+351912345678', 'PT')
      expect(result.isValid).toBe(true)
    })

    it('deve rejeitar numero com digitos a mais', () => {
      // Numero BR nao pode ter mais de 13 digitos (55 + DDD + 9 digitos)
      const result = validatePhoneNumber('+55219998877660000')
      expect(result.isValid).toBe(false)
    })

    it('deve incluir metadata quando valido', () => {
      const result = validatePhoneNumber('+5511912345678')
      expect(result.isValid).toBe(true)
      expect(result.metadata).toBeDefined()
      expect(result.metadata?.nationalNumber).toBeDefined()
    })
  })

  // ============================================================
  // validateAnyPhoneNumber - aceita fixos
  // ============================================================
  describe('validateAnyPhoneNumber - aceita fixo e celular', () => {
    it('deve aceitar numero fixo BR', () => {
      const result = validateAnyPhoneNumber('+551123456789')
      expect(result.isValid).toBe(true)
    })

    it('deve aceitar numero celular BR', () => {
      const result = validateAnyPhoneNumber('+5511912345678')
      expect(result.isValid).toBe(true)
    })

    it('deve rejeitar numero vazio', () => {
      const result = validateAnyPhoneNumber('')
      expect(result.isValid).toBe(false)
    })
  })

  // ============================================================
  // getCountryCallingCodeFromPhone
  // ============================================================
  describe('getCountryCallingCodeFromPhone - edge cases', () => {
    it('deve retornar null para string vazia', () => {
      expect(getCountryCallingCodeFromPhone('')).toBeNull()
    })

    it('deve retornar null para null/undefined convertido', () => {
      // A funcao faz String(phone || '') internamente
      expect(getCountryCallingCodeFromPhone(null as any)).toBeNull()
      expect(getCountryCallingCodeFromPhone(undefined as any)).toBeNull()
    })

    it('deve extrair DDI de numero USA', () => {
      expect(getCountryCallingCodeFromPhone('+12025551234')).toBe('1')
    })

    it('deve extrair DDI de numero Portugal', () => {
      expect(getCountryCallingCodeFromPhone('+351912345678')).toBe('351')
    })

    it('deve extrair DDI de numero Argentina', () => {
      expect(getCountryCallingCodeFromPhone('+5491112345678')).toBe('54')
    })
  })

  // ============================================================
  // formatPhoneNumberDisplay
  // ============================================================
  describe('formatPhoneNumberDisplay - formatos de saida', () => {
    it('deve formatar como nacional', () => {
      const result = formatPhoneNumberDisplay('+5511912345678', 'national')
      // Formato nacional BR: (11) 91234-5678
      expect(result).toContain('11')
    })

    it('deve formatar como internacional', () => {
      const result = formatPhoneNumberDisplay('+5511912345678', 'international')
      expect(result).toContain('+55')
    })

    it('deve retornar input original quando nao consegue parsear', () => {
      const result = formatPhoneNumberDisplay('invalido', 'e164')
      expect(result).toBe('invalido')
    })

    it('deve usar internacional como default', () => {
      const result = formatPhoneNumberDisplay('+5511912345678')
      expect(result).toContain('+55')
    })
  })

  // ============================================================
  // processPhoneNumber - pipeline completo
  // ============================================================
  describe('processPhoneNumber - pipeline', () => {
    it('deve normalizar e validar em um passo', () => {
      const result = processPhoneNumber('(11) 91234-5678')
      expect(result.normalized).toBe('+5511912345678')
      expect(result.validation.isValid).toBe(true)
    })

    it('deve retornar validacao false para numero invalido mas ainda normalizar', () => {
      const result = processPhoneNumber('123')
      expect(result.validation.isValid).toBe(false)
      // Normalizacao ainda tenta algo
      expect(typeof result.normalized).toBe('string')
    })
  })

  // ============================================================
  // getPhoneCountryInfo
  // ============================================================
  describe('getPhoneCountryInfo - info do pais', () => {
    it('deve retornar null para numero invalido', () => {
      const result = getPhoneCountryInfo('invalido')
      expect(result).toBeNull()
    })

    it('deve retornar info para numero USA', () => {
      const result = getPhoneCountryInfo('+12025551234')
      expect(result).not.toBeNull()
      expect(result?.callingCode).toBe('1')
      expect(result?.country).toBe('US')
    })

    it('deve retornar bandeira emoji para pais conhecido', () => {
      const result = getPhoneCountryInfo('+5511912345678')
      expect(result?.flag).toBeDefined()
      expect(result?.flag?.length).toBeGreaterThan(0)
    })
  })

  // ============================================================
  // validatePhoneNumbers - batch
  // ============================================================
  describe('validatePhoneNumbers - validacao em lote', () => {
    it('deve validar lista vazia', () => {
      const result = validatePhoneNumbers([])
      expect(result).toHaveLength(0)
    })

    it('deve processar lista com numeros validos e invalidos', () => {
      const result = validatePhoneNumbers(['+5511912345678', 'invalido', '+12025551234'])
      expect(result).toHaveLength(3)
      expect(result[0].validation.isValid).toBe(true)
      expect(result[1].validation.isValid).toBe(false)
      expect(result[2].validation.isValid).toBe(true)
    })

    it('deve incluir numero original em cada resultado', () => {
      const phones = ['+5511912345678', '(21) 99876-5432']
      const result = validatePhoneNumbers(phones)
      expect(result[0].phone).toBe('+5511912345678')
      expect(result[1].phone).toBe('(21) 99876-5432')
    })
  })
})
