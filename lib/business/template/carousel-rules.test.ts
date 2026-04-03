import { describe, it, expect } from 'vitest'
import {
  CAROUSEL_RULES,
  isValidCarouselCardCount,
  validateCarouselCard,
  validateCarousel,
  validateCarouselWithResult,
  getRemainingCardSlots,
  canAddMoreCards,
  canRemoveCards,
  getRemainingBodyChars,
  getRemainingButtonChars,
} from './carousel-rules'
import type { CarouselCard } from './carousel-rules'

// =============================================================================
// Helpers
// =============================================================================

function makeValidCard(overrides: Partial<CarouselCard> = {}): CarouselCard {
  return {
    components: [
      { type: 'HEADER', format: 'IMAGE' },
      { type: 'BODY', text: 'Texto do card' },
    ],
    ...overrides,
  }
}

function makeCardWithButtons(buttons: Array<{ type: string; text: string }>): CarouselCard {
  return {
    components: [
      { type: 'HEADER', format: 'IMAGE' },
      { type: 'BODY', text: 'Texto' },
      { type: 'BUTTONS', buttons: buttons as CarouselCard['components'][0]['buttons'] },
    ],
  }
}

// =============================================================================
// CAROUSEL_RULES
// =============================================================================

describe('CAROUSEL_RULES', () => {
  it('define MIN_CARDS como 2', () => {
    expect(CAROUSEL_RULES.MIN_CARDS).toBe(2)
  })

  it('define MAX_CARDS como 10', () => {
    expect(CAROUSEL_RULES.MAX_CARDS).toBe(10)
  })

  it('define MAX_BODY_LENGTH como 160', () => {
    expect(CAROUSEL_RULES.MAX_BODY_LENGTH).toBe(160)
  })

  it('define MAX_BUTTON_TEXT como 25', () => {
    expect(CAROUSEL_RULES.MAX_BUTTON_TEXT).toBe(25)
  })

  it('define MAX_BUTTONS_PER_CARD como 2', () => {
    expect(CAROUSEL_RULES.MAX_BUTTONS_PER_CARD).toBe(2)
  })

  it('permite apenas IMAGE e VIDEO como header formats', () => {
    expect(CAROUSEL_RULES.ALLOWED_HEADER_FORMATS).toEqual(['IMAGE', 'VIDEO'])
  })
})

// =============================================================================
// isValidCarouselCardCount
// =============================================================================

describe('isValidCarouselCardCount', () => {
  it('retorna false para 0 cards', () => {
    expect(isValidCarouselCardCount(0)).toBe(false)
  })

  it('retorna false para 1 card', () => {
    expect(isValidCarouselCardCount(1)).toBe(false)
  })

  it('retorna true para 2 cards (mínimo)', () => {
    expect(isValidCarouselCardCount(2)).toBe(true)
  })

  it('retorna true para 5 cards', () => {
    expect(isValidCarouselCardCount(5)).toBe(true)
  })

  it('retorna true para 10 cards (máximo)', () => {
    expect(isValidCarouselCardCount(10)).toBe(true)
  })

  it('retorna false para 11 cards', () => {
    expect(isValidCarouselCardCount(11)).toBe(false)
  })

  it('retorna false para número negativo', () => {
    expect(isValidCarouselCardCount(-1)).toBe(false)
  })
})

// =============================================================================
// validateCarouselCard
// =============================================================================

