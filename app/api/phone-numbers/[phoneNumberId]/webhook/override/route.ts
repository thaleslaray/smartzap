import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

const META_API_VERSION = 'v21.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

interface RouteContext {
  params: Promise<{ phoneNumberId: string }>
}

import { getVerifyToken } from '@/lib/verify-token'

function maskTokenPreview(token: string | null | undefined): string {
  if (!token) return '—'
  const t = String(token)
  if (t.length <= 8) return `${t.slice(0, 2)}…(${t.length})`
  return `${t.slice(0, 3)}…${t.slice(-3)}(${t.length})`
}

function isProbablyVercelProtection(headers: Headers): boolean {
  const server = headers.get('server')?.toLowerCase() || ''
  const hasVercelId = !!headers.get('x-vercel-id')
  return server.includes('vercel') || hasVercelId
}

function pickHeaders(headers: Headers, keys: string[]) {
  const out: Record<string, string> = {}
  for (const k of keys) {
    const v = headers.get(k)
    if (v) out[k] = v
  }
  return out
}

/**
 * POST /api/phone-numbers/[phoneNumberId]/webhook/override
 * Set webhook override URL for a specific phone number
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { phoneNumberId } = await context.params

    // Tenta obter credenciais do body primeiro; fallback para credenciais salvas (Supabase/env)
    let accessToken: string | undefined
    let callbackUrl: string | undefined
    let preflight: boolean = true
    let force: boolean = false

    let body: any = null

    try {
      body = await request.json()
      // Only use accessToken from body if it's a valid non-empty string
      if (body.accessToken && typeof body.accessToken === 'string' && body.accessToken.trim().length > 10) {
        accessToken = body.accessToken.trim()
      }
      callbackUrl = body.callbackUrl
      if (typeof body.preflight === 'boolean') preflight = body.preflight
      if (typeof body.force === 'boolean') force = body.force
    } catch {
      // Body vazio: usar credenciais salvas
    }

    // Se ainda não temos token válido, usar credenciais salvas
    if (!accessToken) {
      const credentials = await getWhatsAppCredentials();
      if (credentials?.accessToken) {
        accessToken = credentials.accessToken
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Access token não configurado' },
        { status: 401 }
      );
    }

    if (!callbackUrl) {
      return NextResponse.json(
        { error: 'callbackUrl é obrigatório' },
        { status: 400 }
      );
    }

    // Get verify token from Supabase (ensures consistency with webhook endpoint)
    const verifyToken = await getVerifyToken()

    // Preflight: antes de pedir para a Meta verificar, simulamos o GET de verificação.
    // Isso ajuda a detectar casos comuns (ex.: Preview protegido na Vercel retornando 401).
    if (preflight && !force) {
      let verifyUrl: URL
      try {
        verifyUrl = new URL(callbackUrl)
      } catch {
        return NextResponse.json(
          {
            error: 'callbackUrl inválida (URL malformada)',
            callbackUrl,
          },
          { status: 400 }
        )
      }

      verifyUrl.searchParams.set('hub.mode', 'subscribe')
      verifyUrl.searchParams.set('hub.verify_token', verifyToken)
      verifyUrl.searchParams.set('hub.challenge', 'smartzap_preflight_challenge')

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)

      try {
        const resp = await fetch(verifyUrl.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          // Não manda cookies/headers especiais: queremos reproduzir o comportamento da Meta.
        })

        const contentType = resp.headers.get('content-type') || ''
        let bodyText: string | undefined
        try {
          // Evita payload gigante
          const text = await resp.text()
          bodyText = text.length > 800 ? `${text.slice(0, 800)}…` : text
        } catch {
          // ignore
        }

        if (resp.status !== 200) {
          const maybeVercelProtection = resp.status === 401 && isProbablyVercelProtection(resp.headers)

          const pickedHeaders = pickHeaders(resp.headers, [
            'www-authenticate',
            'server',
            'x-vercel-id',
            'x-vercel-cache',
            'x-vercel-protection-bypass',
            'x-robots-tag',
          ])

          console.warn('[WebhookOverride] Preflight verification failed', {
            callbackUrl,
            verifyUrl: verifyUrl.toString(),
            status: resp.status,
            contentType,
            maybeVercelProtection,
            headers: pickedHeaders,
            verifyTokenPreview: maskTokenPreview(verifyToken),
          })

          return NextResponse.json(
            {
              code: maybeVercelProtection ? 'VERCEL_DEPLOYMENT_PROTECTION' : 'WEBHOOK_PREFLIGHT_FAILED',
              error: 'callbackUrl não passou no preflight de verificação (GET hub.*)',
              hint: maybeVercelProtection
                ? 'Parece que este deployment (Preview) está protegido pela Vercel e retorna 401 sem cookie/bypass. A Meta não consegue concluir a verificação assim.'
                : 'A URL precisa responder 200 e devolver o hub.challenge quando hub.verify_token bater.',
              action: maybeVercelProtection
                ? 'Use um domínio público (Production) ou desabilite Deployment Protection neste Preview.'
                : 'Confira se /api/webhook está acessível publicamente e se o verify token está correto.',
              callbackUrl,
              verifyUrl: verifyUrl.toString(),
              status: resp.status,
              contentType,
              headers: pickedHeaders,
              bodyPreview: bodyText,
              // Se você quiser mesmo assim tentar na Meta (não recomendado), envie { force: true }.
            },
            { status: 400 }
          )
        }
      } catch (e: any) {
        const aborted = e?.name === 'AbortError'
        return NextResponse.json(
          {
            error: 'Falha ao fazer preflight no callbackUrl',
            hint: aborted
              ? 'Timeout no preflight (8s). Verifique se o domínio responde rapidamente e em HTTPS.'
              : 'Não foi possível conectar na URL. Verifique DNS/HTTPS/firewall.',
            callbackUrl,
            verifyUrl: verifyUrl.toString(),
          },
          { status: 400 }
        )
      } finally {
        clearTimeout(timeout)
      }
    }

    // Call Meta API to set webhook override on phone number
    // Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/override
    const response = await fetchWithTimeout(
      `${META_API_BASE}/${phoneNumberId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhook_configuration: {
            override_callback_uri: callbackUrl,
            verify_token: verifyToken,
          },
        }),
        timeoutMs: 10000,
      }
    );

    if (!response.ok) {
      const errorData = await safeJson<any>(response)
      console.error('Meta API error setting webhook override:', errorData);

      // Erro #100 = app não inscrito no WABA antes de tentar override no número
      const metaErrorCode = errorData?.error?.code;
      if (metaErrorCode === 100) {
        return NextResponse.json(
          {
            code: 'APP_NOT_SUBSCRIBED',
            error: 'O App Meta não está inscrito para receber mensagens desta WABA.',
            hint: 'Acesse o Meta App Dashboard (developers.facebook.com/apps), selecione seu App → WhatsApp → Configuração → e inscreva o App nos webhooks desta WABA antes de configurar overrides por número.',
            details: errorData?.error,
            preflight: {
              attempted: preflight && !force,
              forced: force,
            },
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          error: errorData?.error?.message || 'Erro ao configurar webhook override',
          details: errorData?.error,
          preflight: {
            attempted: preflight && !force,
            forced: force,
          },
        },
        { status: response.status }
      );
    }

    const data = await safeJson<any>(response)
    return NextResponse.json({
      success: true,
      message: 'Webhook override configurado com sucesso',
      data,
      preflight: {
        attempted: preflight && !force,
        forced: force,
      },
    })

  } catch (error) {
    console.error('Error setting webhook override:', error);
    return NextResponse.json(
      { error: 'Erro interno ao configurar webhook' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/phone-numbers/[phoneNumberId]/webhook/override
 * Remove webhook override for a specific phone number
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { phoneNumberId } = await context.params;

    // Tenta obter credenciais do body primeiro; fallback para credenciais salvas (Supabase/env)
    let accessToken: string | undefined;

    try {
      const body = await request.json();
      // Only use accessToken from body if it's a valid non-empty string
      if (body.accessToken && typeof body.accessToken === 'string' && body.accessToken.trim().length > 10) {
        accessToken = body.accessToken.trim();
      }
    } catch {
      // Body vazio: usar credenciais salvas
    }

    // Se ainda não temos token válido, usar credenciais salvas
    if (!accessToken) {
      const credentials = await getWhatsAppCredentials();
      if (credentials?.accessToken) {
        accessToken = credentials.accessToken;
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Access token não configurado' },
        { status: 401 }
      );
    }

    // Call Meta API to remove webhook override (set empty string)
    // Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/override
    const response = await fetchWithTimeout(
      `${META_API_BASE}/${phoneNumberId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhook_configuration: {
            override_callback_uri: '',
          },
        }),
        timeoutMs: 10000,
      }
    );

    if (!response.ok) {
      const errorData = await safeJson<any>(response)
      console.error('Meta API error removing webhook override:', errorData);
      return NextResponse.json(
        {
          error: errorData?.error?.message || 'Erro ao remover webhook override',
          details: errorData?.error
        },
        { status: response.status }
      );
    }

    const data = await safeJson<any>(response)
    return NextResponse.json({
      success: true,
      message: 'Webhook override removido com sucesso',
      data
    });

  } catch (error) {
    console.error('Error removing webhook override:', error);
    return NextResponse.json(
      { error: 'Erro interno ao remover webhook' },
      { status: 500 }
    );
  }
}
