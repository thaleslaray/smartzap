import { describe, it, expect } from 'vitest'
import {
  ContactStatus,
  STATUS_RULES,
  canReceiveMessages,
  getStatusLabel,
  getStatusColor,
  isBlockedStatus,
} from './status'

// =============================================================================
// ContactStatus enum
// =============================================================================

describe('ContactStatus enum', () => {
  it('deve ter exatamente 4 valores', () => {
    const values = Object.values(ContactStatus)
    expect(values).toHaveLength(4)
  })

  it('deve conter os valores corretos', () => {
    expect(ContactStatus.ACTIVE).toBe('ACTIVE')
    expect(ContactStatus.OPT_OUT).toBe('OPT_OUT')
    expect(ContactStatus.INVALID).toBe('INVALID')
    expect(ContactStatus.BLOCKED).toBe('BLOCKED')
  })
})

// =============================================================================
// STATUS_RULES
// =============================================================================

describe('STATUS_RULES', () => {
  it('CAN_RECEIVE contém apenas ACTIVE', () => {
    expect(STATUS_RULES.CAN_RECEIVE).toEqual([ContactStatus.ACTIVE])
  })

  it('BLOCKED_STATUSES contém OPT_OUT, INVALID e BLOCKED', () => {
    expect(STATUS_RULES.BLOCKED_STATUSES).toEqual([
      ContactStatus.OPT_OUT,
      ContactStatus.INVALID,
      ContactStatus.BLOCKED,
    ])
  })
})

// =============================================================================
// canReceiveMessages
// =============================================================================

describe('canReceiveMessages', () => {
  it('retorna true para ACTIVE', () => {
    expect(canReceiveMessages(ContactStatus.ACTIVE)).toBe(true)
  })

  it('retorna false para OPT_OUT', () => {
    expect(canReceiveMessages(ContactStatus.OPT_OUT)).toBe(false)
  })

  it('retorna false para INVALID', () => {
    expect(canReceiveMessages(ContactStatus.INVALID)).toBe(false)
  })

  it('retorna false para BLOCKED', () => {
    expect(canReceiveMessages(ContactStatus.BLOCKED)).toBe(false)
  })

  it('retorna false para valor desconhecido', () => {
    expect(canReceiveMessages('UNKNOWN' as ContactStatus)).toBe(false)
  })
})

// =============================================================================
// getStatusLabel
// =============================================================================

describe('getStatusLabel', () => {
  it('retorna "Ativo" para ACTIVE', () => {
    expect(getStatusLabel(ContactStatus.ACTIVE)).toBe('Ativo')
  })

  it('retorna "Opt-out" para OPT_OUT', () => {
    expect(getStatusLabel(ContactStatus.OPT_OUT)).toBe('Opt-out')
  })

  it('retorna "Invalido" para INVALID', () => {
    expect(getStatusLabel(ContactStatus.INVALID)).toBe('Invalido')
  })

  it('retorna "Bloqueado" para BLOCKED', () => {
    expect(getStatusLabel(ContactStatus.BLOCKED)).toBe('Bloqueado')
  })

  it('retorna o próprio valor como fallback para status desconhecido', () => {
    expect(getStatusLabel('XPTO' as ContactStatus)).toBe('XPTO')
  })
})

// =============================================================================
// getStatusColor
// =============================================================================

describe('getStatusColor', () => {
  it('retorna "green" para ACTIVE', () => {
    expect(getStatusColor(ContactStatus.ACTIVE)).toBe('green')
  })

  it('retorna "yellow" para OPT_OUT', () => {
    expect(getStatusColor(ContactStatus.OPT_OUT)).toBe('yellow')
  })

  it('retorna "red" para INVALID', () => {
    expect(getStatusColor(ContactStatus.INVALID)).toBe('red')
  })

  it('retorna "gray" para BLOCKED', () => {
    expect(getStatusColor(ContactStatus.BLOCKED)).toBe('gray')
  })

  it('retorna "gray" como fallback para status desconhecido', () => {
    expect(getStatusColor('XPTO' as ContactStatus)).toBe('gray')
  })
})

// =============================================================================
// isBlockedStatus
// =============================================================================

describe('isBlockedStatus', () => {
  it('retorna false para ACTIVE', () => {
    expect(isBlockedStatus(ContactStatus.ACTIVE)).toBe(false)
  })

  it('retorna true para OPT_OUT', () => {
    expect(isBlockedStatus(ContactStatus.OPT_OUT)).toBe(true)
  })

  it('retorna true para INVALID', () => {
    expect(isBlockedStatus(ContactStatus.INVALID)).toBe(true)
  })

  it('retorna true para BLOCKED', () => {
    expect(isBlockedStatus(ContactStatus.BLOCKED)).toBe(true)
  })

  it('retorna false para valor desconhecido', () => {
    expect(isBlockedStatus('XPTO' as ContactStatus)).toBe(false)
  })
})
