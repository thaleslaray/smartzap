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
  AUDIENCE_PRESETS,
  getPresetConfig,
  getPresetCriteria,
  applyPreset,
  getPresetOptions,
  presetRequiresOptions,
} from './presets'

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
// AUDIENCE_PRESETS
// =============================================================================

describe('AUDIENCE_PRESETS', () => {
  it('has all expected preset keys', () => {
    const keys = Object.keys(AUDIENCE_PRESETS)
    expect(keys).toContain('all')
    expect(keys).toContain('opt_in')
    expect(keys).toContain('new_7d')
    expect(keys).toContain('tag_top')
    expect(keys).toContain('no_tags')
    expect(keys).toContain('manual')
  })

  it('does not include test preset', () => {
    expect(Object.keys(AUDIENCE_PRESETS)).not.toContain('test')
  })

  it('each preset has label, description, and criteria', () => {
    for (const [, config] of Object.entries(AUDIENCE_PRESETS)) {
      expect(config.label).toBeTruthy()
      expect(config.description).toBeTruthy()
      expect(config.criteria).toBeDefined()
      expect(config.criteria.status).toBeDefined()
    }
  })

  it('tag_top has requiresOptions=true', () => {
    expect(AUDIENCE_PRESETS.tag_top.requiresOptions).toBe(true)
  })
})

// =============================================================================
// getPresetConfig
// =============================================================================

describe('getPresetConfig', () => {
  it('returns config for valid preset', () => {
    const config = getPresetConfig('opt_in')
    expect(config).toBeDefined()
    expect(config!.label).toBe('Opt-in')
  })

  it('returns undefined for test preset', () => {
    expect(getPresetConfig('test')).toBeUndefined()
  })

  it('returns config for all known presets', () => {
    const presetIds = ['all', 'opt_in', 'new_7d', 'tag_top', 'no_tags', 'manual'] as const
    for (const id of presetIds) {
      expect(getPresetConfig(id)).toBeDefined()
    }
  })
})

// =============================================================================
// getPresetCriteria
// =============================================================================

