'use server'

import { cache } from 'react'
import { getSupabaseAdmin } from '@/lib/supabase'
import { ContactStatus } from '@/types'
import type { Contact, CustomFieldDefinition } from '@/types'

const PAGE_SIZE = 50

export interface ContactsInitialData {
  contacts: Contact[]
  total: number
  stats: {
    total: number
    active: number
    optOut: number
    suppressed: number
  }
  tags: string[]
  customFields: CustomFieldDefinition[]
}

// Helper para sanitizar tags potencialmente aninhadas/corrompidas
function sanitizeTag(tag: unknown): string[] {
    const s = String(tag ?? '').trim()
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

// Helper para normalizar telefone (remove + se tiver)
const normalizePhone = (phone: string) => {
  const p = String(phone || '').trim()
  return p.startsWith('+') ? p.slice(1) : p
}

/**
 * Busca dados iniciais de contatos no servidor (RSC).
 * Usa cache() para deduplicação per-request.
 */
export const getContactsInitialData = cache(async (): Promise<ContactsInitialData> => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    throw new Error('Supabase não configurado')
  }

  // Buscar tudo em paralelo
  const [contactsResult, tagsResult, customFieldsResult, suppressionsResult, statsResult] = await Promise.all([
    // Primeira página de contatos
    supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1),

    // Tags únicas via RPC (sem limite PostgREST — retorna todos os contatos)
    supabase.rpc('get_contact_tags'),

    // Campos customizados
    supabase
      .from('custom_field_definitions')
      .select('*')
      .eq('entity_type', 'contact')
      .order('name'),

    // Supressões ativas (para calcular effectiveStatus nos contatos da página)
    supabase
      .from('phone_suppressions')
      .select('phone,reason,source,expires_at')
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString()),

    // Stats agregados via RPC (total, optIn, optOut — sem limite PostgREST)
    supabase.rpc('get_contact_stats'),
  ])

  // Criar mapa de supressões indexado por telefone normalizado
  const suppressionMap = new Map<string, { reason: string | null; source: string | null; expiresAt: string | null }>()
  for (const row of suppressionsResult.data || []) {
    const phone = String(row.phone || '').trim()
    if (phone) {
      const normalized = normalizePhone(phone)
      suppressionMap.set(normalized, {
        reason: row.reason ?? null,
        source: row.source ?? null,
        expiresAt: row.expires_at ?? null,
      })
    }
  }

  // Mapear contatos com effectiveStatus calculado
  const contacts: Contact[] = (contactsResult.data || []).map(c => {
    const rowPhone = String(c.phone || '').trim()
    const normalizedPhone = normalizePhone(rowPhone)
    const suppression = suppressionMap.get(normalizedPhone) || null
    const isSuppressed = suppression !== null

    // Status efetivo: SUPRIMIDO tem prioridade sobre qualquer outro status
    const dbStatus = (c.status as ContactStatus) || ContactStatus.OPT_IN
    const effectiveStatus = isSuppressed ? ContactStatus.SUPPRESSED : dbStatus

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      status: effectiveStatus, // Status visual calculado
      originalStatus: dbStatus, // Status real do banco (para referência)
      tags: Array.isArray(c.tags) ? (c.tags as unknown[]).flat(Infinity).flatMap(t => sanitizeTag(t)).filter(Boolean) : [],
      lastActive: c.last_active || c.updated_at || c.created_at,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      custom_fields: c.custom_fields,
      suppressionReason: suppression?.reason ?? null,
      suppressionSource: suppression?.source ?? null,
      suppressionExpiresAt: suppression?.expiresAt ?? null,
    }
  })

  // Tags via RPC — retorna string[] com todas as tags únicas do banco (sem limite PostgREST)
  const rawTagsData = tagsResult.data
  const rawTags: unknown[] = Array.isArray(rawTagsData)
    ? rawTagsData
    : (typeof rawTagsData === 'string'
        ? (() => { try { const p = JSON.parse(rawTagsData); return Array.isArray(p) ? p : [] } catch { return [] } })()
        : [])
  const allTags: string[] = rawTags
    .flat(Infinity)
    .flatMap(t => sanitizeTag(t))
    .filter(Boolean)

  // Stats via RPC — counts calculados no SQL (total real, sem limite PostgREST)
  const rpcStats = statsResult.data as { total: number; optIn: number; optOut: number } | null
  const suppressed = suppressionMap.size

  return {
    contacts,
    total: contactsResult.count || 0,
    stats: {
      total: rpcStats?.total || contactsResult.count || 0,
      active: rpcStats?.optIn || 0,
      optOut: rpcStats?.optOut || 0,
      suppressed,
    },
    tags: allTags.toSorted(),
    customFields: (customFieldsResult.data || []) as CustomFieldDefinition[]
  }
})
