/**
 * Helpers para respostas padronizadas nas API routes.
 *
 * Uso:
 *   import { apiError } from '@/lib/api-response'
 *   return apiError('Falha ao buscar contatos')          // 500
 *   return apiError('Recurso não encontrado', 404)
 *   return apiError('Dados inválidos', 400, { details }) // com campo extra
 */

import { NextResponse } from 'next/server'

/** Resposta de erro com campo `error` padronizado. Status padrão: 500. */
export function apiError(
  message: string,
  status = 500,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status })
}

