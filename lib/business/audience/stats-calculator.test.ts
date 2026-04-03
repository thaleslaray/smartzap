import { describe, it, expect, vi } from 'vitest'

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
  findTopTag,
  calculateAudienceStats,
  calculateAudienceSummary,
} from './stats-calculator'

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

const emptySuppressions = new Set<string>()

// =============================================================================
// findTopTag
// =============================================================================

describe('findTopTag', () => {
  it('returns null for empty array', () => {
    expect(findTopTag([])).toBeNull()
  })

  it('returns null when no contacts have tags', () => {
    const contacts = [makeContact({ tags: [] }), makeContact({ id: '2', tags: [] })]
    expect(findTopTag(contacts)).toBeNull()
  })

  it('returns the single tag when only one exists', () => {
    const contacts = [makeContact({ tags: ['vip'] })]
    expect(findTopTag(contacts)).toBe('vip')
  })

  it('returns the most common tag', () => {
    const contacts = [
      makeContact({ id: '1', tags: ['vip', 'lead'] }),
      makeContact({ id: '2', tags: ['lead'] }),
      makeContact({ id: '3', tags: ['lead', 'hot'] }),
    ]
    expect(findTopTag(contacts)).toBe('lead')
  })

  it('ignores empty/null tag strings', () => {
    const contacts = [
      makeContact({ id: '1', tags: ['', '  ', 'real'] }),
      makeContact({ id: '2', tags: ['real'] }),
    ]
    expect(findTopTag(contacts)).toBe('real')
  })

  it('handles contacts with undefined tags', () => {
    const contact = makeContact({ tags: undefined as unknown as string[] })
    expect(findTopTag([contact])).toBeNull()
  })

  it('preserves original tag case', () => {
    const contacts = [
      makeContact({ id: '1', tags: ['VIP'] }),
      makeContact({ id: '2', tags: ['VIP'] }),
    ]
    expect(findTopTag(contacts)).toBe('VIP')
  })
})

// =============================================================================
// calculateAudienceStats
// =============================================================================

