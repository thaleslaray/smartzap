import { MessageStatus } from '@/types'
import type { Message } from '@/types'
import {
  filterMessages,
  getMessageStatusCounts,
  calculateRealStats,
  type MessageFilterCriteria,
} from './message-filtering'

// =============================================================================
// Helpers
// =============================================================================

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg_1',
    campaignId: 'cmp_1',
    contactName: 'Joao Silva',
    contactPhone: '5511999999999',
    status: MessageStatus.SENT,
    sentAt: '2025-06-15T12:00:00Z',
    ...overrides,
  }
}

function makeMixedMessages(): Message[] {
  return [
    makeMessage({ id: '1', status: MessageStatus.SENT, contactName: 'Alice', contactPhone: '5511111111111' }),
    makeMessage({ id: '2', status: MessageStatus.DELIVERED, contactName: 'Bob', contactPhone: '5522222222222' }),
    makeMessage({ id: '3', status: MessageStatus.READ, contactName: 'Carlos', contactPhone: '5533333333333' }),
    makeMessage({ id: '4', status: MessageStatus.FAILED, contactName: 'Diana', contactPhone: '5544444444444' }),
    makeMessage({ id: '5', status: MessageStatus.PENDING, contactName: 'Eduardo', contactPhone: '5555555555555' }),
    makeMessage({ id: '6', status: MessageStatus.SKIPPED, contactName: 'Fernanda', contactPhone: '5566666666666' }),
    makeMessage({ id: '7', status: MessageStatus.SENT, contactName: 'Gustavo', contactPhone: '5577777777777' }),
    makeMessage({ id: '8', status: MessageStatus.DELIVERED, contactName: 'Helena', contactPhone: '5588888888888' }),
  ]
}

// =============================================================================
// filterMessages
// =============================================================================

describe('filterMessages', () => {
  it('returns all messages when no filters applied', () => {
    const messages = makeMixedMessages()
    const result = filterMessages(messages, {})
    expect(result).toEqual(messages)
  })

  it('returns all messages when status is "all"', () => {
    const messages = makeMixedMessages()
    const result = filterMessages(messages, { status: 'all' })
    expect(result).toEqual(messages)
  })

  it('returns empty array for empty input', () => {
    expect(filterMessages([], { status: 'sent' })).toEqual([])
  })

  it('returns empty array for null-ish input', () => {
    expect(filterMessages(null as unknown as Message[], {})).toEqual([])
  })

  it('filters by status: sent', () => {
    const messages = makeMixedMessages()
    const result = filterMessages(messages, { status: 'sent' })
    expect(result).toHaveLength(2) // Alice, Gustavo
    expect(result.every(m => m.status === MessageStatus.SENT)).toBe(true)
  })

  it('filters by status: delivered', () => {
    const messages = makeMixedMessages()
    const result = filterMessages(messages, { status: 'delivered' })
    expect(result).toHaveLength(2) // Bob, Helena
    expect(result.every(m => m.status === MessageStatus.DELIVERED)).toBe(true)
  })

  it('filters by status: read', () => {
    const messages = makeMixedMessages()
    const result = filterMessages(messages, { status: 'read' })
    expect(result).toHaveLength(1) // Carlos
  })

  it('filters by status: failed', () => {
    const messages = makeMixedMessages()
    const result = filterMessages(messages, { status: 'failed' })
    expect(result).toHaveLength(1) // Diana
  })

  it('filters by status: pending', () => {
    const messages = makeMixedMessages()
    const result = filterMessages(messages, { status: 'pending' })
    expect(result).toHaveLength(1) // Eduardo
  })

  it('filters by status: skipped', () => {
    const messages = makeMixedMessages()
    const result = filterMessages(messages, { status: 'skipped' })
    expect(result).toHaveLength(1) // Fernanda
  })

  it('filters by search term matching contact name (case-insensitive)', () => {
    const messages = makeMixedMessages()
    const result = filterMessages(messages, { searchTerm: 'alice' })
    expect(result).toHaveLength(1)
    expect(result[0].contactName).toBe('Alice')
  })

  it('filters by search term matching contact name (partial match)', () => {
    const messages = makeMixedMessages()
    const result = filterMessages(messages, { searchTerm: 'ar' })
    // Carlos and Eduardo both contain 'ar'? Carlos does. Eduardo doesn't. Fernanda has 'nda'.
    expect(result.some(m => m.contactName === 'Carlos')).toBe(true)
  })

  it('filters by search term matching phone number', () => {
    const messages = makeMixedMessages()
    const result = filterMessages(messages, { searchTerm: '5511' })
    expect(result).toHaveLength(1) // Alice with 5511111111111
  })

  it('combines status and search term filters', () => {
    const messages = makeMixedMessages()
    const result = filterMessages(messages, { status: 'sent', searchTerm: 'Alice' })
    expect(result).toHaveLength(1)
    expect(result[0].contactName).toBe('Alice')
  })

  it('returns empty when combined filters match nothing', () => {
    const messages = makeMixedMessages()
    const result = filterMessages(messages, { status: 'failed', searchTerm: 'Alice' })
    expect(result).toHaveLength(0)
  })

  it('phone search is case-sensitive (digits only, no difference)', () => {
    const messages = [makeMessage({ contactPhone: '+55 11 99999-9999' })]
    const result = filterMessages(messages, { searchTerm: '+55 11' })
    expect(result).toHaveLength(1)
  })

  it('returns same reference when fast path (no filters)', () => {
    const messages = makeMixedMessages()
    const result = filterMessages(messages, { status: 'all' })
    expect(result).toBe(messages)
  })
})

