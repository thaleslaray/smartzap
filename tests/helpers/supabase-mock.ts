/**
 * Supabase Query Builder Mock
 *
 * Mock genérico e reutilizável para o query builder do Supabase.
 * Suporta chains fluentes: select().eq().order().limit(), insert().select(),
 * update().eq(), delete().eq(), .single(), .maybeSingle(), etc.
 *
 * Generalização do pattern originalmente em lib/flow-mapping.test.ts:14-47.
 *
 * @example
 * ```ts
 * const qb = createMockQueryBuilder({ data: [{ id: '1' }] })
 * vi.mocked(supabase.from).mockReturnValue(qb as any)
 *
 * // Agora supabase.from('campaigns').select('*').eq('id', '1') retorna { data, error: null }
 * ```
 */

import { vi, type Mock } from 'vitest'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MockQueryBuilderOptions {
  /** Dados retornados nos terminais (select, single, maybeSingle, etc.) */
  data?: unknown
  /** Erro retornado nos terminais */
  error?: Error | { message: string; code?: string } | null
  /** Contagem retornada junto com data (para queries com { count: 'exact' }) */
  count?: number | null
}

export interface MockQueryBuilder {
  select: Mock
  insert: Mock
  update: Mock
  delete: Mock
  upsert: Mock
  eq: Mock
  neq: Mock
  gt: Mock
  gte: Mock
  lt: Mock
  lte: Mock
  like: Mock
  ilike: Mock
  is: Mock
  in: Mock
  or: Mock
  not: Mock
  filter: Mock
  contains: Mock
  containedBy: Mock
  order: Mock
  limit: Mock
  range: Mock
  single: Mock
  maybeSingle: Mock
  then: undefined
  /** Resultado que seria retornado ao final da chain (para await direto) */
  [Symbol.iterator]?: never
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Cria um mock do query builder do Supabase que suporta chains fluentes arbitrárias.
 *
 * Todos os métodos intermediários (eq, order, limit, etc.) retornam o próprio builder,
 * permitindo chains de qualquer profundidade. Os terminais (.single(), .maybeSingle(),
 * ou o próprio builder quando awaited) resolvem com { data, error, count }.
 */
export function createMockQueryBuilder(
  options: MockQueryBuilderOptions = {}
): MockQueryBuilder {
  const { data = null, error = null, count = null } = options

  // Resultado terminal
  const terminalResult = { data, error, count }

  // Cria um objeto com todos os métodos mockados
  const builder: Record<string, unknown> = {}

  // Métodos de query (intermediários - retornam o próprio builder)
  const chainMethods = [
    'select',
    'insert',
    'update',
    'delete',
    'upsert',
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'like',
    'ilike',
    'is',
    'in',
    'or',
    'not',
    'filter',
    'contains',
    'containedBy',
    'order',
    'limit',
    'range',
  ]

  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }

  // Terminais - retornam o resultado
  builder.single = vi.fn().mockReturnValue(terminalResult)
  builder.maybeSingle = vi.fn().mockReturnValue(terminalResult)

  // Para queries que são awaited diretamente (sem .single()),
  // o builder precisa ser "thenable".
  // Usamos uma propriedade `then` para simular uma Promise.
  Object.defineProperty(builder, 'then', {
    value: (resolve: (v: unknown) => void) => resolve(terminalResult),
    writable: true,
    configurable: true,
  })

  return builder as unknown as MockQueryBuilder
}

/**
 * Cria um mock completo do módulo `@/lib/supabase` com `supabase.from()`.
 *
 * Use com `vi.mock('@/lib/supabase', () => mockSupabaseModule())`.
 *
 * @param defaultOptions - Opções padrão para o query builder retornado por `from()`
 *
 * @example
 * ```ts
 * vi.mock('@/lib/supabase', () => mockSupabaseModule({ data: [] }))
 * ```
 */
export function mockSupabaseModule(defaultOptions: MockQueryBuilderOptions = {}) {
  const fromFn = vi.fn().mockImplementation(() => createMockQueryBuilder(defaultOptions))
  const rpcFn = vi.fn().mockResolvedValue({ data: null, error: null })

  return {
    supabase: {
      from: fromFn,
      rpc: rpcFn,
      admin: null,
      browser: null,
    },
    getSupabaseAdmin: vi.fn().mockReturnValue(null),
    getSupabaseBrowser: vi.fn().mockReturnValue(null),
  }
}

/**
 * Configura `supabase.from()` para retornar builders diferentes por tabela.
 *
 * @example
 * ```ts
 * const fromMock = vi.mocked(supabase.from)
 * configureMockPerTable(fromMock, {
 *   campaigns: createMockQueryBuilder({ data: [buildCampaign()] }),
 *   contacts: createMockQueryBuilder({ data: [buildContact()] }),
 * })
 * ```
 */
export function configureMockPerTable(
  fromMock: Mock,
  tableBuilders: Record<string, MockQueryBuilder>
) {
  fromMock.mockImplementation((table: string) => {
    return tableBuilders[table] ?? createMockQueryBuilder()
  })
}