describe('calculateAudienceStats', () => {
  it('returns zero stats for empty contacts', () => {
    const stats = calculateAudienceStats([], emptySuppressions)
    expect(stats.eligible).toBe(0)
    expect(stats.optInEligible).toBe(0)
    expect(stats.suppressed).toBe(0)
    expect(stats.topTagEligible).toBe(0)
    expect(stats.noTagsEligible).toBe(0)
    expect(stats.brUfCounts).toEqual([])
    expect(stats.tagCountsEligible).toEqual([])
    expect(stats.ddiCountsEligible).toEqual([])
    expect(stats.customFieldCountsEligible).toEqual([])
  })

  it('counts eligible OPT_IN contacts', () => {
    const contacts = [
      makeContact({ id: '1', status: ContactStatus.OPT_IN }),
      makeContact({ id: '2', status: ContactStatus.OPT_IN }),
    ]
    const stats = calculateAudienceStats(contacts, emptySuppressions)
    expect(stats.eligible).toBe(2)
    expect(stats.optInEligible).toBe(2)
  })

  it('excludes OPT_OUT contacts from eligible count', () => {
    const contacts = [
      makeContact({ id: '1', status: ContactStatus.OPT_IN }),
      makeContact({ id: '2', status: ContactStatus.OPT_OUT }),
    ]
    const stats = calculateAudienceStats(contacts, emptySuppressions)
    expect(stats.eligible).toBe(1)
    expect(stats.optInEligible).toBe(1)
  })

  it('includes UNKNOWN status in eligible but not optInEligible', () => {
    const contacts = [makeContact({ id: '1', status: ContactStatus.UNKNOWN })]
    const stats = calculateAudienceStats(contacts, emptySuppressions)
    expect(stats.eligible).toBe(1)
    expect(stats.optInEligible).toBe(0)
  })

  it('excludes suppressed phones and counts them', () => {
    const suppressed = new Set(['+5511999999999'])
    const contacts = [
      makeContact({ id: '1', phone: '+5511999999999' }),
      makeContact({ id: '2', phone: '+5521888888888' }),
    ]
    const stats = calculateAudienceStats(contacts, suppressed)
    expect(stats.suppressed).toBe(1)
    expect(stats.eligible).toBe(1)
  })

  it('counts suppressed but OPT_OUT contacts as suppressed only (skip before eligible count)', () => {
    const suppressed = new Set(['+5511999999999'])
    const contacts = [
      makeContact({ id: '1', phone: '+5511999999999', status: ContactStatus.OPT_OUT }),
    ]
    const stats = calculateAudienceStats(contacts, suppressed)
    // OPT_OUT is checked first, so contact is skipped before eligible increment
    // but suppressed count happens before OPT_OUT check
    expect(stats.suppressed).toBe(1)
    expect(stats.eligible).toBe(0)
  })

  it('counts contacts with no tags', () => {
    const contacts = [
      makeContact({ id: '1', tags: [] }),
      makeContact({ id: '2', tags: ['vip'] }),
    ]
    const stats = calculateAudienceStats(contacts, emptySuppressions)
    expect(stats.noTagsEligible).toBe(1)
  })

  it('counts topTag eligible contacts', () => {
    const contacts = [
      makeContact({ id: '1', tags: ['vip'] }),
      makeContact({ id: '2', tags: ['lead'] }),
      makeContact({ id: '3', tags: ['vip', 'lead'] }),
    ]
    const stats = calculateAudienceStats(contacts, emptySuppressions, 'vip')
    expect(stats.topTagEligible).toBe(2)
  })

  it('auto-computes topTag when not provided', () => {
    const contacts = [
      makeContact({ id: '1', tags: ['lead'] }),
      makeContact({ id: '2', tags: ['lead'] }),
      makeContact({ id: '3', tags: ['vip'] }),
    ]
    const stats = calculateAudienceStats(contacts, emptySuppressions)
    expect(stats.topTagEligible).toBe(2) // 'lead' is top tag
  })

  it('produces correct brUfCounts sorted descending', () => {
    const contacts = [
      makeContact({ id: '1', phone: '+5511999999999' }),
      makeContact({ id: '2', phone: '+5511888888888' }),
      makeContact({ id: '3', phone: '+5521777777777' }),
    ]
    const stats = calculateAudienceStats(contacts, emptySuppressions)
    expect(stats.brUfCounts).toEqual([
      { uf: 'SP', count: 2 },
      { uf: 'RJ', count: 1 },
    ])
  })

  it('produces correct ddiCounts sorted descending', () => {
    const contacts = [
      makeContact({ id: '1', phone: '+5511999999999' }),
      makeContact({ id: '2', phone: '+5521888888888' }),
      makeContact({ id: '3', phone: '+12025551234' }),
    ]
    const stats = calculateAudienceStats(contacts, emptySuppressions)
    expect(stats.ddiCountsEligible).toEqual([
      { ddi: '55', count: 2 },
      { ddi: '1', count: 1 },
    ])
  })

  it('produces correct tagCountsEligible sorted descending', () => {
    const contacts = [
      makeContact({ id: '1', tags: ['VIP', 'lead'] }),
      makeContact({ id: '2', tags: ['lead'] }),
      makeContact({ id: '3', tags: ['VIP'] }),
    ]
    const stats = calculateAudienceStats(contacts, emptySuppressions)
    // lead=2, VIP=2 but alphabetically lead < VIP
    expect(stats.tagCountsEligible.length).toBe(2)
    expect(stats.tagCountsEligible[0].count).toBe(2)
    expect(stats.tagCountsEligible[1].count).toBe(2)
  })

  it('produces correct customFieldCountsEligible', () => {
    const contacts = [
      makeContact({ id: '1', custom_fields: { city: 'São Paulo', age: '30' } }),
      makeContact({ id: '2', custom_fields: { city: 'Rio' } }),
      makeContact({ id: '3', custom_fields: { city: '' } }),
    ]
    const stats = calculateAudienceStats(contacts, emptySuppressions)
    expect(stats.customFieldCountsEligible).toEqual([
      { key: 'city', count: 2 },
      { key: 'age', count: 1 },
    ])
  })

  it('ignores custom fields with null/undefined/empty values', () => {
    const contacts = [
      makeContact({ id: '1', custom_fields: { a: null, b: undefined, c: '', d: 'ok' } }),
    ]
    const stats = calculateAudienceStats(contacts, emptySuppressions)
    expect(stats.customFieldCountsEligible).toEqual([{ key: 'd', count: 1 }])
  })

  it('handles contacts without custom_fields', () => {
    const contacts = [makeContact({ id: '1', custom_fields: undefined })]
    const stats = calculateAudienceStats(contacts, emptySuppressions)
    expect(stats.customFieldCountsEligible).toEqual([])
  })

  it('topTag matching is case-insensitive', () => {
    const contacts = [makeContact({ id: '1', tags: ['VIP'] })]
    const stats = calculateAudienceStats(contacts, emptySuppressions, 'vip')
    expect(stats.topTagEligible).toBe(1)
  })

  it('sorts brUfCounts alphabetically when counts are equal', () => {
    const contacts = [
      makeContact({ id: '1', phone: '+5511999999999' }),
      makeContact({ id: '2', phone: '+5521888888888' }),
    ]
    const stats = calculateAudienceStats(contacts, emptySuppressions)
    // Both have count=1, so sorted alphabetically: RJ before SP
    expect(stats.brUfCounts).toEqual([
      { uf: 'RJ', count: 1 },
      { uf: 'SP', count: 1 },
    ])
  })
})

