import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireSessionOrApiKey } from '@/lib/request-auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type TagCount = {
  tag: string
  count: number
}

/**
 * GET /api/contacts/tag-counts
 * Retorna todas as tags com contagem de contatos, ordenadas por popularidade.
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
        .select('tags')
        .order('id')
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error

      const rows = data || []
      rows.forEach((row) => {
        const tags = row.tags
        if (!Array.isArray(tags)) return
        tags.forEach((tag: string) => {
          if (!tag || typeof tag !== 'string') return
          counts[tag] = (counts[tag] || 0) + 1
        })
      })

      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    const result: TagCount[] = Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))

    return NextResponse.json({ data: result }, {
      headers: {
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (error) {
    console.error('Failed to fetch tag counts:', error)
    return NextResponse.json(
      { error: 'Falha ao buscar contagem de tags', details: (error as Error).message },
      { status: 500 }
    )
  }
}
