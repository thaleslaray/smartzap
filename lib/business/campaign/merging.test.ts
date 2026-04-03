import { CampaignStatus } from '@/types/campaign.types'
import type { Campaign, CampaignStats } from '@/types/campaign.types'
import {
  isCampaignReset,
  mergeCampaignCountersMonotonic,
  mergeMessageStatsMonotonic,
  type CampaignMessagesResponse,
} from './merging'

// =============================================================================
// Helpers
// =============================================================================

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'cmp_1',
    name: 'Test Campaign',
    status: CampaignStatus.SENDING,
    recipients: 100,
    sent: 50,
    delivered: 30,
    read: 10,
    skipped: 5,
    failed: 3,
    createdAt: '2025-01-01T00:00:00Z',
    templateName: 'test_template',
    ...overrides,
  }
}

function makeStatsResponse(
  stats: Partial<CampaignStats>,
  messages: unknown[] = []
): CampaignMessagesResponse {
  return {
    messages,
    stats: {
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      total: 0,
      ...stats,
    },
  }
}

// =============================================================================
// isCampaignReset
// =============================================================================

describe('isCampaignReset', () => {
  it('returns true for a reset campaign (DRAFT, no startedAt, all counters zero)', () => {
    const campaign = makeCampaign({
      status: CampaignStatus.DRAFT,
      startedAt: null,
      sent: 0,
      failed: 0,
      skipped: 0,
    })
    expect(isCampaignReset(campaign)).toBe(true)
  })

  it('returns false when status is not DRAFT', () => {
    const campaign = makeCampaign({
      status: CampaignStatus.SENDING,
      startedAt: null,
      sent: 0,
      failed: 0,
      skipped: 0,
    })
    expect(isCampaignReset(campaign)).toBe(false)
  })

  it('returns false when startedAt is set', () => {
    const campaign = makeCampaign({
      status: CampaignStatus.DRAFT,
      startedAt: '2025-01-01T12:00:00Z',
      sent: 0,
      failed: 0,
      skipped: 0,
    })
    expect(isCampaignReset(campaign)).toBe(false)
  })

  it('returns false when sent > 0', () => {
    const campaign = makeCampaign({
      status: CampaignStatus.DRAFT,
      startedAt: null,
      sent: 1,
      failed: 0,
      skipped: 0,
    })
    expect(isCampaignReset(campaign)).toBe(false)
  })

  it('returns false when failed > 0', () => {
    const campaign = makeCampaign({
      status: CampaignStatus.DRAFT,
      startedAt: null,
      sent: 0,
      failed: 1,
      skipped: 0,
    })
    expect(isCampaignReset(campaign)).toBe(false)
  })

  it('returns false when skipped > 0', () => {
    const campaign = makeCampaign({
      status: CampaignStatus.DRAFT,
      startedAt: null,
      sent: 0,
      failed: 0,
      skipped: 1,
    })
    expect(isCampaignReset(campaign)).toBe(false)
  })

  it('handles undefined startedAt as falsy', () => {
    const campaign = makeCampaign({
      status: CampaignStatus.DRAFT,
      sent: 0,
      failed: 0,
      skipped: 0,
    })
    // startedAt is undefined by default in makeCampaign
    delete (campaign as any).startedAt
    expect(isCampaignReset(campaign)).toBe(true)
  })
})

// =============================================================================
// mergeCampaignCountersMonotonic
// =============================================================================

describe('mergeCampaignCountersMonotonic', () => {
  it('returns freshCampaign when oldCampaign is undefined', () => {
    const fresh = makeCampaign({ sent: 10 })
    expect(mergeCampaignCountersMonotonic(undefined, fresh)).toBe(fresh)
  })

  it('returns oldCampaign when freshCampaign is undefined', () => {
    const old = makeCampaign({ sent: 10 })
    expect(mergeCampaignCountersMonotonic(old, undefined)).toBe(old)
  })

  it('returns undefined when both are undefined', () => {
    expect(mergeCampaignCountersMonotonic(undefined, undefined)).toBeUndefined()
  })

  it('keeps maximum of each counter (old > fresh)', () => {
    const old = makeCampaign({ sent: 50, failed: 3, skipped: 5, delivered: 30, read: 10, recipients: 100 })
    const fresh = makeCampaign({ sent: 40, failed: 5, skipped: 3, delivered: 25, read: 12, recipients: 100 })

    const merged = mergeCampaignCountersMonotonic(old, fresh)!
    expect(merged.sent).toBe(50)       // old was higher
    expect(merged.failed).toBe(5)      // fresh was higher
    expect(merged.skipped).toBe(5)     // old was higher
    expect(merged.delivered).toBe(30)  // old was higher
    expect(merged.read).toBe(12)       // fresh was higher
    expect(merged.recipients).toBe(100)
  })

  it('preserves non-counter fields from fresh campaign', () => {
    const old = makeCampaign({ name: 'Old Name', status: CampaignStatus.SENDING, sent: 50 })
    const fresh = makeCampaign({ name: 'New Name', status: CampaignStatus.COMPLETED, sent: 40 })

    const merged = mergeCampaignCountersMonotonic(old, fresh)!
    expect(merged.name).toBe('New Name')
    expect(merged.status).toBe(CampaignStatus.COMPLETED)
  })

  it('accepts fresh values when campaign is reset', () => {
    const old = makeCampaign({ sent: 50, failed: 3, skipped: 5, delivered: 30, read: 10 })
    const fresh = makeCampaign({
      status: CampaignStatus.DRAFT,
      startedAt: null,
      sent: 0,
      failed: 0,
      skipped: 0,
      delivered: 0,
      read: 0,
      recipients: 0,
    })

    const merged = mergeCampaignCountersMonotonic(old, fresh)!
    // Should accept the reset values, not keep old maxes
    expect(merged.sent).toBe(0)
    expect(merged.failed).toBe(0)
    expect(merged.skipped).toBe(0)
    expect(merged).toBe(fresh)
  })

  it('handles counters that are null/undefined (coerced via Number)', () => {
    const old = makeCampaign({ sent: 10 })
    const fresh = makeCampaign({ sent: undefined as unknown as number })

    const merged = mergeCampaignCountersMonotonic(old, fresh)!
    // Number(undefined || 0) = Number(0) = 0; max(10, 0) = 10
    expect(merged.sent).toBe(10)
  })

  it('handles string counters (coerced via Number)', () => {
    const old = makeCampaign({ sent: 10 })
    const fresh = makeCampaign({ sent: '15' as unknown as number })

    const merged = mergeCampaignCountersMonotonic(old, fresh)!
    expect(merged.sent).toBe(15)
  })
})

