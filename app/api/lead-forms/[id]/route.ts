import { NextResponse } from 'next/server'
import { leadFormDb } from '@/lib/supabase-db'
import { UpdateLeadFormSchema, validateBodyOrError } from '@/lib/api-validation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Params = { params: Promise<{ id: string }> }

/**
 * PATCH /api/lead-forms/[id]
 * Atualiza um formulário
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()

    const validation = validateBodyOrError(UpdateLeadFormSchema, body)
    if (!validation.success) return validation.response

    const updated = await leadFormDb.update(id, validation.data)
    if (!updated) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('Failed to update lead form:', error)

    const msg = String(error?.message || '')
    const maybeConflict = msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')

    return NextResponse.json(
      { error: maybeConflict ? 'Slug já existe. Escolha outro.' : 'Falha ao atualizar formulário', details: msg },
      { status: maybeConflict ? 409 : 500 }
    )
  }
}

/**
 * DELETE /api/lead-forms/[id]
 * Remove um formulário
 */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params
    await leadFormDb.delete(id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Failed to delete lead form:', error)
    return NextResponse.json(
      { error: 'Falha ao deletar formulário', details: String(error?.message || '') },
      { status: 500 }
    )
  }
}
