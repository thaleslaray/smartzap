import { describe, it, expect } from 'vitest'
import { getHealthSummary, type AccountHealth } from './account-health'

function makeHealth(status: AccountHealth['status']): AccountHealth {
  return {
    isHealthy: status === 'healthy',
    status,
    checks: [],
    lastChecked: new Date(),
  }
}

describe('getHealthSummary', () => {
  it('returns green summary for healthy status', () => {
    const summary = getHealthSummary(makeHealth('healthy'))

    expect(summary.icon).toBe('✅')
    expect(summary.color).toBe('green')
    expect(summary.title).toBe('Conta Saudável')
    expect(summary.description).toContain('funcionando normalmente')
  })

  it('returns yellow summary for degraded status', () => {
    const summary = getHealthSummary(makeHealth('degraded'))

    expect(summary.icon).toBe('⚠️')
    expect(summary.color).toBe('yellow')
    expect(summary.title).toBe('Atenção')
    expect(summary.description).toContain('avisos')
  })

  it('returns red summary for unhealthy status', () => {
    const summary = getHealthSummary(makeHealth('unhealthy'))

    expect(summary.icon).toBe('❌')
    expect(summary.color).toBe('red')
    expect(summary.title).toBe('Problema Detectado')
    expect(summary.description).toContain('impedem o envio')
  })

  it('returns gray summary for unknown status', () => {
    const summary = getHealthSummary(makeHealth('unknown'))

    expect(summary.icon).toBe('❓')
    expect(summary.color).toBe('gray')
    expect(summary.title).toBe('Status Desconhecido')
    expect(summary.description).toContain('Não foi possível')
  })

  it('treats unrecognized status as unknown (default branch)', () => {
    // Force an unexpected status to test the default case
    const health = makeHealth('unknown')
    ;(health as any).status = 'something_else'

    const summary = getHealthSummary(health)
    expect(summary.color).toBe('gray')
    expect(summary.title).toBe('Status Desconhecido')
  })
})
