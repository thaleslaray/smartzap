import { NextRequest, NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/installer/fetch-with-timeout';

/**
 * POST /api/installer/redis/validate
 *
 * Valida credenciais do Redis Upstash (REST URL + Token).
 * Usado no step 5 do wizard de instalação.
 *
 * Faz um PING via REST API pra verificar conectividade.
 */
export async function POST(req: NextRequest) {
  try {
    const { restUrl, restToken } = await req.json();

    // Validação básica
    if (!restUrl || typeof restUrl !== 'string') {
      return NextResponse.json(
        { error: 'REST URL é obrigatória' },
        { status: 400 }
      );
    }

    if (!restToken || typeof restToken !== 'string') {
      return NextResponse.json(
        { error: 'REST Token é obrigatório' },
        { status: 400 }
      );
    }

    // Validar formato da URL — regex garante domínio real, não substring
    const trimmedUrl = restUrl.trim();
    const validUpstashUrl = /^https:\/\/[a-z0-9][a-z0-9-]*\.upstash\.io\/?$/i;
    if (!validUpstashUrl.test(trimmedUrl)) {
      return NextResponse.json(
        { error: 'URL inválida. Formato esperado: https://[nome].upstash.io' },
        { status: 400 }
      );
    }

    // Normalizar URL (remover trailing slash)
    const normalizedUrl = trimmedUrl.replace(/\/$/, '');

    // Fazer PING via REST API
    // Upstash REST API: GET {url}/ping ou POST {url} com command ["PING"]
    const pingRes = await fetchWithTimeout(`${normalizedUrl}/ping`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${restToken}`,
      },
    }, 8_000); // Redis PING deve responder em < 8s

    if (!pingRes.ok) {
      if (pingRes.status === 401 || pingRes.status === 403) {
        return NextResponse.json(
          { error: 'Token Redis inválido ou sem permissões' },
          { status: 401 }
        );
      }

      if (pingRes.status === 404) {
        return NextResponse.json(
          { error: 'URL do Redis inválida' },
          { status: 400 }
        );
      }

      const errorText = await pingRes.text().catch(() => '');
      return NextResponse.json(
        { error: `Erro ao conectar ao Redis: ${errorText || pingRes.statusText}` },
        { status: pingRes.status }
      );
    }

    // Verificar resposta do PING
    const pingData = await pingRes.json().catch(() => null);

    // Upstash retorna { result: "PONG" } em caso de sucesso
    if (pingData?.result === 'PONG') {
      return NextResponse.json({
        valid: true,
        message: 'Conexão com Redis estabelecida',
      });
    }

    // Se chegou aqui, algo inesperado aconteceu
    return NextResponse.json({
      valid: true,
      message: 'Credenciais parecem válidas',
      warning: 'PING retornou resposta inesperada',
    });

  } catch (error) {
    console.error('[installer/redis/validate] Erro:', error);

    // Erro de rede pode indicar URL inválida
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return NextResponse.json(
        { error: 'Não foi possível conectar à URL fornecida' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Erro interno ao validar credenciais' },
      { status: 500 }
    );
  }
}
