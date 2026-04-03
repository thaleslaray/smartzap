/**
 * Cliente HTTP centralizado para API routes do Next.js.
 *
 * Elimina o boilerplate de fetch + verificação de response.ok + extração
 * de erro do payload que estava duplicado em todos os services.
 *
 * Uso:
 *   import { api } from '@/lib/api'
 *   const data = await api.get<Campaign[]>('/api/campaigns')
 *   await api.post('/api/campaigns', { name: 'X' })
 *   await api.patch(`/api/campaigns/${id}`, { status: 'PAUSED' })
 *   await api.del(`/api/campaigns/${id}`)
 */

/** Extrai mensagem de erro do body da resposta, com fallback para status HTTP. */
async function extractError(response: Response): Promise<string> {
    try {
        const payload = await response.json();
        return payload?.error || payload?.message || `HTTP ${response.status}`;
    } catch {
        return `HTTP ${response.status}`;
    }
}

export const api = {
    /** GET — lança Error se a resposta não for ok. */
    async get<T>(path: string, init?: RequestInit): Promise<T> {
        const response = init !== undefined ? await fetch(path, init) : await fetch(path);
        if (!response.ok) throw new Error(await extractError(response));
        return response.json();
    },

    /**
     * GET seguro — retorna `fallback` em vez de lançar erro.
     * Use para listas onde a UI deve mostrar vazio ao invés de crashar.
     */
    async safeGet<T>(path: string, fallback: T, init?: RequestInit): Promise<T> {
        try {
            const response = init !== undefined ? await fetch(path, init) : await fetch(path);
            if (!response.ok) return fallback;
            return response.json();
        } catch {
            return fallback;
        }
    },

    /** POST com corpo JSON — lança Error com mensagem do servidor. Retorna null em 204. */
    async post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
        const response = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            ...init,
        });
        if (!response.ok) throw new Error(await extractError(response));
        if (response.status === 204 || response.headers.get('content-length') === '0') return null as T;
        return response.json();
    },

    /** PATCH com corpo JSON — lança Error com mensagem do servidor. Retorna null em 204. */
    async patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
        const response = await fetch(path, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            ...init,
        });
        if (!response.ok) throw new Error(await extractError(response));
        if (response.status === 204 || response.headers.get('content-length') === '0') return null as T;
        return response.json();
    },

    /** DELETE — lança Error com mensagem do servidor. Sem corpo de retorno. */
    async del(path: string, init?: RequestInit): Promise<void> {
        const response = await fetch(path, { method: 'DELETE', ...init });
        if (!response.ok) throw new Error(await extractError(response));
    },
};
