import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/phone-formatter', () => ({
  normalizePhoneNumber: (p: string) => {
    if (!p) return null
    const cleaned = p.replace(/\D/g, '')
    return cleaned.length >= 10 ? `+${cleaned}` : null
  },
  getCountryCallingCodeFromPhone: (p: string) => {
    if (!p) return null
    const cleaned = p.replace(/\D/g, '')
    if (cleaned.startsWith('55')) return '55'
    if (cleaned.startsWith('1')) return '1'
    return null
  },
}))

vi.mock('@/lib/br-geo', () => ({
  isBrazilPhone: (p: string) => p?.replace(/\D/g, '').startsWith('55') || false,
  getBrazilUfFromPhone: (p: string) => {
    const cleaned = p?.replace(/\D/g, '') || ''
    if (cleaned.startsWith('5511')) return 'SP'
    if (cleaned.startsWith('5521')) return 'RJ'
    return null
  },
}))

import { Contact, ContactStatus } from '@/types'
import {
  isContactEligible,
  filterContactsByCriteria,
  getContactIdsByCriteria,
  createDefaultCriteria,
  AudienceCriteria,
} from './criteria-validator'

// =============================================================================
// FIXTURES
// =============================================================================

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: '1',
    name: 'João',
    phone: '+5511999999999',
    email: '',
    status: ContactStatus.OPT_IN,
    tags: ['vip'],
    lastActive: '2024-01-01',
    custom_fields: {},
    ...overrides,
  }
}

function defaultCriteria(overrides: Partial<AudienceCriteria> = {}): AudienceCriteria {
  return {
    status: 'OPT_IN',
    includeTag: null,
    createdWithinDays: null,
    excludeOptOut: true,
    noTags: false,
    uf: null,
    ddi: null,
    customFieldKey: null,
    customFieldMode: null,
    customFieldValue: null,
    ...overrides,
  }
}

const emptySuppressions = new Set<string>()

// =============================================================================
// isContactEligible
// =============================================================================

