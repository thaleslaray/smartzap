/**
 * Utilitarios para testes de API routes.
 *
 * Facilita a criacao de Request/Response para testar route handlers do Next.js 16.
 *
 * @example
 * ```ts
 * const req = createApiRequest('/api/campaigns', { method: 'POST', body: { name: 'Test' } })
 * const res = await POST(req)
 * const { status, data } = await parseJsonResponse(res)
 * ```
 */

/**
 * Cria um Request object para testes de API routes.
 */
export function createApiRequest(url: string, options?: {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  searchParams?: Record<string, string>
  cookie?: string
}): Request {
  const { method = 'GET', body, headers = {}, searchParams, cookie } = options || {}

  const fullUrl = new URL(url, 'http://localhost')
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      fullUrl.searchParams.set(key, value)
    }
  }

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (cookie !== undefined) {
    defaultHeaders['cookie'] = cookie
  } else {
    defaultHeaders['cookie'] = 'smartzap_session=test-session'
  }

  return new Request(fullUrl.toString(), {
    method,
    headers: { ...defaultHeaders, ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

/**
 * Cria contexto com params assincronos (Next.js 16 pattern).
 */
export function createRouteContext<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) }
}

/**
 * Extrai JSON de Response com type safety.
 */
export async function parseJsonResponse<T = unknown>(response: Response): Promise<{ status: number; data: T }> {
  const data = await response.json() as T
  return { status: response.status, data }
}
