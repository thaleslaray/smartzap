import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getRelativeTime } from './time'

describe('getRelativeTime', () => {
  const NOW = new Date('2026-02-08T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── "just now" (< 60 segundos) ────────────────────────────────────────────

  describe('retorna "just now"', () => {
    it('deve retornar "just now" para 0 segundos atrás', () => {
      expect(getRelativeTime(NOW)).toBe('just now')
    })

    it('deve retornar "just now" para 30 segundos atrás', () => {
      const date = new Date(NOW.getTime() - 30 * 1000)
      expect(getRelativeTime(date)).toBe('just now')
    })

    it('deve retornar "just now" para 59 segundos atrás', () => {
      const date = new Date(NOW.getTime() - 59 * 1000)
      expect(getRelativeTime(date)).toBe('just now')
    })
  })

  // ── Minutos ────────────────────────────────────────────────────────────────

  describe('retorna minutos', () => {
    it('deve retornar "1 min ago" para exatamente 1 minuto', () => {
      const date = new Date(NOW.getTime() - 60 * 1000)
      expect(getRelativeTime(date)).toBe('1 min ago')
    })

    it('deve retornar "2 mins ago" para 2 minutos (plural)', () => {
      const date = new Date(NOW.getTime() - 2 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('2 mins ago')
    })

    it('deve retornar "59 mins ago" para 59 minutos', () => {
      const date = new Date(NOW.getTime() - 59 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('59 mins ago')
    })

    it('deve retornar "30 mins ago" para 30 minutos', () => {
      const date = new Date(NOW.getTime() - 30 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('30 mins ago')
    })
  })

  // ── Horas ──────────────────────────────────────────────────────────────────

  describe('retorna horas', () => {
    it('deve retornar "1 hour ago" para exatamente 1 hora', () => {
      const date = new Date(NOW.getTime() - 60 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('1 hour ago')
    })

    it('deve retornar "2 hours ago" para 2 horas (plural)', () => {
      const date = new Date(NOW.getTime() - 2 * 60 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('2 hours ago')
    })

    it('deve retornar "23 hours ago" para 23 horas', () => {
      const date = new Date(NOW.getTime() - 23 * 60 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('23 hours ago')
    })
  })

  // ── Dias ───────────────────────────────────────────────────────────────────

  describe('retorna dias', () => {
    it('deve retornar "1 day ago" para exatamente 1 dia', () => {
      const date = new Date(NOW.getTime() - 24 * 60 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('1 day ago')
    })

    it('deve retornar "2 days ago" para 2 dias (plural)', () => {
      const date = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('2 days ago')
    })

    it('deve retornar "6 days ago" para 6 dias', () => {
      const date = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('6 days ago')
    })
  })

  // ── Semanas ────────────────────────────────────────────────────────────────

  describe('retorna semanas', () => {
    it('deve retornar "1 week ago" para exatamente 7 dias', () => {
      const date = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('1 week ago')
    })

    it('deve retornar "2 weeks ago" para 14 dias (plural)', () => {
      const date = new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('2 weeks ago')
    })

    it('deve retornar "3 weeks ago" para 21 dias', () => {
      const date = new Date(NOW.getTime() - 21 * 24 * 60 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('3 weeks ago')
    })
  })

  // ── Meses ──────────────────────────────────────────────────────────────────

  describe('retorna meses', () => {
    it('deve retornar "1 month ago" para 30 dias', () => {
      const date = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('1 month ago')
    })

    it('deve retornar "2 months ago" para 60 dias (plural)', () => {
      const date = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('2 months ago')
    })

    it('deve retornar "11 months ago" para 330 dias', () => {
      const date = new Date(NOW.getTime() - 330 * 24 * 60 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('11 months ago')
    })
  })

  // ── Anos ───────────────────────────────────────────────────────────────────

  describe('retorna anos', () => {
    it('deve retornar "1 year ago" para 365 dias', () => {
      const date = new Date(NOW.getTime() - 365 * 24 * 60 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('1 year ago')
    })

    it('deve retornar "2 years ago" para 730 dias (plural)', () => {
      const date = new Date(NOW.getTime() - 730 * 24 * 60 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('2 years ago')
    })

    it('deve retornar "5 years ago" para 1825 dias', () => {
      const date = new Date(NOW.getTime() - 1825 * 24 * 60 * 60 * 1000)
      expect(getRelativeTime(date)).toBe('5 years ago')
    })
  })

  // ── String ISO como entrada ────────────────────────────────────────────────

  describe('aceita string ISO como entrada', () => {
    it('deve parsear string ISO date corretamente', () => {
      const isoString = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString()
      expect(getRelativeTime(isoString)).toBe('5 mins ago')
    })
  })

  // ── Fronteiras entre unidades ──────────────────────────────────────────────

  describe('fronteiras entre unidades', () => {
    it('deve mudar de "just now" para minutos em 60 segundos', () => {
      const at59s = new Date(NOW.getTime() - 59 * 1000)
      const at60s = new Date(NOW.getTime() - 60 * 1000)
      expect(getRelativeTime(at59s)).toBe('just now')
      expect(getRelativeTime(at60s)).toBe('1 min ago')
    })

    it('deve mudar de minutos para horas em 60 minutos', () => {
      const at59m = new Date(NOW.getTime() - 59 * 60 * 1000)
      const at60m = new Date(NOW.getTime() - 60 * 60 * 1000)
      expect(getRelativeTime(at59m)).toBe('59 mins ago')
      expect(getRelativeTime(at60m)).toBe('1 hour ago')
    })

    it('deve mudar de horas para dias em 24 horas', () => {
      const at23h = new Date(NOW.getTime() - 23 * 60 * 60 * 1000)
      const at24h = new Date(NOW.getTime() - 24 * 60 * 60 * 1000)
      expect(getRelativeTime(at23h)).toBe('23 hours ago')
      expect(getRelativeTime(at24h)).toBe('1 day ago')
    })

    it('deve mudar de dias para semanas em 7 dias', () => {
      const at6d = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000)
      const at7d = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000)
      expect(getRelativeTime(at6d)).toBe('6 days ago')
      expect(getRelativeTime(at7d)).toBe('1 week ago')
    })
  })
})
