/**
 * Hook Test Utilities
 *
 * Helpers para testar hooks React que usam React Query, Sonner (toast),
 * e Next.js navigation. Fornece QueryClientProvider configurado para testes.
 *
 * @example
 * ```ts
 * import { renderHookWithProviders, waitFor } from '@/tests/helpers/hook-test-utils'
 *
 * it('retorna dados', async () => {
 *   const { result } = renderHookWithProviders(() => useMyHook())
 *   await waitFor(() => expect(result.current.isLoading).toBe(false))
 *   expect(result.current.data).toBeDefined()
 * })
 * ```
 */

import React from 'react'
import { renderHook, waitFor, type RenderHookOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Re-export para conveniência
export { waitFor, act } from '@testing-library/react'

/**
 * Cria um QueryClient configurado para testes:
 * - retry: false (falha imediata em erros)
 * - gcTime: 0 (sem cache entre testes)
 * - staleTime: 0 (sempre refetch)
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

/**
 * Wrapper com QueryClientProvider para uso com renderHook.
 * Cria um novo QueryClient para cada chamada (isolamento entre testes).
 */
function createWrapper(queryClient?: QueryClient) {
  const client = queryClient ?? createTestQueryClient()

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client },
      children
    )
  }
}

/**
 * renderHook com QueryClientProvider incluso.
 * Aceita queryClient customizado para cenários de pre-seeding.
 */
export function renderHookWithProviders<TResult>(
  hook: () => TResult,
  options?: {
    queryClient?: QueryClient
  } & Omit<RenderHookOptions<unknown>, 'wrapper'>
) {
  const queryClient = options?.queryClient ?? createTestQueryClient()
  const { queryClient: _, ...renderOptions } = options ?? {}

  return {
    queryClient,
    ...renderHook(hook, {
      wrapper: createWrapper(queryClient),
      ...renderOptions,
    }),
  }
}
