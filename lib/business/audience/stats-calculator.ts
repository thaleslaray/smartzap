/**
 * Audience Statistics Calculator
 *
 * Pure functions for calculating audience statistics from contact lists.
 * Extracted from useCampaignWizard hook for reusability across the application.
 */

import { Contact, ContactStatus } from '@/types'
import { normalizePhoneNumber, getCountryCallingCodeFromPhone } from '@/lib/phone-formatter'
import { getBrazilUfFromPhone, isBrazilPhone } from '@/lib/br-geo'

/**
 * Sanitiza uma tag que pode estar como JSON-encoded string (ex: '["tag"]' → 'tag').
 * Retorna array de tags limpas.
 */
function sanitizeTagValue(raw: unknown): string[] {
  const s = String(raw ?? '').trim()
  if (!s) return []
  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed)) {
        return parsed.flat(Infinity).map((t: unknown) => String(t ?? '').trim()).filter(Boolean)
      }
    } catch { /* not JSON */ }
  }
  return [s]
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Count entry for a specific UF (Brazilian state).
 */
export interface UfCount {
  /** Brazilian state code (e.g., 'SP', 'RJ') */
  uf: string
  /** Number of eligible contacts in this state */
  count: number
}

/**
 * Count entry for a specific tag.
 */
export interface TagCount {
  /** Tag name (preserves original case) */
  tag: string
  /** Number of eligible contacts with this tag */
  count: number
}

/**
 * Count entry for a specific DDI (country calling code).
 */
export interface DdiCount {
  /** Country calling code (e.g., '55', '1') */
  ddi: string
  /** Number of eligible contacts with this DDI */
  count: number
}

/**
 * Count entry for a specific custom field.
 */
export interface CustomFieldCount {
  /** Custom field key */
  key: string
  /** Number of eligible contacts with this field populated */
  count: number
}

/**
 * Complete audience statistics.
 */