describe('getPresetCriteria', () => {
  it('returns criteria for opt_in preset', () => {
    const criteria = getPresetCriteria('opt_in')
    expect(criteria.status).toBe('OPT_IN')
    expect(criteria.includeTag).toBeNull()
  })

  it('returns criteria for all preset with status=ALL', () => {
    const criteria = getPresetCriteria('all')
    expect(criteria.status).toBe('ALL')
  })

  it('returns criteria for new_7d with createdWithinDays=7', () => {
    const criteria = getPresetCriteria('new_7d')
    expect(criteria.createdWithinDays).toBe(7)
    expect(criteria.status).toBe('OPT_IN')
  })

  it('sets includeTag for tag_top when topTag provided', () => {
    const criteria = getPresetCriteria('tag_top', { topTag: 'VIP' })
    expect(criteria.includeTag).toBe('VIP')
    expect(criteria.status).toBe('OPT_IN')
  })

  it('does not set includeTag for tag_top without topTag', () => {
    const criteria = getPresetCriteria('tag_top')
    expect(criteria.includeTag).toBeNull()
  })

  it('returns noTags=true for no_tags preset', () => {
    const criteria = getPresetCriteria('no_tags')
    expect(criteria.noTags).toBe(true)
  })

  it('returns default criteria for test preset', () => {
    const criteria = getPresetCriteria('test')
    expect(criteria.status).toBe('OPT_IN')
  })

  it('returns a new object (not reference to original)', () => {
    const a = getPresetCriteria('opt_in')
    const b = getPresetCriteria('opt_in')
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

// =============================================================================
// applyPreset
// =============================================================================

describe('applyPreset', () => {
  const contacts = [
    makeContact({ id: '1', status: ContactStatus.OPT_IN, tags: ['vip'] }),
    makeContact({ id: '2', status: ContactStatus.OPT_IN, tags: ['lead'] }),
    makeContact({ id: '3', status: ContactStatus.OPT_OUT, tags: [] }),
    makeContact({ id: '4', status: ContactStatus.UNKNOWN, tags: [] }),
  ]

  it('applies opt_in preset and returns matching IDs', () => {
    const result = applyPreset('opt_in', contacts, emptySuppressions)
    expect(result.preset).toBe('opt_in')
    expect(result.contactIds).toEqual(['1', '2'])
    expect(result.fallbackPreset).toBeUndefined()
  })

  it('applies all preset (includes UNKNOWN, excludes OPT_OUT)', () => {
    const result = applyPreset('all', contacts, emptySuppressions)
    expect(result.contactIds).toContain('1')
    expect(result.contactIds).toContain('2')
    expect(result.contactIds).toContain('4')
    expect(result.contactIds).not.toContain('3')
  })

  it('applies no_tags preset', () => {
    const result = applyPreset('no_tags', contacts, emptySuppressions)
    // Only OPT_IN with no tags - contact 4 is UNKNOWN so excluded by status=OPT_IN
    expect(result.contactIds).toEqual([])
  })

  it('returns empty array for test preset', () => {
    const result = applyPreset('test', contacts, emptySuppressions)
    expect(result.preset).toBe('test')
    expect(result.contactIds).toEqual([])
  })

  it('returns empty array for manual preset', () => {
    const result = applyPreset('manual', contacts, emptySuppressions)
    expect(result.preset).toBe('manual')
    expect(result.contactIds).toEqual([])
  })

  it('tag_top without topTag falls back to opt_in', () => {
    const result = applyPreset('tag_top', contacts, emptySuppressions)
    expect(result.preset).toBe('tag_top')
    expect(result.fallbackPreset).toBe('opt_in')
    expect(result.contactIds).toEqual(['1', '2'])
  })

  it('tag_top with topTag filters by tag', () => {
    const result = applyPreset('tag_top', contacts, emptySuppressions, { topTag: 'vip' })
    expect(result.preset).toBe('tag_top')
    expect(result.fallbackPreset).toBeUndefined()
    expect(result.contactIds).toEqual(['1'])
  })

  it('excludes suppressed phones', () => {
    const suppressed = new Set(['+5511999999999'])
    const result = applyPreset('all', contacts, suppressed)
    // All contacts have the same phone, so all non-OPT_OUT are suppressed
    expect(result.contactIds).toEqual([])
  })

  describe('new_7d preset with fake timers', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('applies new_7d preset filtering by recent creation', () => {
      const recentContacts = [
        makeContact({ id: '1', createdAt: '2024-06-14T00:00:00Z', status: ContactStatus.OPT_IN }),
        makeContact({ id: '2', createdAt: '2024-01-01T00:00:00Z', status: ContactStatus.OPT_IN }),
      ]
      const result = applyPreset('new_7d', recentContacts, emptySuppressions)
      expect(result.contactIds).toEqual(['1'])
    })
  })
})

// =============================================================================
// getPresetOptions
// =============================================================================

describe('getPresetOptions', () => {
  it('returns options without test by default', () => {
    const options = getPresetOptions()
    const ids = options.map((o) => o.id)
    expect(ids).not.toContain('test')
    expect(ids).toContain('all')
    expect(ids).toContain('opt_in')
    expect(ids).toContain('manual')
  })

  it('includes test when includeTest=true', () => {
    const options = getPresetOptions(true)
    const ids = options.map((o) => o.id)
    expect(ids).toContain('test')
  })

  it('each option has id, label, and description', () => {
    const options = getPresetOptions()
    for (const opt of options) {
      expect(opt.id).toBeTruthy()
      expect(opt.label).toBeTruthy()
      expect(opt.description).toBeTruthy()
    }
  })

  it('test option has correct label', () => {
    const options = getPresetOptions(true)
    const testOpt = options.find((o) => o.id === 'test')
    expect(testOpt?.label).toBe('Contato de Teste')
  })
})

// =============================================================================
// presetRequiresOptions
// =============================================================================

describe('presetRequiresOptions', () => {
  it('returns true for tag_top', () => {
    expect(presetRequiresOptions('tag_top')).toBe(true)
  })

  it('returns false for opt_in', () => {
    expect(presetRequiresOptions('opt_in')).toBe(false)
  })

  it('returns false for test', () => {
    expect(presetRequiresOptions('test')).toBe(false)
  })

  it('returns false for all standard presets except tag_top', () => {
    const standardPresets = ['all', 'opt_in', 'new_7d', 'no_tags', 'manual'] as const
    for (const preset of standardPresets) {
      expect(presetRequiresOptions(preset)).toBe(false)
    }
  })
})