// =============================================================================
// calculateAudienceSummary
// =============================================================================

describe('calculateAudienceSummary', () => {
  it('returns zero counts for empty contacts', () => {
    const summary = calculateAudienceSummary([], emptySuppressions)
    expect(summary).toEqual({
      eligible: 0,
      suppressed: 0,
      optedOut: 0,
      total: 0,
    })
  })

  it('counts eligible, suppressed, and opted-out correctly', () => {
    const suppressed = new Set(['+5521888888888'])
    const contacts = [
      makeContact({ id: '1', phone: '+5511999999999', status: ContactStatus.OPT_IN }),
      makeContact({ id: '2', phone: '+5521888888888', status: ContactStatus.OPT_IN }),
      makeContact({ id: '3', phone: '+5511777777777', status: ContactStatus.OPT_OUT }),
    ]
    const summary = calculateAudienceSummary(contacts, suppressed)
    expect(summary.eligible).toBe(1)
    expect(summary.suppressed).toBe(1)
    expect(summary.optedOut).toBe(1)
    expect(summary.total).toBe(3)
  })

  it('OPT_OUT is counted before suppression check', () => {
    const suppressed = new Set(['+5511999999999'])
    const contacts = [
      makeContact({ id: '1', phone: '+5511999999999', status: ContactStatus.OPT_OUT }),
    ]
    const summary = calculateAudienceSummary(contacts, suppressed)
    // OPT_OUT check comes first, so it's counted as optedOut, not suppressed
    expect(summary.optedOut).toBe(1)
    expect(summary.suppressed).toBe(0)
    expect(summary.eligible).toBe(0)
  })

  it('UNKNOWN contacts that are not suppressed are eligible', () => {
    const contacts = [makeContact({ id: '1', status: ContactStatus.UNKNOWN })]
    const summary = calculateAudienceSummary(contacts, emptySuppressions)
    expect(summary.eligible).toBe(1)
    expect(summary.total).toBe(1)
  })

  it('contact with empty phone is never suppressed', () => {
    const suppressed = new Set(['+5511999999999'])
    const contacts = [makeContact({ id: '1', phone: '' })]
    const summary = calculateAudienceSummary(contacts, suppressed)
    expect(summary.eligible).toBe(1)
    expect(summary.suppressed).toBe(0)
  })
})
