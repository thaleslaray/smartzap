import { NextResponse } from 'next/server'
import { leadFormDb } from '@/lib/supabase-db'
import { CreateLeadFormSchema, validateBodyOrError } from '@/lib/api-validation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/lead-forms
 * Lista formulários de captação (dashboard)
 */
export async function GET() {
  try {
    const forms = await leadFormDb.getAll()
    return NextResponse.json(forms, {
      headers: {
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (error) {
    console.error('Failed to fetch lead forms:', error)
    return NextResponse.json({ error: 'Falha ao buscar formulários' }, { status: 500 })
  }
}

/**
 * POST /api/lead-forms
 * Cria um formulário de captação
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    const validation = validateBodyOrError(CreateLeadFormSchema, body)
    if (!validation.success) return validation.response

    const created = await leadFormDb.create(validation.data)
    return NextResponse.json(created, { status: 201 })
  } catch (error: any) {
    console.error('Failed to create lead form:', error)

    // Unique violation (slug/webhook_token) - Supabase retorna mensagens diferentes.
    const msg = String(error?.message || '')
    const maybeConflict = msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')

    return NextResponse.json(
      { error: maybeConflict ? 'Slug já existe. Escolha outro.' : 'Falha ao criar formulário', details: msg },
      { status: maybeConflict ? 409 : 500 }
    )
  }
}
