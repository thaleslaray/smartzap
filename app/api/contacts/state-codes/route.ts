import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getBrazilUfFromPhone } from '@/lib/br-geo'
import { normalizePhoneNumber } from '@/lib/phone-formatter'
import { requireSessionOrApiKey } from '@/lib/request-auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type StateCount = {
  code: string
  count: number
}

const resolveState = (phone: string): string | null => {
  const normalized = normalizePhoneNumber(String(phone || '').trim())
  if (!normalized) return null
  return getBrazilUfFromPhone(normalized)
}

/**
 * GET /api/contacts/state-codes
 * Lista UFs existentes nos contatos BR.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    // Paginação: PostgREST limita a 1000 rows sem .range() explícito.
    const PAGE_SIZE = 1000
    const counts: Record<string, number> = {}
    let from = 0

    while (true) {
      const { data, error } = await supabase
        .from('contacts')
        .select('phone')
        .order('id')
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error

      const rows = data || []
      rows.forEach((row) => {
        const code = resolveState(String(row.phone || ''))
        if (!code) return
        counts[code] = (counts[code] || 0) + 1
      })

      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    const result: StateCount[] = Object.entries(counts)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))

    return NextResponse.json(
      { data: result },
      {
        headers: {
          'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    )
  } catch (error) {
    console.error('Failed to fetch state codes:', error)
    return NextResponse.json(
      { error: 'Falha ao buscar UFs', details: (error as Error).message },
      { status: 500 }
    )
  }
}
