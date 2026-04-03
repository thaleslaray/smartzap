import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { getMetaAppCredentials } from '@/lib/meta-app-credentials'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const META_API_VERSION = 'v24.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

// Permissões obrigatórias para o SmartZap funcionar
const REQUIRED_SCOPES = [
  'whatsapp_business_messaging',
  'whatsapp_business_management',
] as const

type RequiredScope = (typeof REQUIRED_SCOPES)[number]

interface ScopeInfo {
  scope: RequiredScope
  label: string
  description: string
  critical: boolean // Se true, o sistema não funciona sem essa permissão
}

const SCOPE_INFO: Record<RequiredScope, ScopeInfo> = {
  whatsapp_business_messaging: {
    scope: 'whatsapp_business_messaging',
    label: 'WhatsApp Business Messaging',
    description: 'Enviar e receber mensagens',
    critical: true,
  },
  whatsapp_business_management: {
    scope: 'whatsapp_business_management',
    label: 'WhatsApp Business Management',
    description: 'Gerenciar templates e configurações',
    critical: false,
  },
}

export interface TokenInfo {
  type: string | null
  expiresAt: number | null
  isPermanent: boolean
  expiresIn: string | null
  expiresAtFormatted: string | null
  appId: string | null
  userId: string | null
}

export interface PermissionValidationResult {
  valid: boolean
  scopes: string[]
  missing: string[]
  scopeDetails: Array<{
    scope: string
    label: string
    description: string
    present: boolean
    critical: boolean
  }>
  tokenInfo: TokenInfo
  warning?: string
  steps?: string[]
  docsUrl?: string
  error?: string
}

