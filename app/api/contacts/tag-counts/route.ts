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
 * Sanitiza uma tag individual (mesma lógica do SQL RPC get_contact_tag_counts).
 * Filtra tags vazias, nested arrays corrompidos ("[...]"), e whitespace-only.
 */
const isValidTag = (tag: unknown): tag is string => {
  if (typeof tag !== 'string') return false
  const trimmed = tag.trim()
  return trimmed.length > 0 && !trimmed.startsWith('[')
}

/**
 * Fallback in-memory: pagina todos os contatos e agrega tags no servidor.
 * Usado quando o RPC get_contact_tag_counts ainda não foi aplicado no banco.
 */
async function aggregateTagCountsInMemory(): Promise<TagCount[]> {
  const PAGE_SIZE = 1000
  const counts: Record<string, number> = {}
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('contacts')
      .select('tags')
      .not('tags', 'is', null)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error

    const rows = data || []
    for (const row of rows) {
      const tags = row.tags
      if (!Array.isArray(tags) || tags.length === 0) continue
      for (const tag of tags) {
        if (!isValidTag(tag)) continue
        counts[tag] = (counts[tag] || 0) + 1
      }
    }

    if (rows.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/**
 * GET /api/contacts/tag-counts
 * Retorna todas as tags com contagem de contatos, ordenadas por popularidade.
 * Tenta RPC SQL (get_contact_tag_counts) primeiro; se indisponível, faz
 * agregação in-memory com a mesma sanitização.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    let result: TagCount[]

    // Tenta RPC (mais eficiente, roda no banco)
    const { data, error } = await supabase.rpc('get_contact_tag_counts')

    if (error) {
      // RPC não existe ainda — fallback para agregação in-memory
      const isRpcMissing =
        error.code === '42883' || // undefined_function (PostgreSQL)
        error.message?.includes('Could not find the function') // PostgREST
      if (isRpcMissing) {
        console.warn('RPC get_contact_tag_counts not found, using in-memory fallback')
        result = await aggregateTagCountsInMemory()
      } else {
        throw error
      }
    } else {
      result = (data || []) as TagCount[]
    }

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
