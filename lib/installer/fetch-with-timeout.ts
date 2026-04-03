/**
 * Wrapper de fetch com timeout explícito via AbortController.
 *
 * Por que necessário: o timeout padrão do Node.js pode ser ~2 minutos,
 * causando travamento silencioso no wizard quando APIs externas estão lentas.
 *
 * @param url URL para a requisição
 * @param init Opções do fetch (headers, method, body, etc.)
 * @param timeoutMs Timeout em ms (padrão: 15000 = 15 segundos)
 * @note Não passe `signal` em `init` — fetchWithTimeout gerencia o AbortController internamente.
 *       Um `signal` passado pelo caller será substituído silenciosamente.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err instanceof DOMException || err instanceof Error) && (err as Error).name === 'AbortError') {
      const hostname = (() => {
        try { return new URL(url).hostname; } catch { return url; }
      })();
      throw new Error(`Timeout após ${timeoutMs / 1000}s conectando a ${hostname}. Verifique sua conexão.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
