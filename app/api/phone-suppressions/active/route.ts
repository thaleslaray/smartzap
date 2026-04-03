import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validateBodyOrError } from '@/lib/api-validation'
import { getActiveSuppressionsByPhone } from '@/lib/phone-suppressions'
import { normalizePhoneNumber } from '@/lib/phone-formatter'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const GetActivePhoneSuppressionsSchema = z.object({
  phones: z
    .array(z.string().min(1))
    .max(20000, 'Máximo de 20.000 telefones por consulta'),
})

/**
 * POST /api/phone-suppressions/active
 * Retorna os telefones com supressão ativa para a lista informada.
 *
 * Observação: usado no frontend para exibir contagens consistentes ("Todos" = base - opt-out - supressões).
 * O backend continua aplicando guard-rails (opt-out/supressão) independentemente do que o usuário selecionar.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    const validation = validateBodyOrError(GetActivePhoneSuppressionsSchema, body)
    if (!validation.success) return validation.response

    const normalizedPhones = Array.from(
      new Set(
        (validation.data.phones || [])
          .map((p) => normalizePhoneNumber(String(p || '').trim()))
          .filter(Boolean)
      )
    )

    if (normalizedPhones.length === 0) {
      return NextResponse.json({ phones: [] }, { status: 200 })
    }

    const active = await getActiveSuppressionsByPhone(normalizedPhones)
    return NextResponse.json(
      {
        phones: Array.from(active.keys()),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    )
  } catch (error) {
    console.error('Failed to fetch phone suppressions:', error)
    return NextResponse.json({ error: 'Falha ao buscar supressões' }, { status: 500 })
  }
}
