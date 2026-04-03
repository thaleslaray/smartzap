import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

function commandExists(cmd: string) {
  const r = spawnSync('/bin/zsh', ['-lc', `command -v ${cmd}`], { encoding: 'utf8' })
  return r.status === 0
}

const scriptPath = resolve(process.cwd(), 'scripts/schema-parity-check.ts')
const scriptExists = existsSync(scriptPath)

describe('schema parity (smoke)', () => {
  it.skipIf(!scriptExists)('script existe', () => {
    // Script está no .gitignore, só existe localmente
    expect(scriptExists).toBe(true)
  })

  it.skipIf(process.env.RUN_SCHEMA_PARITY !== '1')(
    'executa o parity check em smoke mode (opt-in)',
    () => {
      if (!commandExists('docker')) {
        // eslint-disable-next-line no-console
        console.warn('SKIP: docker não disponível')
        return
      }

      // Smoke mode aceita pular pg_dump se estiver ausente
      const r = spawnSync('/bin/zsh', ['-lc', 'npm run -s schema:parity -- --smoke'], {
        encoding: 'utf8',
        env: { ...process.env },
        timeout: 10 * 60 * 1000,
      })

      if (r.status !== 0) {
        // eslint-disable-next-line no-console
        console.error(r.stdout)
        // eslint-disable-next-line no-console
        console.error(r.stderr)
      }

      expect(r.status).toBe(0)
    },
    10 * 60 * 1000,
  )
})