describe('validateCarouselCard', () => {
  it('retorna array vazio para card válido', () => {
    const card = makeValidCard()
    const errors = validateCarouselCard(card, 0)
    expect(errors).toEqual([])
  })

  it('retorna array vazio para card com header VIDEO', () => {
    const card = makeValidCard({
      components: [
        { type: 'HEADER', format: 'VIDEO' },
        { type: 'BODY', text: 'Texto' },
      ],
    })
    const errors = validateCarouselCard(card, 0)
    expect(errors).toEqual([])
  })

  it('erro quando header está ausente', () => {
    const card: CarouselCard = { components: [{ type: 'BODY', text: 'Texto' }] }
    const errors = validateCarouselCard(card, 0)
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('header')
    expect(errors[0].message).toContain('Card 1')
    expect(errors[0].cardIndex).toBe(0)
  })

  it('erro quando header tem formato TEXT (inválido para carousel)', () => {
    const card: CarouselCard = {
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Título' },
        { type: 'BODY', text: 'Texto' },
      ],
    }
    const errors = validateCarouselCard(card, 0)
    const headerError = errors.find((e) => e.field === 'header.format')
    expect(headerError).toBeDefined()
    expect(headerError!.message).toContain('IMAGE ou VIDEO')
  })

  it('erro quando header tem formato DOCUMENT', () => {
    const card: CarouselCard = {
      components: [
        { type: 'HEADER', format: 'DOCUMENT' },
        { type: 'BODY', text: 'Texto' },
      ],
    }
    const errors = validateCarouselCard(card, 0)
    expect(errors.some((e) => e.field === 'header.format')).toBe(true)
  })

  it('erro quando body está ausente', () => {
    const card: CarouselCard = {
      components: [{ type: 'HEADER', format: 'IMAGE' }],
    }
    const errors = validateCarouselCard(card, 0)
    expect(errors.some((e) => e.field === 'body')).toBe(true)
  })

  it('erro quando body excede MAX_BODY_LENGTH', () => {
    const longText = 'a'.repeat(161)
    const card = makeValidCard({
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: longText },
      ],
    })
    const errors = validateCarouselCard(card, 0)
    expect(errors.some((e) => e.field === 'body.text')).toBe(true)
    expect(errors[0].message).toContain('160')
  })

  it('aceita body com exatamente MAX_BODY_LENGTH caracteres', () => {
    const exactText = 'a'.repeat(160)
    const card = makeValidCard({
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: exactText },
      ],
    })
    const errors = validateCarouselCard(card, 0)
    expect(errors).toEqual([])
  })

  it('erro quando há mais de MAX_BUTTONS_PER_CARD botões', () => {
    const card = makeCardWithButtons([
      { type: 'QUICK_REPLY', text: 'A' },
      { type: 'QUICK_REPLY', text: 'B' },
      { type: 'QUICK_REPLY', text: 'C' },
    ])
    const errors = validateCarouselCard(card, 0)
    expect(errors.some((e) => e.field === 'buttons')).toBe(true)
    expect(errors[0].message).toContain('2')
  })

  it('aceita exatamente MAX_BUTTONS_PER_CARD botões', () => {
    const card = makeCardWithButtons([
      { type: 'QUICK_REPLY', text: 'A' },
      { type: 'QUICK_REPLY', text: 'B' },
    ])
    const errors = validateCarouselCard(card, 0)
    expect(errors).toEqual([])
  })

  it('erro quando texto do botão excede MAX_BUTTON_TEXT', () => {
    const longBtnText = 'a'.repeat(26)
    const card = makeCardWithButtons([
      { type: 'QUICK_REPLY', text: longBtnText },
    ])
    const errors = validateCarouselCard(card, 0)
    expect(errors.some((e) => e.field === 'buttons[0].text')).toBe(true)
    expect(errors[0].message).toContain('25')
  })

  it('aceita texto de botão com exatamente MAX_BUTTON_TEXT', () => {
    const exactBtnText = 'a'.repeat(25)
    const card = makeCardWithButtons([
      { type: 'QUICK_REPLY', text: exactBtnText },
    ])
    const errors = validateCarouselCard(card, 0)
    expect(errors).toEqual([])
  })

  it('usa cardIndex para numerar mensagens de erro (1-based)', () => {
    const card: CarouselCard = { components: [] }
    const errors = validateCarouselCard(card, 2)
    expect(errors[0].message).toContain('Card 3')
    expect(errors[0].cardIndex).toBe(2)
  })

  it('lida com card sem components (undefined/null)', () => {
    const card = { components: undefined } as unknown as CarouselCard
    const errors = validateCarouselCard(card, 0)
    // Deve gerar erros de header e body ausentes
    expect(errors.length).toBeGreaterThanOrEqual(2)
  })

  it('aceita card sem componente BUTTONS', () => {
    const card = makeValidCard()
    const errors = validateCarouselCard(card, 0)
    expect(errors).toEqual([])
  })

  it('múltiplos erros no mesmo card', () => {
    const card: CarouselCard = { components: [] }
    const errors = validateCarouselCard(card, 0)
    // Falta header e body
    expect(errors.length).toBeGreaterThanOrEqual(2)
    expect(errors.some((e) => e.field === 'header')).toBe(true)
    expect(errors.some((e) => e.field === 'body')).toBe(true)
  })
})

// =============================================================================
// validateCarousel
// =============================================================================

