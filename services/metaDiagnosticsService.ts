import type { ReactNode } from 'react'
import { api } from '@/lib/api'

export type MetaDiagnosticsCheckStatus = 'pass' | 'warn' | 'fail' | 'info'

export type MetaDiagnosticsAction = {
  id: string
  label: string
  kind: 'link' | 'api'
  href?: string
  method?: 'POST' | 'DELETE'
  endpoint?: string
  body?: unknown
}

export type MetaDiagnosticsCheck = {
  id: string
  title: string
  status: MetaDiagnosticsCheckStatus
  message: string
  details?: Record<string, unknown>
  actions?: MetaDiagnosticsAction[]
}

export type MetaDiagnosticsResponse = {
  ok: boolean
  ts: string
  env?: Record<string, unknown>
  summary?: {
    health?: {
      overall?: string
    }
    token?: {
      expiresAt: number | null
      dataAccessExpiresAt: number | null
      expiresAtIso: string | null
      dataAccessExpiresAtIso: string | null
      daysRemaining: number | null
      status: 'unknown' | 'ok' | 'expiring' | 'expired'
    } | null
    traces?: {
      fbtraceIds?: string[]
    }
  }
  metaApp?: {
    enabled: boolean
    source: 'db' | 'env' | 'none'
    appId: string | null
    hasAppSecret: boolean
  } | null
  debugTokenValidation?: {
    enabled: boolean
    source: 'db' | 'env' | 'none'
    attempted: boolean
    checkedAt: string
    ok: boolean | null
    isValid: boolean | null
    error?: unknown
  } | null
  webhook?: {
    expectedUrl?: string
    verifyTokenPreview?: string
  } | null
  whatsapp?: {
    credentialsSource?: string
    businessAccountId?: string | null
    phoneNumberId?: string | null
    accessTokenPreview?: string | null
  } | null
  checks: MetaDiagnosticsCheck[]
  meta?: Record<string, unknown> | null
  internal?: Record<string, unknown> | null
  report?: { text?: string; supportPacketText?: string } | null
}

export type Simulate10033Response =
  | { ok: false; error: string; details?: unknown }
  | {
      ok: true
      attempt?: { status?: number }
      result?: {
        normalizedError?: {
          code?: number
          subcode?: number
          message?: string
          fbtraceId?: string
        }
      }
    }

export const metaDiagnosticsService = {
  get: (): Promise<MetaDiagnosticsResponse> =>
    api.get<MetaDiagnosticsResponse>('/api/meta/diagnostics', {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    }),

  runAction: async (action: MetaDiagnosticsAction): Promise<unknown> => {
    if (action.kind !== 'api') throw new Error('Ação inválida (não é API)')
    if (!action.endpoint) throw new Error('Ação inválida: endpoint ausente')

    const method = action.method || 'POST'

    const res = await fetch(action.endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: action.body ? JSON.stringify(action.body) : undefined,
    })

    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const baseMsg = (json as any)?.error || `Falha ao executar ação (${method})`
      const details = (json as any)?.details || null
      const code = details?.code || details?.error?.code || null
      const userTitle = details?.error_user_title || details?.error?.error_user_title || null
      const userMsg = details?.error_user_msg || details?.error?.error_user_msg || null

      const parts = [
        userTitle ? String(userTitle) : null,
        String(baseMsg),
        userMsg ? String(userMsg) : null,
        code ? `(código ${String(code)})` : null,
      ].filter(Boolean)

      throw new Error(parts.join(' — '))
    }

    return json
  },

  simulate10033: async (): Promise<Simulate10033Response> => {
    const res = await fetch('/api/meta/diagnostics/simulate-10033', {
      method: 'POST',
    })

    const json = await res.json().catch(() => null)
    if (!res.ok) {
      return {
        ok: false,
        error: (json as any)?.error || 'Falha ao simular',
        details: (json as any)?.details || null,
      }
    }

    return json as Simulate10033Response
  },
}
