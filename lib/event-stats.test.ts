import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  recordEvent,
  recordMessageSent,
  recordMessageDelivered,
  recordMessageRead,
  recordMessageFailed,
  computeCampaignStats,
  computeCampaignFunnel,
  getDashboardStats,
  clearCampaignEvents,
  pruneOldEvents,
  clearAllEvents,
} from './event-stats'

const STORAGE_KEY = 'smartzap_campaign_events'

beforeEach(() => {
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// recordEvent
// ---------------------------------------------------------------------------
describe('recordEvent', () => {
  it('stores an event in localStorage', () => {
    const event = recordEvent('camp-1', 'message.sent', { phone: '+5511999999999' })

    expect(event.id).toMatch(/^evt_/)
    expect(event.campaignId).toBe('camp-1')
    expect(event.type).toBe('message.sent')
    expect(event.data).toEqual({ phone: '+5511999999999' })

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored).toHaveLength(1)
  })

  it('appends multiple events', () => {
    recordEvent('camp-1', 'message.sent')
    recordEvent('camp-1', 'message.delivered')

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored).toHaveLength(2)
  })

  it('stores event without data', () => {
    const event = recordEvent('camp-1', 'campaign.started')
    expect(event.data).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------
describe('recordMessage* convenience wrappers', () => {
  it('recordMessageSent stores message.sent event', () => {
    recordMessageSent('camp-1', 'msg-1', '+5511999999999')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored[0].type).toBe('message.sent')
    expect(stored[0].data.messageId).toBe('msg-1')
    expect(stored[0].data.phone).toBe('+5511999999999')
  })

  it('recordMessageDelivered stores message.delivered event', () => {
    recordMessageDelivered('camp-1', 'msg-1', '+5511999999999')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored[0].type).toBe('message.delivered')
  })

  it('recordMessageRead stores message.read event', () => {
    recordMessageRead('camp-1', 'msg-1', '+5511999999999')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored[0].type).toBe('message.read')
  })

  it('recordMessageFailed stores message.failed event with error', () => {
    recordMessageFailed('camp-1', 'msg-1', '+5511999999999', 'timeout')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored[0].type).toBe('message.failed')
    expect(stored[0].data.error).toBe('timeout')
  })
})

