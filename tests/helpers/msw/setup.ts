/**
 * MSW Setup Helpers (Opt-in)
 *
 * Funções para configurar MSW em testes individuais.
 * NÃO é registrado globalmente no vitest.config.ts.
 * Import e chame setupMSW() no describe/beforeAll do seu teste.
 *
 * @example
 * ```ts
 * import { setupMSW } from '@/tests/helpers/msw/setup'
 *
 * describe('WhatsApp Send', () => {
 *   setupMSW()  // Configura beforeAll/afterEach/afterAll automaticamente
 *
 *   it('sends a message', async () => {
 *     // ...
 *   })
 * })
 * ```
 */

import { beforeAll, afterEach, afterAll } from 'vitest'
import { server } from './server'

/**
 * Configura lifecycle hooks do MSW para o bloco de teste atual.
 *
 * - beforeAll: inicia o servidor com `onUnhandledRequest: 'warn'`
 * - afterEach: reseta handlers para os defaults (remove overrides de testes individuais)
 * - afterAll: fecha o servidor
 */
export function setupMSW() {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })
}
