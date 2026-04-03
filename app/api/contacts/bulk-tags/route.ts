import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { contactDb } from '@/lib/supabase-db'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import { formatZodErrors, validateBody } from '@/lib/api-validation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const BulkUpdateTagsSchema = z.object({
  ids: z.array(z.string().min(1, 'ID inválido')).min(1, 'Selecione pelo menos um contato').max(500, 'Máximo de 500 contatos por operação'),
  tagsToAdd: z.array(z.string().min(1, 'Tag não pode ser vazia')).optional().default([]),
  tagsToRemove: z.array(z.string().min(1, 'Tag não pode ser vazia')).optional().default([]),
})

/**
 * POST /api/contacts/bulk-tags
 * Adiciona e/ou remove tags em massa em múltiplos contatos.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    const body = await request.json().catch(() => ({}))

    const validation = validateBody(BulkUpdateTagsSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: formatZodErrors(validation.error) },
        { status: 400 }
      )
    }

    const { ids, tagsToAdd, tagsToRemove } = validation.data

    // Retorno rápido: nada a fazer
    if (tagsToAdd.length === 0 && tagsToRemove.length === 0) {
      return NextResponse.json({ updated: 0 })
    }

    const updated = await contactDb.bulkUpdateTags(ids, tagsToAdd, tagsToRemove)
    return NextResponse.json({ updated })
  } catch (error) {
    console.error('Failed to bulk update tags:', error)
    return NextResponse.json(
      { error: 'Falha ao atualizar tags em massa', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
