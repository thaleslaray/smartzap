import { NextRequest, NextResponse } from 'next/server'
import { contactDb } from '@/lib/supabase-db'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import { BulkSetContactCustomFieldSchema, validateBodyOrError } from '@/lib/api-validation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * POST /api/contacts/bulk-custom-field
 * Aplica (em massa) um campo personalizado em múltiplos contatos.
 *
 * Importante: faz MERGE de custom_fields (não sobrescreve o objeto inteiro).
 */
export async function POST(request: Request) {
  try {
    const auth = await requireSessionOrApiKey(request as NextRequest)
    if (auth) return auth

    const body = await request.json().catch(() => ({}))

    const validation = validateBodyOrError(BulkSetContactCustomFieldSchema, body)
    if (!validation.success) return validation.response

    const { contactIds, key, value } = validation.data

    const result = await contactDb.bulkSetCustomField(contactIds, key, value)
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (error) {
    console.error('Failed to bulk set custom field:', error)
    return NextResponse.json(
      { error: 'Falha ao aplicar campo em massa', details: (error as Error).message },
      { status: 500 }
    )
  }
}
