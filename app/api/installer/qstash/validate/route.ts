import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/installer/qstash/validate
 *
 * Valida o token do QStash fazendo uma request à API.
 * Usado no step 4 do wizard de instalação.
 */
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    // Validação básica
    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Token QStash é obrigatório' },
        { status: 400 }
      );
    }

    // Detecta a região correta lendo o campo `iss` (issuer) do payload JWT.
    // O Upstash embute no próprio token a URL do servidor correto —
    // assim a validação funciona para qualquer região (US, EU, etc.) sem hardcode.
    let qstashBaseUrl = 'https://qstash.upstash.io' // fallback genérico
    try {
      const payloadB64 = token.split('.')[1]
      if (payloadB64) {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
        if (payload.iss && typeof payload.iss === 'string') {
          qstashBaseUrl = payload.iss.replace(/\/$/, '')
          // Validar que o URL é do domínio Upstash (previne SSRF via JWT manipulado)
          const isUpstashDomain = /^https:\/\/[a-z0-9][a-z0-9-]*\.upstash\.io$/i.test(qstashBaseUrl)
          if (!isUpstashDomain) {
            qstashBaseUrl = 'https://qstash.upstash.io' // fallback seguro
          }
        }
      }
    } catch {
      // Se não conseguir decodificar o JWT, tenta com o fallback mesmo assim
    }

    // Validar token fazendo uma requisição de listagem de schedules
    // Este endpoint aceita GET e retorna 200 se o token for válido
    const qstashRes = await fetch(`${qstashBaseUrl}/v2/schedules`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!qstashRes.ok) {
      if (qstashRes.status === 401 || qstashRes.status === 403) {
        return NextResponse.json(
          { error: 'Token QStash inválido ou sem permissões' },
          { status: 401 }
        );
      }

      const errorText = await qstashRes.text().catch(() => '');
      return NextResponse.json(
        { error: `Erro ao validar token: ${errorText || qstashRes.statusText}` },
        { status: qstashRes.status }
      );
    }

    return NextResponse.json({
      valid: true,
      message: 'Token QStash válido',
    });

  } catch (error) {
    console.error('[installer/qstash/validate] Erro:', error);
    return NextResponse.json(
      { error: 'Erro interno ao validar token' },
      { status: 500 }
    );
  }
}