// ---------------------------------------------------------------------------
// computeCampaignStats
// ---------------------------------------------------------------------------
describe('computeCampaignStats', () => {
  it('returns zero stats for unknown campaign', () => {
    const stats = computeCampaignStats('unknown')
    expect(stats.sent).toBe(0)
    expect(stats.delivered).toBe(0)
    expect(stats.read).toBe(0)
    expect(stats.failed).toBe(0)
    expect(stats.pending).toBe(0)
  })

  it('counts unique phones per status', () => {
    recordMessageSent('camp-1', 'msg-1', 'phone-a')
    recordMessageSent('camp-1', 'msg-2', 'phone-b')
    recordMessageDelivered('camp-1', 'msg-1', 'phone-a')

    const stats = computeCampaignStats('camp-1')
    expect(stats.sent).toBe(1)       // phone-b still "sent"
    expect(stats.delivered).toBe(1)  // phone-a upgraded to "delivered"
  })

  it('upgrades status: sent -> delivered -> read', () => {
    recordMessageSent('camp-1', 'msg-1', 'phone-a')
    recordMessageDelivered('camp-1', 'msg-1', 'phone-a')
    recordMessageRead('camp-1', 'msg-1', 'phone-a')

    const stats = computeCampaignStats('camp-1')
    expect(stats.sent).toBe(0)
    expect(stats.delivered).toBe(0)
    expect(stats.read).toBe(1)
  })

  it('does not downgrade: delivered ignores if already read', () => {
    recordMessageSent('camp-1', 'msg-1', 'phone-a')
    recordMessageRead('camp-1', 'msg-1', 'phone-a')
    // Delivered arrives late
    recordMessageDelivered('camp-1', 'msg-1', 'phone-a')

    const stats = computeCampaignStats('camp-1')
    expect(stats.read).toBe(1)
    expect(stats.delivered).toBe(0)
  })

  it('failed overwrites any previous status', () => {
    recordMessageSent('camp-1', 'msg-1', 'phone-a')
    recordMessageDelivered('camp-1', 'msg-1', 'phone-a')
    recordMessageFailed('camp-1', 'msg-1', 'phone-a', 'err')

    const stats = computeCampaignStats('camp-1')
    expect(stats.failed).toBe(1)
    expect(stats.delivered).toBe(0)
    expect(stats.sent).toBe(0)
  })

  it('isolates campaigns from each other', () => {
    recordMessageSent('camp-1', 'msg-1', 'phone-a')
    recordMessageSent('camp-2', 'msg-2', 'phone-b')

    expect(computeCampaignStats('camp-1').sent).toBe(1)
    expect(computeCampaignStats('camp-2').sent).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// computeCampaignFunnel
// ---------------------------------------------------------------------------
describe('computeCampaignFunnel', () => {
  it('returns basic funnel stages', () => {
    recordMessageSent('camp-1', 'msg-1', 'phone-a')
    recordMessageDelivered('camp-1', 'msg-1', 'phone-a')
    recordMessageSent('camp-1', 'msg-2', 'phone-b')

    const funnel = computeCampaignFunnel('camp-1', 10)

    const total = funnel.find(s => s.name === 'Total')
    expect(total?.count).toBe(10)
    expect(total?.percentage).toBe(100)

    const enviados = funnel.find(s => s.name === 'Enviados')
    // sent(phone-b) + delivered(phone-a) = 2 total sent
    expect(enviados?.count).toBe(2)

    const entregues = funnel.find(s => s.name === 'Entregues')
    expect(entregues?.count).toBe(1)
  })

  it('includes Falhas stage when there are failures', () => {
    recordMessageFailed('camp-1', 'msg-1', 'phone-a', 'err')

    const funnel = computeCampaignFunnel('camp-1', 5)
    const falhas = funnel.find(s => s.name === 'Falhas')
    expect(falhas).toBeDefined()
    expect(falhas?.count).toBe(1)
  })

  it('includes Pendentes stage when totalRecipients > processed', () => {
    recordMessageSent('camp-1', 'msg-1', 'phone-a')

    const funnel = computeCampaignFunnel('camp-1', 5)
    const pendentes = funnel.find(s => s.name === 'Pendentes')
    expect(pendentes).toBeDefined()
    expect(pendentes?.count).toBe(4)
  })

  it('handles zero totalRecipients', () => {
    const funnel = computeCampaignFunnel('camp-1', 0)
    const total = funnel.find(s => s.name === 'Total')
    expect(total?.count).toBe(0)
    expect(total?.percentage).toBe(100)
  })

  it('does not include Falhas/Pendentes when counts are 0', () => {
    const funnel = computeCampaignFunnel('empty', 0)
    expect(funnel.find(s => s.name === 'Falhas')).toBeUndefined()
    expect(funnel.find(s => s.name === 'Pendentes')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// getDashboardStats
// ---------------------------------------------------------------------------
describe('getDashboardStats', () => {
  it('returns zeroes when no events exist', () => {
    const stats = getDashboardStats()
    expect(stats.totalSent).toBe(0)
    expect(stats.totalDelivered).toBe(0)
    expect(stats.totalRead).toBe(0)
    expect(stats.totalFailed).toBe(0)
    expect(stats.deliveryRate).toBe(0)
    expect(stats.readRate).toBe(0)
  })

  it('aggregates stats across multiple campaigns', () => {
    recordMessageSent('camp-1', 'msg-1', 'phone-a')
    recordMessageDelivered('camp-1', 'msg-1', 'phone-a')
    recordMessageSent('camp-2', 'msg-2', 'phone-b')
    recordMessageRead('camp-2', 'msg-2', 'phone-b')

    const stats = getDashboardStats()
    // camp-1: delivered=1 (counts as sent+delivered), camp-2: read=1 (counts as sent+delivered+read)
    expect(stats.totalSent).toBe(2)       // delivered + read
    expect(stats.totalDelivered).toBe(2)  // delivered + read
    expect(stats.totalRead).toBe(1)
    expect(stats.totalFailed).toBe(0)
  })

  it('computes delivery rate and read rate', () => {
    recordMessageSent('camp-1', 'msg-1', 'phone-a')
    recordMessageDelivered('camp-1', 'msg-1', 'phone-a')
    recordMessageSent('camp-1', 'msg-2', 'phone-b')

    const stats = getDashboardStats()
    // totalSent = 2 (1 sent + 1 delivered), totalDelivered = 1
    expect(stats.deliveryRate).toBe(50)   // 1/2 * 100
    expect(stats.readRate).toBe(0)        // 0/1 * 100
  })
})

// ---------------------------------------------------------------------------
// clearCampaignEvents
// ---------------------------------------------------------------------------
describe('clearCampaignEvents', () => {
  it('removes only events for the specified campaign', () => {
    recordMessageSent('camp-1', 'msg-1', 'phone-a')
    recordMessageSent('camp-2', 'msg-2', 'phone-b')

    clearCampaignEvents('camp-1')

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored).toHaveLength(1)
    expect(stored[0].campaignId).toBe('camp-2')
  })

  it('does nothing for non-existent campaign', () => {
    recordMessageSent('camp-1', 'msg-1', 'phone-a')
    clearCampaignEvents('non-existent')

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// pruneOldEvents
// ---------------------------------------------------------------------------
describe('pruneOldEvents', () => {
  it('removes events older than specified days', () => {
    // Manually insert an old event
    const oldEvent = {
      id: 'evt_old',
      timestamp: Date.now() - 40 * 24 * 60 * 60 * 1000, // 40 days ago
      campaignId: 'camp-1',
      type: 'message.sent',
    }
    const recentEvent = {
      id: 'evt_recent',
      timestamp: Date.now(),
      campaignId: 'camp-1',
      type: 'message.sent',
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify([oldEvent, recentEvent]))

    const removed = pruneOldEvents(30)
    expect(removed).toBe(1)

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('evt_recent')
  })

  it('returns 0 when no old events exist', () => {
    recordMessageSent('camp-1', 'msg-1', 'phone-a')
    const removed = pruneOldEvents(30)
    expect(removed).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// clearAllEvents
// ---------------------------------------------------------------------------
describe('clearAllEvents', () => {
  it('removes all events from localStorage', () => {
    recordMessageSent('camp-1', 'msg-1', 'phone-a')
    recordMessageSent('camp-2', 'msg-2', 'phone-b')

    clearAllEvents()

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('is safe to call when no events exist', () => {
    clearAllEvents()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