// =============================================================================
// getMessageStatusCounts
// =============================================================================

describe('getMessageStatusCounts', () => {
  it('counts all statuses correctly', () => {
    const messages = makeMixedMessages()
    const counts = getMessageStatusCounts(messages)
    expect(counts).toEqual({
      all: 8,
      sent: 2,
      delivered: 2,
      read: 1,
      failed: 1,
      pending: 1,
      skipped: 1,
    })
  })

  it('returns all zeros for empty array', () => {
    const counts = getMessageStatusCounts([])
    expect(counts).toEqual({
      all: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      pending: 0,
      skipped: 0,
    })
  })

  it('returns all zeros for null input', () => {
    const counts = getMessageStatusCounts(null as unknown as Message[])
    expect(counts).toEqual({
      all: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      pending: 0,
      skipped: 0,
    })
  })

  it('counts correctly with single status', () => {
    const messages = [
      makeMessage({ id: '1', status: MessageStatus.FAILED }),
      makeMessage({ id: '2', status: MessageStatus.FAILED }),
      makeMessage({ id: '3', status: MessageStatus.FAILED }),
    ]
    const counts = getMessageStatusCounts(messages)
    expect(counts.all).toBe(3)
    expect(counts.failed).toBe(3)
    expect(counts.sent).toBe(0)
  })

  it('handles messages with unknown status (no crash)', () => {
    const messages = [
      makeMessage({ id: '1', status: 'UNKNOWN_STATUS' as MessageStatus }),
      makeMessage({ id: '2', status: MessageStatus.SENT }),
    ]
    const counts = getMessageStatusCounts(messages)
    expect(counts.all).toBe(2)
    expect(counts.sent).toBe(1)
    // Unknown status is not counted in any bucket
  })
})

// =============================================================================
// calculateRealStats
// =============================================================================

describe('calculateRealStats', () => {
  it('returns null for empty array', () => {
    expect(calculateRealStats([])).toBeNull()
  })

  it('returns null for null input', () => {
    expect(calculateRealStats(null as unknown as Message[])).toBeNull()
  })

  it('calculates stats correctly for mixed messages', () => {
    const messages = makeMixedMessages()
    const stats = calculateRealStats(messages)!

    expect(stats.total).toBe(8)
    // sent = SENT + DELIVERED + READ = 2 + 2 + 1 = 5
    expect(stats.sent).toBe(5)
    // failed = 1 (Diana)
    expect(stats.failed).toBe(1)
    // skipped = 1 (Fernanda)
    expect(stats.skipped).toBe(1)
    // delivered = DELIVERED + READ = 2 + 1 = 3
    expect(stats.delivered).toBe(3)
    // read = 1 (Carlos)
    expect(stats.read).toBe(1)
  })

  it('counts DELIVERED messages in both sent and delivered', () => {
    const messages = [
      makeMessage({ id: '1', status: MessageStatus.DELIVERED }),
    ]
    const stats = calculateRealStats(messages)!
    expect(stats.sent).toBe(1)      // DELIVERED counts as sent
    expect(stats.delivered).toBe(1)
  })

  it('counts READ messages in sent, delivered, and read', () => {
    const messages = [
      makeMessage({ id: '1', status: MessageStatus.READ }),
    ]
    const stats = calculateRealStats(messages)!
    expect(stats.sent).toBe(1)      // READ counts as sent
    expect(stats.delivered).toBe(1)  // READ counts as delivered
    expect(stats.read).toBe(1)
  })

  it('handles all-pending messages', () => {
    const messages = [
      makeMessage({ id: '1', status: MessageStatus.PENDING }),
      makeMessage({ id: '2', status: MessageStatus.PENDING }),
    ]
    const stats = calculateRealStats(messages)!
    expect(stats.total).toBe(2)
    expect(stats.sent).toBe(0)
    expect(stats.failed).toBe(0)
    expect(stats.skipped).toBe(0)
    expect(stats.delivered).toBe(0)
    expect(stats.read).toBe(0)
  })

  it('handles all-failed messages', () => {
    const messages = [
      makeMessage({ id: '1', status: MessageStatus.FAILED }),
      makeMessage({ id: '2', status: MessageStatus.FAILED }),
    ]
    const stats = calculateRealStats(messages)!
    expect(stats.total).toBe(2)
    expect(stats.sent).toBe(0)
    expect(stats.failed).toBe(2)
  })

  it('handles single message', () => {
    const messages = [makeMessage({ id: '1', status: MessageStatus.SENT })]
    const stats = calculateRealStats(messages)!
    expect(stats.total).toBe(1)
    expect(stats.sent).toBe(1)
    expect(stats.delivered).toBe(0)
    expect(stats.read).toBe(0)
    expect(stats.failed).toBe(0)
    expect(stats.skipped).toBe(0)
  })
})
