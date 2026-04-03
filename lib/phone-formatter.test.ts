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

describe('phone-formatter', () => {
  it('deve rejeitar número vazio', () => {
    const result = validatePhoneNumber('')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('não pode ser vazio')
  })

  it('deve validar número móvel BR em formato internacional', () => {
    const result = validatePhoneNumber('+55 11 91234-5678')
    expect(result.isValid).toBe(true)
    expect(result.metadata?.countryCallingCode).toBe('55')
  })

  it('deve aceitar número quando tipo não pode ser determinado', () => {
    // libphonenumber-js retorna undefined para getType() em alguns números fixos BR
    // Comportamento seguro: aceitar quando não consegue determinar tipo
    const result = validatePhoneNumber('+55 11 2345-6789')
    expect(result.isValid).toBe(true)
  })

  it('deve aceitar número fixo quando validação é geral', () => {
    const result = validateAnyPhoneNumber('+55 11 2345-6789')
    expect(result.isValid).toBe(true)
  })

  it('deve normalizar número com prefixo 00', () => {
    const normalized = normalizePhoneNumber('0055219912345678')
    expect(normalized.startsWith('+55')).toBe(true)
  })

  it('deve normalizar número BR sem DDI para E.164', () => {
    const normalized = normalizePhoneNumber('(11) 91234-5678')
    expect(normalized).toBe('+5511912345678')
  })

  it('deve extrair DDI corretamente', () => {
    const code = getCountryCallingCodeFromPhone('+5511912345678')
    expect(code).toBe('55')
  })

  it('deve formatar para E.164 quando solicitado', () => {
    const formatted = formatPhoneNumberDisplay('+55 11 91234-5678', 'e164')
    expect(formatted).toBe('+5511912345678')
  })

  it('deve processar número com validação e normalização', () => {
    const result = processPhoneNumber('11 91234-5678')
    expect(result.normalized).toBe('+5511912345678')
    expect(result.validation.isValid).toBe(true)
  })

  it('deve retornar info do país quando possível', () => {
    const info = getPhoneCountryInfo('+5511912345678')
    expect(info?.callingCode).toBe('55')
    expect(info?.flag).toBe('🇧🇷')
  })

  it('deve validar lista de números', () => {
    const list = validatePhoneNumbers(['+5511912345678', '0055219912345678'])
    expect(list).toHaveLength(2)
    expect(list[0].normalized).toBe('+5511912345678')
  })
})