describe('validateCarousel', () => {
  it('retorna array vazio para carousel válido', () => {
    const cards = [makeValidCard(), makeValidCard()]
    const errors = validateCarousel(cards)
    expect(errors).toEqual([])
  })

  it('retorna array vazio para null', () => {
    const errors = validateCarousel(null)
    expect(errors).toEqual([])
  })

  it('retorna array vazio para undefined', () => {
    const errors = validateCarousel(undefined)
    expect(errors).toEqual([])
  })

  it('erro quando há apenas 1 card', () => {
    const cards = [makeValidCard()]
    const errors = validateCarousel(cards)
    expect(errors.some((e) => e.field === 'cards')).toBe(true)
    expect(errors[0].message).toContain('2')
    expect(errors[0].message).toContain('10')
  })

  it('erro quando há 11 cards', () => {
    const cards = Array.from({ length: 11 }, () => makeValidCard())
    const errors = validateCarousel(cards)
    expect(errors.some((e) => e.field === 'cards')).toBe(true)
  })

  it('aceita exatamente 10 cards válidos', () => {
    const cards = Array.from({ length: 10 }, () => makeValidCard())
    const errors = validateCarousel(cards)
    expect(errors).toEqual([])
  })

  it('erro quando cards é array vazio', () => {
    const errors = validateCarousel([])
    expect(errors.some((e) => e.field === 'cards')).toBe(true)
  })

  it('acumula erros de contagem + erros de cards individuais', () => {
    const badCard: CarouselCard = { components: [] }
    const errors = validateCarousel([badCard]) // 1 card (< MIN) + card inválido
    // Deve ter erro de contagem + erros de header/body
    expect(errors.length).toBeGreaterThan(1)
  })

  it('valida cada card individualmente', () => {
    const goodCard = makeValidCard()
    const badCard: CarouselCard = { components: [] }
    const errors = validateCarousel([goodCard, badCard])
    // Card 2 (index 1) tem erros
    const card2Errors = errors.filter((e) => e.cardIndex === 1)
    expect(card2Errors.length).toBeGreaterThan(0)
  })
})

// =============================================================================
// validateCarouselWithResult
// =============================================================================

describe('validateCarouselWithResult', () => {
  it('retorna isValid=true para carousel válido', () => {
    const cards = [makeValidCard(), makeValidCard()]
    const result = validateCarouselWithResult(cards)
    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('retorna isValid=false com erros para carousel inválido', () => {
    const cards = [makeValidCard()] // Apenas 1 card
    const result = validateCarouselWithResult(cards)
    expect(result.isValid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('retorna isValid=true para null (nenhum carousel = sem erros)', () => {
    const result = validateCarouselWithResult(null)
    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual([])
  })
})

// =============================================================================
// getRemainingCardSlots
// =============================================================================

describe('getRemainingCardSlots', () => {
  it('retorna slots restantes corretamente', () => {
    expect(getRemainingCardSlots(5)).toBe(5)
  })

  it('retorna 0 quando está no máximo', () => {
    expect(getRemainingCardSlots(10)).toBe(0)
  })

  it('retorna 0 quando excede o máximo', () => {
    expect(getRemainingCardSlots(12)).toBe(0)
  })

  it('retorna MAX_CARDS para 0 cards', () => {
    expect(getRemainingCardSlots(0)).toBe(10)
  })
})

// =============================================================================
// canAddMoreCards
// =============================================================================

describe('canAddMoreCards', () => {
  it('retorna true quando abaixo do máximo', () => {
    expect(canAddMoreCards(5)).toBe(true)
    expect(canAddMoreCards(9)).toBe(true)
  })

  it('retorna false quando no máximo', () => {
    expect(canAddMoreCards(10)).toBe(false)
  })

  it('retorna false quando acima do máximo', () => {
    expect(canAddMoreCards(11)).toBe(false)
  })

  it('retorna true para 0 cards', () => {
    expect(canAddMoreCards(0)).toBe(true)
  })
})

// =============================================================================
// canRemoveCards
// =============================================================================

describe('canRemoveCards', () => {
  it('retorna true quando acima do mínimo', () => {
    expect(canRemoveCards(3)).toBe(true)
    expect(canRemoveCards(10)).toBe(true)
  })

  it('retorna false quando no mínimo', () => {
    expect(canRemoveCards(2)).toBe(false)
  })

  it('retorna false quando abaixo do mínimo', () => {
    expect(canRemoveCards(1)).toBe(false)
    expect(canRemoveCards(0)).toBe(false)
  })
})

// =============================================================================
// getRemainingBodyChars
// =============================================================================

describe('getRemainingBodyChars', () => {
  it('calcula caracteres restantes', () => {
    expect(getRemainingBodyChars(100)).toBe(60)
  })

  it('retorna 0 quando no limite', () => {
    expect(getRemainingBodyChars(160)).toBe(0)
  })

  it('retorna negativo quando excede o limite', () => {
    expect(getRemainingBodyChars(170)).toBe(-10)
  })

  it('retorna MAX_BODY_LENGTH para texto vazio', () => {
    expect(getRemainingBodyChars(0)).toBe(160)
  })
})

// =============================================================================
// getRemainingButtonChars
// =============================================================================

describe('getRemainingButtonChars', () => {
  it('calcula caracteres restantes', () => {
    expect(getRemainingButtonChars(20)).toBe(5)
  })

  it('retorna 0 quando no limite', () => {
    expect(getRemainingButtonChars(25)).toBe(0)
  })

  it('retorna negativo quando excede', () => {
    expect(getRemainingButtonChars(30)).toBe(-5)
  })

  it('retorna MAX_BUTTON_TEXT para texto vazio', () => {
    expect(getRemainingButtonChars(0)).toBe(25)
  })
})
