import { NextRequest, NextResponse } from 'next/server'
import { parsePhoneNumber } from 'libphonenumber-js'
import { supabase } from '@/lib/supabase'
import { normalizePhoneNumber } from '@/lib/phone-formatter'
import { requireSessionOrApiKey } from '@/lib/request-auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type CountryCount = {
  code: string
  count: number
}

const resolveCountry = (phone: string): string | null => {
  const normalized = normalizePhoneNumber(String(phone || '').trim())
  if (!normalized) return null
  try {
    const parsed = parsePhoneNumber(normalized)
    return parsed?.country || null
  } catch {
    return null
  }
}

/**
 * GET /api/contacts/country-codes
 * Lista DDI (ISO) existentes nos contatos.
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
        const code = resolveCountry(String(row.phone || ''))
        if (!code) return
        counts[code] = (counts[code] || 0) + 1
      })

      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    const result: CountryCount[] = Object.entries(counts)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))

    return NextResponse.json({ data: result }, {
      headers: {
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (error) {
    console.error('Failed to fetch country codes:', error)
    return NextResponse.json(
      { error: 'Falha ao buscar DDI', details: (error as Error).message },
      { status: 500 }
    )
  }
}