// =============================================================================
// mergeMessageStatsMonotonic
// =============================================================================

describe('mergeMessageStatsMonotonic', () => {
  it('returns oldData when freshData is undefined', () => {
    const old = makeStatsResponse({ sent: 10, total: 100 })
    expect(mergeMessageStatsMonotonic(old, undefined)).toBe(old)
  })

  it('returns freshData when oldData is undefined', () => {
    const fresh = makeStatsResponse({ sent: 10, total: 100 })
    expect(mergeMessageStatsMonotonic(undefined, fresh)).toBe(fresh)
  })

  it('returns undefined when both are undefined', () => {
    expect(mergeMessageStatsMonotonic(undefined, undefined)).toBeUndefined()
  })

  it('returns freshData when old has no stats', () => {
    const old: CampaignMessagesResponse = { messages: [] }
    const fresh = makeStatsResponse({ sent: 10, total: 100 })
    expect(mergeMessageStatsMonotonic(old, fresh)).toBe(fresh)
  })

  it('returns freshData when fresh has no stats', () => {
    const old = makeStatsResponse({ sent: 10, total: 100 })
    const fresh: CampaignMessagesResponse = { messages: [] }
    expect(mergeMessageStatsMonotonic(old, fresh)).toBe(fresh)
  })

  it('keeps maximum of each stat counter', () => {
    const old = makeStatsResponse({
      sent: 100,
      failed: 5,
      skipped: 3,
      delivered: 80,
      read: 50,
      total: 200,
    })
    const fresh = makeStatsResponse({
      sent: 95,
      failed: 8,
      skipped: 2,
      delivered: 85,
      read: 45,
      total: 200,
    })

    const merged = mergeMessageStatsMonotonic(old, fresh)!
    expect(merged.stats!.sent).toBe(100)
    expect(merged.stats!.failed).toBe(8)
    expect(merged.stats!.skipped).toBe(3)
    expect(merged.stats!.delivered).toBe(85)
    expect(merged.stats!.read).toBe(50)
    expect(merged.stats!.total).toBe(200)
  })

  it('recalculates pending as total - (sent + failed + skipped)', () => {
    const old = makeStatsResponse({ sent: 50, failed: 10, skipped: 5, total: 200 })
    const fresh = makeStatsResponse({ sent: 60, failed: 8, skipped: 7, total: 200 })

    const merged = mergeMessageStatsMonotonic(old, fresh)!
    // sent=60, failed=10, skipped=7, total=200 -> pending = 200 - 77 = 123
    expect(merged.stats!.sent).toBe(60)
    expect(merged.stats!.failed).toBe(10)
    expect(merged.stats!.skipped).toBe(7)
    const expectedPending = 200 - (60 + 10 + 7)
    expect((merged.stats as any).pending).toBe(expectedPending)
  })

  it('pending never goes below zero', () => {
    const old = makeStatsResponse({ sent: 100, failed: 50, skipped: 60, total: 100 })
    const fresh = makeStatsResponse({ sent: 100, failed: 50, skipped: 60, total: 100 })

    const merged = mergeMessageStatsMonotonic(old, fresh)!
    // 100 - (100+50+60) = -110, clamped to 0
    expect((merged.stats as any).pending).toBe(0)
  })

  it('preserves messages array from fresh data', () => {
    const old = makeStatsResponse({ sent: 10, total: 100 }, [{ id: 1 }])
    const fresh = makeStatsResponse({ sent: 15, total: 100 }, [{ id: 1 }, { id: 2 }])

    const merged = mergeMessageStatsMonotonic(old, fresh)!
    expect(merged.messages).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('preserves pagination from fresh data', () => {
    const old: CampaignMessagesResponse = {
      messages: [],
      stats: { sent: 10, delivered: 0, read: 0, failed: 0, total: 100 },
      pagination: { total: 100, limit: 50, offset: 0 },
    }
    const fresh: CampaignMessagesResponse = {
      messages: [],
      stats: { sent: 15, delivered: 0, read: 0, failed: 0, total: 100 },
      pagination: { total: 100, limit: 50, offset: 50 },
    }

    const merged = mergeMessageStatsMonotonic(old, fresh)!
    expect(merged.pagination).toEqual({ total: 100, limit: 50, offset: 50 })
  })

  it('handles null-ish stat values via Number coercion', () => {
    const old = makeStatsResponse({ sent: 10, total: 100 })
    const fresh: CampaignMessagesResponse = {
      messages: [],
      stats: { sent: undefined as unknown as number, delivered: 0, read: 0, failed: 0, total: 100 },
    }

    const merged = mergeMessageStatsMonotonic(old, fresh)!
    // Number(undefined || 0) = 0; max(10, 0) = 10
    expect(merged.stats!.sent).toBe(10)
  })
})