describe('isContactEligible', () => {
  describe('hard rules', () => {
    it('rejects OPT_OUT contacts', () => {
      const contact = makeContact({ status: ContactStatus.OPT_OUT })
      const result = isContactEligible(contact, defaultCriteria({ status: 'ALL' }), emptySuppressions)
      expect(result).toEqual({ eligible: false, reason: 'OPTED_OUT' })
    })

    it('rejects suppressed phones', () => {
      const suppressed = new Set(['+5511999999999'])
      const contact = makeContact({ phone: '+5511999999999' })
      const result = isContactEligible(contact, defaultCriteria({ status: 'ALL' }), suppressed)
      expect(result).toEqual({ eligible: false, reason: 'SUPPRESSED' })
    })

    it('OPT_OUT is checked before suppression', () => {
      const suppressed = new Set(['+5511999999999'])
      const contact = makeContact({ phone: '+5511999999999', status: ContactStatus.OPT_OUT })
      const result = isContactEligible(contact, defaultCriteria({ status: 'ALL' }), suppressed)
      expect(result.reason).toBe('OPTED_OUT')
    })
  })

  describe('UF filter', () => {
    it('accepts contacts matching UF', () => {
      const contact = makeContact({ phone: '+5511999999999' })
      const result = isContactEligible(contact, defaultCriteria({ status: 'ALL', uf: 'SP' }), emptySuppressions)
      expect(result.eligible).toBe(true)
    })

    it('rejects contacts not matching UF', () => {
      const contact = makeContact({ phone: '+5511999999999' })
      const result = isContactEligible(contact, defaultCriteria({ status: 'ALL', uf: 'RJ' }), emptySuppressions)
      expect(result).toEqual({ eligible: false, reason: 'UF_MISMATCH' })
    })

    it('UF comparison is case-insensitive', () => {
      const contact = makeContact({ phone: '+5511999999999' })
      const result = isContactEligible(contact, defaultCriteria({ status: 'ALL', uf: 'sp' }), emptySuppressions)
      expect(result.eligible).toBe(true)
    })

    it('rejects non-BR phone when UF is set', () => {
      const contact = makeContact({ phone: '+12025551234' })
      const result = isContactEligible(contact, defaultCriteria({ status: 'ALL', uf: 'SP' }), emptySuppressions)
      expect(result).toEqual({ eligible: false, reason: 'UF_MISMATCH' })
    })
  })

  describe('DDI filter', () => {
    it('accepts contacts matching DDI', () => {
      const contact = makeContact({ phone: '+5511999999999' })
      const result = isContactEligible(contact, defaultCriteria({ status: 'ALL', ddi: '55' }), emptySuppressions)
      expect(result.eligible).toBe(true)
    })

    it('rejects contacts not matching DDI', () => {
      const contact = makeContact({ phone: '+5511999999999' })
      const result = isContactEligible(contact, defaultCriteria({ status: 'ALL', ddi: '1' }), emptySuppressions)
      expect(result).toEqual({ eligible: false, reason: 'DDI_MISMATCH' })
    })

    it('strips leading + from DDI criteria', () => {
      const contact = makeContact({ phone: '+5511999999999' })
      const result = isContactEligible(contact, defaultCriteria({ status: 'ALL', ddi: '+55' }), emptySuppressions)
      expect(result.eligible).toBe(true)
    })
  })

  describe('status filter', () => {
    it('accepts OPT_IN when status=OPT_IN', () => {
      const contact = makeContact({ status: ContactStatus.OPT_IN })
      const result = isContactEligible(contact, defaultCriteria({ status: 'OPT_IN' }), emptySuppressions)
      expect(result.eligible).toBe(true)
    })

    it('rejects UNKNOWN when status=OPT_IN', () => {
      const contact = makeContact({ status: ContactStatus.UNKNOWN })
      const result = isContactEligible(contact, defaultCriteria({ status: 'OPT_IN' }), emptySuppressions)
      expect(result).toEqual({ eligible: false, reason: 'STATUS_MISMATCH' })
    })

    it('accepts any non-OPT_OUT status when status=ALL', () => {
      const contact = makeContact({ status: ContactStatus.UNKNOWN })
      const result = isContactEligible(contact, defaultCriteria({ status: 'ALL' }), emptySuppressions)
      expect(result.eligible).toBe(true)
    })
  })

  describe('tags filter', () => {
    it('accepts contacts with matching includeTag', () => {
      const contact = makeContact({ tags: ['vip', 'lead'] })
      const result = isContactEligible(contact, defaultCriteria({ includeTag: 'vip' }), emptySuppressions)
      expect(result.eligible).toBe(true)
    })

    it('rejects contacts missing includeTag', () => {
      const contact = makeContact({ tags: ['lead'] })
      const result = isContactEligible(contact, defaultCriteria({ includeTag: 'vip' }), emptySuppressions)
      expect(result).toEqual({ eligible: false, reason: 'MISSING_TAG' })
    })

    it('includeTag matching is case-insensitive', () => {
      const contact = makeContact({ tags: ['VIP'] })
      const result = isContactEligible(contact, defaultCriteria({ includeTag: 'vip' }), emptySuppressions)
      expect(result.eligible).toBe(true)
    })

    it('accepts contacts with no tags when noTags=true', () => {
      const contact = makeContact({ tags: [] })
      const result = isContactEligible(contact, defaultCriteria({ noTags: true }), emptySuppressions)
      expect(result.eligible).toBe(true)
    })

    it('rejects contacts with tags when noTags=true', () => {
      const contact = makeContact({ tags: ['vip'] })
      const result = isContactEligible(contact, defaultCriteria({ noTags: true }), emptySuppressions)
      expect(result).toEqual({ eligible: false, reason: 'HAS_TAGS' })
    })
  })

  describe('custom field filter', () => {
    it('accepts when custom field exists (mode=exists)', () => {
      const contact = makeContact({ custom_fields: { city: 'SP' } })
      const criteria = defaultCriteria({ customFieldKey: 'city', customFieldMode: 'exists' })
      const result = isContactEligible(contact, criteria, emptySuppressions)
      expect(result.eligible).toBe(true)
    })

    it('rejects when custom field is missing (mode=exists)', () => {
      const contact = makeContact({ custom_fields: {} })
      const criteria = defaultCriteria({ customFieldKey: 'city', customFieldMode: 'exists' })
      const result = isContactEligible(contact, criteria, emptySuppressions)
      expect(result).toEqual({ eligible: false, reason: 'CUSTOM_FIELD_MISSING' })
    })

    it('rejects when custom field is empty string (mode=exists)', () => {
      const contact = makeContact({ custom_fields: { city: '' } })
      const criteria = defaultCriteria({ customFieldKey: 'city', customFieldMode: 'exists' })
      const result = isContactEligible(contact, criteria, emptySuppressions)
      expect(result).toEqual({ eligible: false, reason: 'CUSTOM_FIELD_MISSING' })
    })

    it('accepts when custom field equals value (mode=equals)', () => {
      const contact = makeContact({ custom_fields: { city: 'São Paulo' } })
      const criteria = defaultCriteria({
        customFieldKey: 'city',
        customFieldMode: 'equals',
        customFieldValue: 'São Paulo',
      })
      const result = isContactEligible(contact, criteria, emptySuppressions)
      expect(result.eligible).toBe(true)
    })

    it('equals comparison is case-insensitive', () => {
      const contact = makeContact({ custom_fields: { city: 'SÃO PAULO' } })
      const criteria = defaultCriteria({
        customFieldKey: 'city',
        customFieldMode: 'equals',
        customFieldValue: 'são paulo',
      })
      const result = isContactEligible(contact, criteria, emptySuppressions)
      expect(result.eligible).toBe(true)
    })

    it('rejects when custom field value does not match (mode=equals)', () => {
      const contact = makeContact({ custom_fields: { city: 'Rio' } })
      const criteria = defaultCriteria({
        customFieldKey: 'city',
        customFieldMode: 'equals',
        customFieldValue: 'SP',
      })
      const result = isContactEligible(contact, criteria, emptySuppressions)
      expect(result).toEqual({ eligible: false, reason: 'CUSTOM_FIELD_MISMATCH' })
    })

    it('rejects when equals mode has empty expected value', () => {
      const contact = makeContact({ custom_fields: { city: 'SP' } })
      const criteria = defaultCriteria({
        customFieldKey: 'city',
        customFieldMode: 'equals',
        customFieldValue: '',
      })
      const result = isContactEligible(contact, criteria, emptySuppressions)
      expect(result).toEqual({ eligible: false, reason: 'CUSTOM_FIELD_VALUE_MISSING' })
    })

    it('defaults to exists mode when customFieldMode is null', () => {
      const contact = makeContact({ custom_fields: { city: 'SP' } })
      const criteria = defaultCriteria({ customFieldKey: 'city', customFieldMode: null })
      const result = isContactEligible(contact, criteria, emptySuppressions)
      expect(result.eligible).toBe(true)
    })
  })

  describe('createdWithinDays filter', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('accepts contacts created within the time window', () => {
      const contact = makeContact({ createdAt: '2024-06-14T00:00:00Z' })
      const criteria = defaultCriteria({ createdWithinDays: 7 })
      const result = isContactEligible(contact, criteria, emptySuppressions)
      expect(result.eligible).toBe(true)
    })

    it('rejects contacts created before the time window', () => {
      const contact = makeContact({ createdAt: '2024-01-01T00:00:00Z' })
      const criteria = defaultCriteria({ createdWithinDays: 7 })
      const result = isContactEligible(contact, criteria, emptySuppressions)
      expect(result).toEqual({ eligible: false, reason: 'TOO_OLD' })
    })

    it('rejects contacts without createdAt', () => {
      const contact = makeContact({ createdAt: undefined })
      const criteria = defaultCriteria({ createdWithinDays: 7 })
      const result = isContactEligible(contact, criteria, emptySuppressions)
      expect(result).toEqual({ eligible: false, reason: 'MISSING_CREATED_AT' })
    })

    it('rejects contacts with invalid createdAt', () => {
      const contact = makeContact({ createdAt: 'not-a-date' })
      const criteria = defaultCriteria({ createdWithinDays: 7 })
      const result = isContactEligible(contact, criteria, emptySuppressions)
      expect(result).toEqual({ eligible: false, reason: 'INVALID_CREATED_AT' })
    })

    it('boundary: exactly at the window edge is rejected (> not >=)', () => {
      // 7 days in ms = 7*24*60*60*1000 = 604800000
      // now = 2024-06-15T12:00:00Z
      // 7 days ago exactly = 2024-06-08T12:00:00Z
      const contact = makeContact({ createdAt: '2024-06-08T11:59:59Z' })
      const criteria = defaultCriteria({ createdWithinDays: 7 })
      const result = isContactEligible(contact, criteria, emptySuppressions)
      // now - ts > withinMs => rejected
      expect(result.eligible).toBe(false)
    })
  })

  describe('combined criteria', () => {
    it('applies all criteria together', () => {
      const contact = makeContact({
        phone: '+5511999999999',
        status: ContactStatus.OPT_IN,
        tags: ['vip'],
        custom_fields: { city: 'SP' },
      })
      const criteria = defaultCriteria({
        status: 'OPT_IN',
        uf: 'SP',
        ddi: '55',
        includeTag: 'vip',
        customFieldKey: 'city',
        customFieldMode: 'exists',
      })
      const result = isContactEligible(contact, criteria, emptySuppressions)
      expect(result.eligible).toBe(true)
    })

    it('fails on first non-matching criterion', () => {
      const contact = makeContact({ phone: '+5521999999999' })
      const criteria = defaultCriteria({ uf: 'SP', includeTag: 'vip' })
      const result = isContactEligible(contact, criteria, emptySuppressions)
      // UF check comes before tag check
      expect(result.reason).toBe('UF_MISMATCH')
    })
  })
})

