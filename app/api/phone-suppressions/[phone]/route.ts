import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { normalizePhoneNumber } from '@/lib/phone-formatter'
import { requireSessionOrApiKey } from '@/lib/request-auth'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ phone: string }> }

/**
 * GET /api/phone-suppressions/[phone]
 * Retorna a supressão ativa para o telefone informado (se existir).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { phone: phoneRaw } = await params
  const phone = normalizePhoneNumber(phoneRaw)

  if (!phone) {
    return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('phone_suppressions')
    .select('*')
    .eq('phone', phone)
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('Failed to fetch suppression:', error)
    return NextResponse.json({ error: 'Erro ao buscar supressão' }, { status: 500 })
  }

  return NextResponse.json({ suppression: data || null })
}

/**
 * DELETE /api/phone-suppressions/[phone]
 * Remove a supressão do telefone (desativa permanentemente).
 *
 * Útil para:
 * - Números de teste que foram suprimidos acidentalmente
 * - Clientes que pediram para voltar a receber mensagens
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  // Requer autenticação (sessão ou API key)
  const authError = await requireSessionOrApiKey(request)
  if (authError) return authError

  const { phone: phoneRaw } = await params
  const phone = normalizePhoneNumber(phoneRaw)

  if (!phone) {
    return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 })
  }

  const { error } = await supabase
    .from('phone_suppressions')
    .delete()
    .eq('phone', phone)

  if (error) {
    console.error('Failed to delete suppression:', error)
    return NextResponse.json({ error: 'Erro ao remover supressão' }, { status: 500 })
  }

  console.log(`[phone-suppressions] Suppression removed for ${phone}`)
  return NextResponse.json({ success: true, phone })
}