function noStoreJson(payload: unknown, init?: { status?: number }) {
  return NextResponse.json(payload, {
    status: init?.status ?? 200,
    headers: {
      'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}

async function graphGet(
  path: string,
  accessToken: string,
  params?: Record<string, string | number | boolean>
) {
  const url = new URL(`${META_API_BASE}${path.startsWith('/') ? path : `/${path}`}`)
  for (const [k, v] of Object.entries(params || {})) {
    url.searchParams.set(k, String(v))
  }

  const res = await fetchWithTimeout(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    timeoutMs: 12000,
  })

  const json = await safeJson<any>(res)
  return { ok: res.ok, status: res.status, json }
}

function computeTokenExpiry(debugTokenData: any): {
  expiresAt: number | null
  isPermanent: boolean
  expiresIn: string | null
  expiresAtFormatted: string | null
} {
  const expiresAt = debugTokenData?.expires_at

  // Token permanente: expires_at é 0 ou não existe
  if (!expiresAt || expiresAt === 0) {
    return {
      expiresAt: null,
      isPermanent: true,
      expiresIn: null,
      expiresAtFormatted: null,
    }
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const secondsRemaining = expiresAt - nowSec

  // Token já expirou
  if (secondsRemaining <= 0) {
    return {
      expiresAt,
      isPermanent: false,
      expiresIn: 'Expirado',
      expiresAtFormatted: new Date(expiresAt * 1000).toLocaleDateString('pt-BR'),
    }
  }

  // Calcula tempo restante em formato legível
  const days = Math.floor(secondsRemaining / 86400)
  let expiresIn: string
  if (days > 0) {
    expiresIn = `${days} dia${days > 1 ? 's' : ''}`
  } else {
    const hours = Math.floor(secondsRemaining / 3600)
    if (hours > 0) {
      expiresIn = `${hours} hora${hours > 1 ? 's' : ''}`
    } else {
      const minutes = Math.floor(secondsRemaining / 60)
      expiresIn = `${minutes} minuto${minutes > 1 ? 's' : ''}`
    }
  }

  return {
    expiresAt,
    isPermanent: false,
    expiresIn,
    expiresAtFormatted: new Date(expiresAt * 1000).toLocaleDateString('pt-BR'),
  }
}

function buildMissingScopesSteps(missing: string[]): string[] {
  const list = missing.length ? missing.join(', ') : '—'
  return [
    'Acesse o Meta Business Suite (business.facebook.com)',
    'Vá em Configurações → Usuários → System Users',
    'Selecione ou crie um System User',
    `Gere um novo token com as permissões: ${list}`,
    'Copie o novo token e atualize no SmartZap',
  ]
}

/**
 * POST /api/settings/validate-permissions
 *
 * Valida se o token WhatsApp tem as permissões necessárias.
 *
 * Body (opcional):
 * - accessToken: Token a validar (se não fornecido, busca do banco)
 * - appId: Meta App ID (se não fornecido, busca do banco)
 * - appSecret: Meta App Secret (se não fornecido, busca do banco)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))

    // Buscar credenciais - prioriza body, depois banco
    let accessToken = body.accessToken?.trim()
    let appId = body.appId?.trim()
    let appSecret = body.appSecret?.trim()

    // Se não veio no body OU é o placeholder mascarado, busca do banco
    const isPlaceholder = !accessToken || accessToken === '***configured***'
    if (isPlaceholder) {
      const whatsappCreds = await getWhatsAppCredentials()
      accessToken = whatsappCreds?.accessToken
    }

    // Se não veio appId/appSecret OU são placeholders, busca do banco
    const appIdMissing = !appId
    const appSecretMissing = !appSecret || appSecret === '***configured***'
    if (appIdMissing || appSecretMissing) {
      const metaAppCreds = await getMetaAppCredentials()
      if (metaAppCreds) {
        if (appIdMissing) appId = metaAppCreds.appId
        if (appSecretMissing) appSecret = metaAppCreds.appSecret
      }
    }

    // Valida que temos o necessário
    if (!accessToken) {
      return noStoreJson({
        valid: false,
        error: 'Token de acesso não fornecido e não encontrado no banco',
        scopes: [],
        missing: [...REQUIRED_SCOPES],
        scopeDetails: REQUIRED_SCOPES.map(scope => ({
          ...SCOPE_INFO[scope],
          present: false,
        })),
        tokenInfo: {
          type: null,
          expiresAt: null,
          isPermanent: false,
          expiresIn: null,
          expiresAtFormatted: null,
          appId: null,
          userId: null,
        },
      } satisfies PermissionValidationResult, { status: 400 })
    }

    if (!appId || !appSecret) {
      return noStoreJson({
        valid: false,
        error: 'Meta App ID e Secret são necessários para validar permissões. Configure em Ajustes → Meta App.',
        scopes: [],
        missing: [...REQUIRED_SCOPES],
        scopeDetails: REQUIRED_SCOPES.map(scope => ({
          ...SCOPE_INFO[scope],
          present: false,
        })),
        tokenInfo: {
          type: null,
          expiresAt: null,
          isPermanent: false,
          expiresIn: null,
          expiresAtFormatted: null,
          appId: null,
          userId: null,
        },
        steps: [
          'Configure o Meta App ID e App Secret',
          'Encontre em: developers.facebook.com → Seu App → Configurações → Básico',
          'O App Secret é mostrado após clicar em "Mostrar"',
        ],
      } satisfies PermissionValidationResult, { status: 400 })
    }

    // Chama debug_token da Meta API
    const appAccessToken = `${appId}|${appSecret}`
    const debugRes = await graphGet('/debug_token', appAccessToken, {
      input_token: accessToken,
    })

    if (!debugRes.ok) {
      const errorMsg = debugRes.json?.error?.message || 'Erro ao validar token'
      return noStoreJson({
        valid: false,
        error: `Falha na validação: ${errorMsg}`,
        scopes: [],
        missing: [...REQUIRED_SCOPES],
        scopeDetails: REQUIRED_SCOPES.map(scope => ({
          ...SCOPE_INFO[scope],
          present: false,
        })),
        tokenInfo: {
          type: null,
          expiresAt: null,
          isPermanent: false,
          expiresIn: null,
          expiresAtFormatted: null,
          appId: null,
          userId: null,
        },
      } satisfies PermissionValidationResult, { status: 400 })
    }

    const data = debugRes.json?.data
    if (!data) {
      return noStoreJson({
        valid: false,
        error: 'Resposta inválida da Meta API',
        scopes: [],
        missing: [...REQUIRED_SCOPES],
        scopeDetails: REQUIRED_SCOPES.map(scope => ({
          ...SCOPE_INFO[scope],
          present: false,
        })),
        tokenInfo: {
          type: null,
          expiresAt: null,
          isPermanent: false,
          expiresIn: null,
          expiresAtFormatted: null,
          appId: null,
          userId: null,
        },
      } satisfies PermissionValidationResult, { status: 400 })
    }

    // Verifica se o token é válido
    if (data.is_valid === false) {
      return noStoreJson({
        valid: false,
        error: 'Token inválido ou expirado',
        scopes: [],
        missing: [...REQUIRED_SCOPES],
        scopeDetails: REQUIRED_SCOPES.map(scope => ({
          ...SCOPE_INFO[scope],
          present: false,
        })),
        tokenInfo: {
          type: data.type || null,
          expiresAt: data.expires_at || null,
          isPermanent: false,
          expiresIn: 'Expirado',
          expiresAtFormatted: null,
          appId: data.app_id || null,
          userId: data.user_id || null,
        },
        steps: [
          'O token está inválido ou expirado',
          'Gere um novo token no Meta Business Suite',
          'Recomendado: Use um System User para tokens permanentes',
        ],
      } satisfies PermissionValidationResult, { status: 400 })
    }

    // Extrai escopos do token
    const scopes: string[] = Array.isArray(data.scopes) ? data.scopes : []

    // Verifica permissões faltantes
    const missing = REQUIRED_SCOPES.filter(scope => !scopes.includes(scope))
    const hasCriticalMissing = missing.some(scope => SCOPE_INFO[scope].critical)

    // Monta detalhes de cada escopo
    const scopeDetails = REQUIRED_SCOPES.map(scope => ({
      ...SCOPE_INFO[scope],
      present: scopes.includes(scope),
    }))

    // Calcula informações de expiração
    const expiry = computeTokenExpiry(data)

    const tokenInfo: TokenInfo = {
      type: data.type || null,
      expiresAt: expiry.expiresAt,
      isPermanent: expiry.isPermanent,
      expiresIn: expiry.expiresIn,
      expiresAtFormatted: expiry.expiresAtFormatted,
      appId: data.app_id || null,
      userId: data.user_id || null,
    }

    // Se faltam permissões
    if (missing.length > 0) {
      return noStoreJson({
        valid: false,
        scopes,
        missing,
        scopeDetails,
        tokenInfo,
        steps: buildMissingScopesSteps(missing),
        docsUrl: 'https://developers.facebook.com/docs/whatsapp/business-management-api/get-started',
      } satisfies PermissionValidationResult)
    }

    // Monta resposta de sucesso
    const result: PermissionValidationResult = {
      valid: true,
      scopes,
      missing: [],
      scopeDetails,
      tokenInfo,
    }

    // Adiciona warning se token é temporário
    if (!expiry.isPermanent && expiry.expiresAt) {
      const daysRemaining = Math.floor((expiry.expiresAt - Date.now() / 1000) / 86400)
      if (daysRemaining <= 30) {
        result.warning = `Token expira em ${expiry.expiresIn}. Recomendado usar System User para token permanente.`
      }
    }

    return noStoreJson(result)
  } catch (error) {
    console.error('[validate-permissions] Erro:', error)
    return noStoreJson({
      valid: false,
      error: error instanceof Error ? error.message : 'Erro interno ao validar permissões',
      scopes: [],
      missing: [...REQUIRED_SCOPES],
      scopeDetails: REQUIRED_SCOPES.map(scope => ({
        ...SCOPE_INFO[scope],
        present: false,
      })),
      tokenInfo: {
        type: null,
        expiresAt: null,
        isPermanent: false,
        expiresIn: null,
        expiresAtFormatted: null,
        appId: null,
        userId: null,
      },
    } satisfies PermissionValidationResult, { status: 500 })
  }
}