// =============================================================================
// filterContactsByCriteria
// =============================================================================

describe('filterContactsByCriteria', () => {
  it('returns only eligible contacts', () => {
    const contacts = [
      makeContact({ id: '1', status: ContactStatus.OPT_IN }),
      makeContact({ id: '2', status: ContactStatus.OPT_OUT }),
      makeContact({ id: '3', status: ContactStatus.OPT_IN }),
    ]
    const criteria = defaultCriteria({ status: 'OPT_IN' })
    const result = filterContactsByCriteria(contacts, criteria, emptySuppressions)
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.id)).toEqual(['1', '3'])
  })

  it('returns empty array when no contacts match', () => {
    const contacts = [makeContact({ id: '1', status: ContactStatus.OPT_OUT })]
    const result = filterContactsByCriteria(contacts, defaultCriteria(), emptySuppressions)
    expect(result).toEqual([])
  })
})

// =============================================================================
// getContactIdsByCriteria
// =============================================================================

describe('getContactIdsByCriteria', () => {
  it('returns IDs of eligible contacts', () => {
    const contacts = [
      makeContact({ id: 'a', status: ContactStatus.OPT_IN }),
      makeContact({ id: 'b', status: ContactStatus.OPT_OUT }),
      makeContact({ id: 'c', status: ContactStatus.OPT_IN }),
    ]
    const ids = getContactIdsByCriteria(contacts, defaultCriteria(), emptySuppressions)
    expect(ids).toEqual(['a', 'c'])
  })
})

// =============================================================================
// createDefaultCriteria
// =============================================================================

describe('createDefaultCriteria', () => {
  it('returns correct default values', () => {
    const criteria = createDefaultCriteria()
    expect(criteria).toEqual({
      status: 'OPT_IN',
      includeTag: null,
      createdWithinDays: null,
      excludeOptOut: true,
      noTags: false,
      uf: null,
      ddi: null,
      customFieldKey: null,
      customFieldMode: null,
      customFieldValue: null,
    })
  })

  it('returns a new object each time', () => {
    const a = createDefaultCriteria()
    const b = createDefaultCriteria()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})
