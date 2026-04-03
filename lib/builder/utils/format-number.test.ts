import { describe, it, expect } from 'vitest'
import { formatAbbreviatedNumber } from './format-number'

describe('formatAbbreviatedNumber', () => {
  // ── Valores abaixo de 1000 (sem abreviação) ───────────────────────────────

  describe('valores abaixo de 1000', () => {
    it('deve retornar "0" para zero', () => {
      expect(formatAbbreviatedNumber(0)).toBe('0')
    })

    it('deve retornar "1" para um', () => {
      expect(formatAbbreviatedNumber(1)).toBe('1')
    })

    it('deve retornar "999" para 999', () => {
      expect(formatAbbreviatedNumber(999)).toBe('999')
    })

    it('deve retornar "500" para 500', () => {
      expect(formatAbbreviatedNumber(500)).toBe('500')
    })

    it('deve lidar com números negativos (toString)', () => {
      expect(formatAbbreviatedNumber(-1)).toBe('-1')
    })

    it('deve lidar com -500', () => {
      expect(formatAbbreviatedNumber(-500)).toBe('-500')
    })
  })

  // ── Valores de 1000 a 999999 (k) ──────────────────────────────────────────

  describe('valores com sufixo k (1000-999999)', () => {
    it('deve retornar "1k" para 1000 (sem .0)', () => {
      expect(formatAbbreviatedNumber(1000)).toBe('1k')
    })

    it('deve retornar "1.1k" para 1100', () => {
      expect(formatAbbreviatedNumber(1100)).toBe('1.1k')
    })

    it('deve retornar "1.1k" para 1109 (arredondamento)', () => {
      expect(formatAbbreviatedNumber(1109)).toBe('1.1k')
    })

    it('deve retornar "1.5k" para 1500', () => {
      expect(formatAbbreviatedNumber(1500)).toBe('1.5k')
    })

    it('deve retornar "2k" para 2000', () => {
      expect(formatAbbreviatedNumber(2000)).toBe('2k')
    })

    it('deve retornar "10k" para 10000', () => {
      expect(formatAbbreviatedNumber(10000)).toBe('10k')
    })

    it('deve retornar "100k" para 100000', () => {
      expect(formatAbbreviatedNumber(100000)).toBe('100k')
    })

    it('deve retornar "999.9k" para 999900', () => {
      expect(formatAbbreviatedNumber(999900)).toBe('999.9k')
    })

    it('deve retornar "999k" para 999000', () => {
      expect(formatAbbreviatedNumber(999000)).toBe('999k')
    })

    it('deve arredondar 1550 para 1.6k', () => {
      // 1550/1000 = 1.55 → toFixed(1) = "1.6"
      expect(formatAbbreviatedNumber(1550)).toBe('1.6k')
    })

    it('deve arredondar 1949 para 1.9k', () => {
      // 1949/1000 = 1.949 → toFixed(1) = "1.9"
      expect(formatAbbreviatedNumber(1949)).toBe('1.9k')
    })

    it('deve formatar 1950 como 1.9k (IEEE 754: 1.95 arredonda para baixo)', () => {
      // 1950/1000 = 1.95 → IEEE 754 armazena como ~1.9499... → toFixed(1) = "1.9"
      expect(formatAbbreviatedNumber(1950)).toBe('1.9k')
    })
  })

  // ── Valores >= 1000000 (M) ─────────────────────────────────────────────────

  describe('valores com sufixo M (>= 1000000)', () => {
    it('deve retornar "1M" para 1000000 (sem .0)', () => {
      expect(formatAbbreviatedNumber(1000000)).toBe('1M')
    })

    it('deve retornar "1.5M" para 1500000', () => {
      expect(formatAbbreviatedNumber(1500000)).toBe('1.5M')
    })

    it('deve retornar "2M" para 2000000', () => {
      expect(formatAbbreviatedNumber(2000000)).toBe('2M')
    })

    it('deve retornar "10M" para 10000000', () => {
      expect(formatAbbreviatedNumber(10000000)).toBe('10M')
    })

    it('deve retornar "1.1M" para 1100000', () => {
      expect(formatAbbreviatedNumber(1100000)).toBe('1.1M')
    })

    it('deve retornar "999.9M" para 999900000', () => {
      expect(formatAbbreviatedNumber(999900000)).toBe('999.9M')
    })

    it('deve lidar com 1 bilhão como 1000M', () => {
      expect(formatAbbreviatedNumber(1000000000)).toBe('1000M')
    })

    it('deve arredondar 1550000 para 1.6M', () => {
      // 1550000/1000000 = 1.55 → toFixed(1) = "1.6"
      expect(formatAbbreviatedNumber(1550000)).toBe('1.6M')
    })
  })

  // ── Boundary exato entre ranges ────────────────────────────────────────────

  describe('fronteiras entre ranges', () => {
    it('deve tratar 999 como valor simples', () => {
      expect(formatAbbreviatedNumber(999)).toBe('999')
    })

    it('deve tratar 1000 como k', () => {
      expect(formatAbbreviatedNumber(1000)).toBe('1k')
    })

    it('deve tratar 999999 como k (toFixed arredonda para 1000.0, mas Math.floor dá 999)', () => {
      // toFixed(1) → "1000.0" → endsWith(".0") true → Math.floor(999999/1000) = 999
      expect(formatAbbreviatedNumber(999999)).toBe('999k')
    })

    it('deve tratar 1000000 como M', () => {
      expect(formatAbbreviatedNumber(1000000)).toBe('1M')
    })
  })
})
