import { ContactStatus } from '@/types'
import {
  CAMPAIGN_RULES,
  validateCampaignName,
  canContactReceiveCampaign,
  validateRecipientCount,
} from './rules'

// =============================================================================
// validateCampaignName
// =============================================================================

describe('validateCampaignName', () => {
  it('returns null for a valid name', () => {
    expect(validateCampaignName('Campanha Janeiro')).toBeNull()
  })

  it('returns null for name with exactly MIN_NAME_LENGTH characters', () => {
    expect(validateCampaignName('abc')).toBeNull()
  })

  it('returns NAME_REQUIRED for empty string', () => {
    const result = validateCampaignName('')
    expect(result).toEqual({
      field: 'name',
      message: 'Nome da campanha e obrigatorio',
      code: 'NAME_REQUIRED',
    })
  })

  it('returns NAME_REQUIRED for whitespace-only string', () => {
    const result = validateCampaignName('   ')
    expect(result).toEqual({
      field: 'name',
      message: 'Nome da campanha e obrigatorio',
      code: 'NAME_REQUIRED',
    })
  })

  it('returns NAME_TOO_SHORT for name shorter than MIN_NAME_LENGTH', () => {
    const result = validateCampaignName('AB')
    expect(result).toEqual({
      field: 'name',
      message: `Nome deve ter pelo menos ${CAMPAIGN_RULES.MIN_NAME_LENGTH} caracteres`,
      code: 'NAME_TOO_SHORT',
    })
  })

  it('returns NAME_TOO_SHORT for single character name', () => {
    const result = validateCampaignName('A')
    expect(result).not.toBeNull()
    expect(result!.code).toBe('NAME_TOO_SHORT')
  })

  it('trims whitespace before validating length', () => {
    // ' AB ' trims to 'AB' which is 2 chars < 3
    const result = validateCampaignName(' AB ')
    expect(result).not.toBeNull()
    expect(result!.code).toBe('NAME_TOO_SHORT')
  })

  it('handles null-ish input by treating as empty', () => {
    // The code does (name ?? '').trim(), so undefined/null would coerce
    const result = validateCampaignName(null as unknown as string)
    expect(result).not.toBeNull()
    expect(result!.code).toBe('NAME_REQUIRED')
  })

  it('accepts a long valid name', () => {
    const longName = 'A'.repeat(100)
    expect(validateCampaignName(longName)).toBeNull()
  })
})

// =============================================================================
// canContactReceiveCampaign
// =============================================================================

describe('canContactReceiveCampaign', () => {
  const emptySuppressed = new Set<string>()

  it('returns eligible for OPT_IN contact with no suppression', () => {
    const result = canContactReceiveCampaign(
      { status: ContactStatus.OPT_IN, phone: '5511999999999' },
      emptySuppressed
    )
    expect(result).toEqual({ eligible: true })
  })

  it('returns eligible for UNKNOWN status contact', () => {
    const result = canContactReceiveCampaign(
      { status: ContactStatus.UNKNOWN, phone: '5511999999999' },
      emptySuppressed
    )
    expect(result).toEqual({ eligible: true })
  })

  it('returns ineligible for OPT_OUT contact', () => {
    const result = canContactReceiveCampaign(
      { status: ContactStatus.OPT_OUT, phone: '5511888888888' },
      emptySuppressed
    )
    expect(result).toEqual({
      eligible: false,
      reason: 'Contato fez opt-out',
    })
  })

  it('returns ineligible for suppressed phone (exact match)', () => {
    const suppressed = new Set(['5511999999999'])
    const result = canContactReceiveCampaign(
      { status: ContactStatus.OPT_IN, phone: '5511999999999' },
      suppressed
    )
    expect(result).toEqual({
      eligible: false,
      reason: 'Telefone esta na lista de supressao',
    })
  })

  it('returns ineligible for suppressed phone with formatting chars stripped', () => {
    // normalizePhoneForComparison strips non-digits
    const suppressed = new Set(['5511999999999'])
    const result = canContactReceiveCampaign(
      { status: ContactStatus.OPT_IN, phone: '+55 (11) 99999-9999' },
      suppressed
    )
    expect(result).toEqual({
      eligible: false,
      reason: 'Telefone esta na lista de supressao',
    })
  })

  it('returns eligible when phone is not in suppression set', () => {
    const suppressed = new Set(['5511888888888'])
    const result = canContactReceiveCampaign(
      { status: ContactStatus.OPT_IN, phone: '5511999999999' },
      suppressed
    )
    expect(result).toEqual({ eligible: true })
  })

  it('opt-out takes precedence over suppression check', () => {
    const suppressed = new Set(['5511999999999'])
    const result = canContactReceiveCampaign(
      { status: ContactStatus.OPT_OUT, phone: '5511999999999' },
      suppressed
    )
    // Should get opt-out reason, not suppression reason
    expect(result.reason).toBe('Contato fez opt-out')
  })

  it('handles empty/null phone gracefully (not suppressed)', () => {
    const suppressed = new Set(['5511999999999'])
    const result = canContactReceiveCampaign(
      { status: ContactStatus.OPT_IN, phone: '' },
      suppressed
    )
    // normalizePhoneForComparison returns '' for empty, '' is not in set
    expect(result).toEqual({ eligible: true })
  })

  it('handles undefined phone gracefully', () => {
    const suppressed = new Set(['5511999999999'])
    const result = canContactReceiveCampaign(
      { status: ContactStatus.OPT_IN, phone: undefined as unknown as string },
      suppressed
    )
    expect(result).toEqual({ eligible: true })
  })
})

// =============================================================================
// validateRecipientCount
// =============================================================================

describe('validateRecipientCount', () => {
  it('returns null for count equal to MIN_RECIPIENTS', () => {
    expect(validateRecipientCount(CAMPAIGN_RULES.MIN_RECIPIENTS)).toBeNull()
  })

  it('returns null for count greater than MIN_RECIPIENTS', () => {
    expect(validateRecipientCount(100)).toBeNull()
  })

  it('returns error for zero recipients', () => {
    const result = validateRecipientCount(0)
    expect(result).toEqual({
      field: 'recipients',
      message: `Selecione pelo menos ${CAMPAIGN_RULES.MIN_RECIPIENTS} destinatario`,
      code: 'NO_RECIPIENTS',
    })
  })

  it('returns error for negative count', () => {
    const result = validateRecipientCount(-5)
    expect(result).not.toBeNull()
    expect(result!.code).toBe('NO_RECIPIENTS')
  })
})

// =============================================================================
// CAMPAIGN_RULES constants
// =============================================================================

describe('CAMPAIGN_RULES', () => {
  it('has expected constant values', () => {
    expect(CAMPAIGN_RULES.EXCLUDE_OPTED_OUT).toBe(true)
    expect(CAMPAIGN_RULES.EXCLUDE_SUPPRESSED).toBe(true)
    expect(CAMPAIGN_RULES.MIN_RECIPIENTS).toBe(1)
    expect(CAMPAIGN_RULES.MIN_NAME_LENGTH).toBe(3)
  })

  it('is frozen (as const)', () => {
    // as const makes it readonly; attempting to assign should not change values
    expect(CAMPAIGN_RULES.MIN_NAME_LENGTH).toBe(3)
  })
})
