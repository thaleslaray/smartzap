/**
 * MSW Server para Node.js (Vitest)
 *
 * Configura um servidor MSW com os handlers padrão da Meta API.
 *
 * @example
 * ```ts
 * import { server } from '@/tests/helpers/msw/server'
 *
 * beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
 * afterEach(() => server.resetHandlers())
 * afterAll(() => server.close())
 * ```
 */

import { setupServer } from 'msw/node'
import { metaHandlers } from './handlers'

export const server = setupServer(...metaHandlers)
