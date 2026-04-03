import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { contactDb } from '@/lib/supabase-db'
import { ContactStatus } from '@/types'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import { formatZodErrors, validateBody } from '@/lib/api-validation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const BulkUpdateStatusSchema = z.object({
  ids: z.array(z.string().min(1, 'ID inválido')).min(1, 'Selecione pelo menos um contato'),
  status: z.nativeEnum(ContactStatus).refine(
    (v) => v !== ContactStatus.SUPPRESSED,
    { message: 'Status SUPPRESSED não pode ser definido manualmente' }
  ),
})

/**
 * POST /api/contacts/bulk-status
 * Atualiza o status de múltiplos contatos em massa.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    const body = await request.json().catch(() => ({}))

    const validation = validateBody(BulkUpdateStatusSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: formatZodErrors(validation.error) },
        { status: 400 }
      )
    }

    const { ids, status } = validation.data

    const updated = await contactDb.bulkUpdateStatus(ids, status)
    return NextResponse.json({ updated })
  } catch (error) {
    console.error('Failed to bulk update status:', error)
    return NextResponse.json(
      { error: 'Falha ao atualizar status em massa', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