export interface AudienceStats {
  /** Total eligible contacts (excludes OPT_OUT and suppressed) */
  eligible: number
  /** Eligible contacts with OPT_IN status */
  optInEligible: number
  /** Total suppressed contacts */
  suppressed: number
  /** Eligible contacts with the top tag */
  topTagEligible: number
  /** Eligible contacts with no tags */
  noTagsEligible: number
  /** Counts by Brazilian UF, sorted by count descending */
  brUfCounts: UfCount[]
  /** Counts by tag, sorted by count descending */
  tagCountsEligible: TagCount[]
  /** Counts by DDI, sorted by count descending */
  ddiCountsEligible: DdiCount[]
  /** Counts by custom field key, sorted by count descending */
  customFieldCountsEligible: CustomFieldCount[]
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Safely extracts phone string from contact.
 *
 * @param contact - Contact object
 * @returns Phone string or empty string
 */
function getContactPhone(contact: Contact): string {
  return String(contact.phone || '').trim()
}

/**
 * Safely extracts custom fields from contact.
 *
 * @param contact - Contact object
 * @returns Custom fields object or undefined
 */
function getContactCustomFields(contact: Contact): Record<string, unknown> | undefined {
  const c = contact as unknown as Record<string, unknown>
  const cf = c.custom_fields
  return cf && typeof cf === 'object' ? (cf as Record<string, unknown>) : undefined
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Finds the most common tag across all contacts.
 *
 * @param contacts - List of contacts to analyze
 * @returns The most common tag, or null if no tags exist
 *
 * @example
 * ```typescript
 * const topTag = findTopTag(contacts)
 * console.log(`Most common tag: ${topTag}`)
 * ```
 */
export function findTopTag(contacts: Contact[]): string | null {
  const counts = new Map<string, number>()

  for (const contact of contacts) {
    for (const rawTag of contact.tags || []) {
      for (const key of sanitizeTagValue(rawTag)) {
        if (!key) continue
        counts.set(key, (counts.get(key) || 0) + 1)
      }
    }
  }

  let best: { tag: string; count: number } | null = null
  for (const [tag, count] of counts.entries()) {
    if (!best || count > best.count) {
      best = { tag, count }
    }
  }

  return best?.tag || null
}

/**
 * Calculates comprehensive audience statistics from a list of contacts.
 *
 * This function analyzes contacts to produce statistics useful for:
 * - Displaying audience size and composition in the UI
 * - Filtering contacts by geographic region (UF, DDI)
 * - Filtering contacts by tags
 * - Filtering contacts by custom fields
 *
 * Business rules applied:
 * - OPT_OUT contacts are excluded from eligible counts
 * - Suppressed phones are excluded from eligible counts
 *
 * @param contacts - List of contacts to analyze
 * @param suppressedPhones - Set of suppressed phone numbers (normalized E.164)
 * @param topTag - Optional pre-computed top tag (for efficiency)
 * @returns Complete audience statistics
 *
 * @example
 * ```typescript
 * const stats = calculateAudienceStats(contacts, suppressedPhones)
 * console.log(`${stats.eligible} eligible contacts`)
 * console.log(`${stats.brUfCounts.length} Brazilian states represented`)
 * ```
 */
export function calculateAudienceStats(
  contacts: Contact[],
  suppressedPhones: Set<string>,
  topTag?: string | null
): AudienceStats {
  let eligible = 0
  let optInEligible = 0
  let suppressed = 0
  let topTagEligible = 0
  let noTagsEligible = 0

  const ufCounts = new Map<string, number>()
  const tagCounts = new Map<string, { label: string; count: number }>()
  const ddiCounts = new Map<string, number>()
  const customFieldCounts = new Map<string, number>()

  // Compute top tag if not provided
  const resolvedTopTag = topTag ?? findTopTag(contacts)
  const normalizedTopTag = (resolvedTopTag || '').trim().toLowerCase()

  for (const contact of contacts) {
    const phone = normalizePhoneNumber(getContactPhone(contact))
    const isSuppressed = !!phone && suppressedPhones.has(phone)

    if (isSuppressed) {
      suppressed += 1
    }

    // Business rule: OPT_OUT contacts are never part of audience
    if (contact.status === ContactStatus.OPT_OUT) continue

    // Business rule: Suppressed contacts are never part of audience
    if (isSuppressed) continue

    eligible += 1

    if (contact.status === ContactStatus.OPT_IN) {
      optInEligible += 1
    }

    // Tag analysis (sanitiza tags que podem estar como JSON-encoded strings)
    const tags = (contact.tags || [])
      .flatMap((t) => sanitizeTagValue(t))
      .map((t) => t.toLowerCase())
      .filter(Boolean)

    if (tags.length === 0) {
      noTagsEligible += 1
    }

    if (normalizedTopTag && tags.includes(normalizedTopTag)) {
      topTagEligible += 1
    }

    // Count tags (preserving original case for display, sanitizando JSON-encoded)
    for (const rawTag of contact.tags || []) {
      const sanitized = sanitizeTagValue(rawTag)
      for (const label of sanitized) {
        if (!label) continue
        const key = label.toLowerCase()
        const curr = tagCounts.get(key)
        if (!curr) {
          tagCounts.set(key, { label, count: 1 })
        } else {
          tagCounts.set(key, { label: curr.label, count: curr.count + 1 })
        }
      }
    }

    // UF analysis (Brazil only)
    const phoneStr = getContactPhone(contact)
    if (isBrazilPhone(phoneStr)) {
      const uf = getBrazilUfFromPhone(phoneStr)
      if (uf) {
        ufCounts.set(uf, (ufCounts.get(uf) || 0) + 1)
      }
    }

    // DDI analysis
    const ddi = getCountryCallingCodeFromPhone(phoneStr)
    if (ddi) {
      ddiCounts.set(ddi, (ddiCounts.get(ddi) || 0) + 1)
    }

    // Custom field analysis
    const customFields = getContactCustomFields(contact)
    if (customFields) {
      for (const key of Object.keys(customFields)) {
        const trimmedKey = String(key || '').trim()
        if (!trimmedKey) continue
        const value = customFields[key]
        const isEmpty =
          value === null ||
          value === undefined ||
          (typeof value === 'string' && value.trim() === '')
        if (isEmpty) continue
        customFieldCounts.set(trimmedKey, (customFieldCounts.get(trimmedKey) || 0) + 1)
      }
    }
  }

  // Sort and format results
  const brUfCounts: UfCount[] = Array.from(ufCounts.entries())
    .map(([uf, count]) => ({ uf, count }))
    .sort((a, b) => b.count - a.count || a.uf.localeCompare(b.uf))

  const tagCountsEligible: TagCount[] = Array.from(tagCounts.values())
    .map(({ label, count }) => ({ tag: label, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))

  const ddiCountsEligible: DdiCount[] = Array.from(ddiCounts.entries())
    .map(([ddi, count]) => ({ ddi, count }))
    .sort((a, b) => b.count - a.count || a.ddi.localeCompare(b.ddi))

  const customFieldCountsEligible: CustomFieldCount[] = Array.from(customFieldCounts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))

  return {
    eligible,
    optInEligible,
    suppressed,
    topTagEligible,
    noTagsEligible,
    brUfCounts,
    tagCountsEligible,
    ddiCountsEligible,
    customFieldCountsEligible,
  }
}

/**
 * Calculates a simplified summary of audience size.
 *
 * Lighter alternative to calculateAudienceStats when only
 * basic counts are needed.
 *
 * @param contacts - List of contacts to analyze
 * @param suppressedPhones - Set of suppressed phone numbers (normalized E.164)
 * @returns Object with eligible and suppressed counts
 *
 * @example
 * ```typescript
 * const summary = calculateAudienceSummary(contacts, suppressedPhones)
 * console.log(`${summary.eligible} eligible, ${summary.suppressed} suppressed`)
 * ```
 */
export function calculateAudienceSummary(
  contacts: Contact[],
  suppressedPhones: Set<string>
): { eligible: number; suppressed: number; optedOut: number; total: number } {
  let eligible = 0
  let suppressed = 0
  let optedOut = 0

  for (const contact of contacts) {
    if (contact.status === ContactStatus.OPT_OUT) {
      optedOut += 1
      continue
    }

    const phone = normalizePhoneNumber(getContactPhone(contact))
    if (phone && suppressedPhones.has(phone)) {
      suppressed += 1
      continue
    }

    eligible += 1
  }

  return {
    eligible,
    suppressed,
    optedOut,
    total: contacts.length,
  }
}
