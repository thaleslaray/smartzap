import { describe, it, expect } from 'vitest'
import {
  buildImageMessage,
  buildVideoMessage,
  buildAudioMessage,
  buildDocumentMessage,
  buildStickerMessage,
  buildLocationMessage,
  buildReactionMessage,
  buildCarouselMessage,
} from './media'

// =============================================================================
// buildImageMessage
// =============================================================================
describe('buildImageMessage', () => {
  it('deve construir payload com mediaId', () => {
    const result = buildImageMessage({ to: '+5511999999999', mediaId: 'img123' })
    expect(result).toEqual({
      messaging_product: 'whatsapp',
      to: '+5511999999999',
      type: 'image',
      image: { id: 'img123', caption: undefined },
    })
  })

  it('deve construir payload com mediaUrl', () => {
    const result = buildImageMessage({ to: '+5511999999999', mediaUrl: 'https://example.com/img.jpg' })
    expect(result.image.link).toBe('https://example.com/img.jpg')
    expect(result.image.id).toBeUndefined()
  })

  it('deve preferir mediaId quando ambos são informados', () => {
    const result = buildImageMessage({
      to: '+5511999999999',
      mediaId: 'img123',
      mediaUrl: 'https://example.com/img.jpg',
    })
    expect(result.image.id).toBe('img123')
    expect(result.image.link).toBeUndefined()
  })

  it('deve incluir caption quando informado', () => {
    const result = buildImageMessage({
      to: '+5511999999999',
      mediaId: 'img123',
      caption: 'Foto do produto',
    })
    expect(result.image.caption).toBe('Foto do produto')
  })

  it('deve lançar erro quando nem mediaId nem mediaUrl são informados', () => {
    expect(() =>
      buildImageMessage({ to: '+5511999999999' })
    ).toThrow('Either mediaId or mediaUrl must be provided')
  })

  it('deve incluir context quando replyToMessageId é informado', () => {
    const result = buildImageMessage({
      to: '+5511999999999',
      mediaId: 'img123',
      replyToMessageId: 'wamid.abc',
    })
    expect(result.context).toEqual({ message_id: 'wamid.abc' })
  })

  it('não deve incluir context quando replyToMessageId não é informado', () => {
    const result = buildImageMessage({ to: '+5511999999999', mediaId: 'img123' })
    expect(result.context).toBeUndefined()
  })
})

// =============================================================================
// buildVideoMessage
// =============================================================================
describe('buildVideoMessage', () => {
  it('deve construir payload com mediaId', () => {
    const result = buildVideoMessage({ to: '+5511999999999', mediaId: 'vid123' })
    expect(result.messaging_product).toBe('whatsapp')
    expect(result.type).toBe('video')
    expect(result.video.id).toBe('vid123')
  })

  it('deve construir payload com mediaUrl', () => {
    const result = buildVideoMessage({ to: '+5511999999999', mediaUrl: 'https://example.com/vid.mp4' })
    expect(result.video.link).toBe('https://example.com/vid.mp4')
  })

  it('deve incluir caption quando informado', () => {
    const result = buildVideoMessage({
      to: '+5511999999999',
      mediaId: 'vid123',
      caption: 'Vídeo do produto',
    })
    expect(result.video.caption).toBe('Vídeo do produto')
  })

  it('deve lançar erro quando nem mediaId nem mediaUrl são informados', () => {
    expect(() =>
      buildVideoMessage({ to: '+5511999999999' })
    ).toThrow('Either mediaId or mediaUrl must be provided')
  })

  it('deve incluir context quando replyToMessageId é informado', () => {
    const result = buildVideoMessage({
      to: '+5511999999999',
      mediaId: 'vid123',
      replyToMessageId: 'wamid.abc',
    })
    expect(result.context).toEqual({ message_id: 'wamid.abc' })
  })
})

// =============================================================================
// buildAudioMessage
// =============================================================================
describe('buildAudioMessage', () => {
  it('deve construir payload com mediaId', () => {
    const result = buildAudioMessage({ to: '+5511999999999', mediaId: 'aud123' })
    expect(result.messaging_product).toBe('whatsapp')
    expect(result.type).toBe('audio')
    expect(result.audio.id).toBe('aud123')
  })

  it('deve construir payload com mediaUrl', () => {
    const result = buildAudioMessage({ to: '+5511999999999', mediaUrl: 'https://example.com/audio.mp3' })
    expect(result.audio.link).toBe('https://example.com/audio.mp3')
  })

  it('deve lançar erro quando nem mediaId nem mediaUrl são informados', () => {
    expect(() =>
      buildAudioMessage({ to: '+5511999999999' })
    ).toThrow('Either mediaId or mediaUrl must be provided')
  })

  it('não deve ter propriedade caption (áudio não suporta)', () => {
    const result = buildAudioMessage({ to: '+5511999999999', mediaId: 'aud123' })
    expect(result.audio).not.toHaveProperty('caption')
  })

  it('deve incluir context quando replyToMessageId é informado', () => {
    const result = buildAudioMessage({
      to: '+5511999999999',
      mediaId: 'aud123',
      replyToMessageId: 'wamid.abc',
    })
    expect(result.context).toEqual({ message_id: 'wamid.abc' })
  })
})

// =============================================================================
// buildDocumentMessage
// =============================================================================
describe('buildDocumentMessage', () => {
  it('deve construir payload com mediaId e filename', () => {
    const result = buildDocumentMessage({
      to: '+5511999999999',
      mediaId: 'doc123',
      filename: 'relatorio.pdf',
    })
    expect(result.messaging_product).toBe('whatsapp')
    expect(result.type).toBe('document')
    expect(result.document.id).toBe('doc123')
    expect(result.document.filename).toBe('relatorio.pdf')
  })

  it('deve construir payload com mediaUrl', () => {
    const result = buildDocumentMessage({
      to: '+5511999999999',
      mediaUrl: 'https://example.com/doc.pdf',
      filename: 'doc.pdf',
    })
    expect(result.document.link).toBe('https://example.com/doc.pdf')
  })

  it('deve incluir caption quando informado', () => {
    const result = buildDocumentMessage({
      to: '+5511999999999',
      mediaId: 'doc123',
      filename: 'relatorio.pdf',
      caption: 'Relatório mensal',
    })
    expect(result.document.caption).toBe('Relatório mensal')
  })

  it('deve lançar erro quando nem mediaId nem mediaUrl são informados', () => {
    expect(() =>
      buildDocumentMessage({ to: '+5511999999999', filename: 'doc.pdf' })
    ).toThrow('Either mediaId or mediaUrl must be provided')
  })

  it('deve lançar erro quando filename não é informado', () => {
    expect(() =>
      buildDocumentMessage({
        to: '+5511999999999',
        mediaId: 'doc123',
        filename: '',
      })
    ).toThrow('Filename is required')
  })

  it('deve incluir context quando replyToMessageId é informado', () => {
    const result = buildDocumentMessage({
      to: '+5511999999999',
      mediaId: 'doc123',
      filename: 'doc.pdf',
      replyToMessageId: 'wamid.abc',
    })
    expect(result.context).toEqual({ message_id: 'wamid.abc' })
  })
})

// =============================================================================
// buildStickerMessage
// =============================================================================
describe('buildStickerMessage', () => {
  it('deve construir payload com mediaId', () => {
    const result = buildStickerMessage({ to: '+5511999999999', mediaId: 'stk123' })
    expect(result.messaging_product).toBe('whatsapp')
    expect(result.type).toBe('sticker')
    expect(result.sticker.id).toBe('stk123')
  })

  it('deve construir payload com mediaUrl', () => {
    const result = buildStickerMessage({ to: '+5511999999999', mediaUrl: 'https://example.com/sticker.webp' })
    expect(result.sticker.link).toBe('https://example.com/sticker.webp')
  })

  it('deve lançar erro quando nem mediaId nem mediaUrl são informados', () => {
    expect(() =>
      buildStickerMessage({ to: '+5511999999999' })
    ).toThrow('Either mediaId or mediaUrl must be provided')
  })

  it('deve incluir context quando replyToMessageId é informado', () => {
    const result = buildStickerMessage({
      to: '+5511999999999',
      mediaId: 'stk123',
      replyToMessageId: 'wamid.abc',
    })
    expect(result.context).toEqual({ message_id: 'wamid.abc' })
  })
})

// =============================================================================
// buildLocationMessage
// =============================================================================
describe('buildLocationMessage', () => {
  it('deve construir payload com latitude e longitude', () => {
    const result = buildLocationMessage({
      to: '+5511999999999',
      latitude: -23.5505,
      longitude: -46.6333,
    })
    expect(result).toEqual({
      messaging_product: 'whatsapp',
      to: '+5511999999999',
      type: 'location',
      location: {
        latitude: -23.5505,
        longitude: -46.6333,
        name: undefined,
        address: undefined,
      },
    })
  })

  it('deve incluir name e address quando informados', () => {
    const result = buildLocationMessage({
      to: '+5511999999999',
      latitude: -23.5505,
      longitude: -46.6333,
      name: 'Praça da Sé',
      address: 'São Paulo, SP',
    })
    expect(result.location.name).toBe('Praça da Sé')
    expect(result.location.address).toBe('São Paulo, SP')
  })

  it('deve aceitar coordenadas zero (ponto nulo, Golfo da Guiné)', () => {
    const result = buildLocationMessage({
      to: '+5511999999999',
      latitude: 0,
      longitude: 0,
    })
    expect(result.location.latitude).toBe(0)
    expect(result.location.longitude).toBe(0)
  })

  it('deve aceitar coordenadas negativas', () => {
    const result = buildLocationMessage({
      to: '+5511999999999',
      latitude: -90,
      longitude: -180,
    })
    expect(result.location.latitude).toBe(-90)
    expect(result.location.longitude).toBe(-180)
  })

  it('deve incluir context quando replyToMessageId é informado', () => {
    const result = buildLocationMessage({
      to: '+5511999999999',
      latitude: -23.5505,
      longitude: -46.6333,
      replyToMessageId: 'wamid.abc',
    })
    expect(result.context).toEqual({ message_id: 'wamid.abc' })
  })
})

// =============================================================================
// buildReactionMessage
// =============================================================================
describe('buildReactionMessage', () => {
  it('deve construir payload de reação com emoji', () => {
    const result = buildReactionMessage({
      to: '+5511999999999',
      messageId: 'wamid.msg123',
      emoji: '👍',
    })
    expect(result).toEqual({
      messaging_product: 'whatsapp',
      to: '+5511999999999',
      type: 'reaction',
      reaction: {
        message_id: 'wamid.msg123',
        emoji: '👍',
      },
    })
  })

  it('deve aceitar string vazia para remover reação', () => {
    const result = buildReactionMessage({
      to: '+5511999999999',
      messageId: 'wamid.msg123',
      emoji: '',
    })
    expect(result.reaction.emoji).toBe('')
  })

  it('deve aceitar diversos emojis', () => {
    const emojis = ['❤️', '😂', '🎉', '🔥', '👏']
    for (const emoji of emojis) {
      const result = buildReactionMessage({
        to: '+5511999999999',
        messageId: 'wamid.msg123',
        emoji,
      })
      expect(result.reaction.emoji).toBe(emoji)
    }
  })
})

// =============================================================================
// buildCarouselMessage
// =============================================================================
describe('buildCarouselMessage', () => {
  const makeCard = (type: 'image' | 'video' = 'image', index = 0) => ({
    header: { type, mediaId: `media_${index}` },
    body: `Produto ${index}`,
    action: { buttonText: `Comprar ${index}`, url: `https://example.com/${index}` },
  })

  it('deve construir payload com 2 cards (mínimo)', () => {
    const result = buildCarouselMessage({
      to: '+5511999999999',
      cards: [makeCard('image', 0), makeCard('image', 1)],
    })
    expect(result.messaging_product).toBe('whatsapp')
    expect(result.type).toBe('interactive')
    expect(result.interactive.type).toBe('carousel')
    expect(result.interactive.action.carousel_cards).toHaveLength(2)
  })

  it('deve construir payload com 10 cards (máximo)', () => {
    const cards = Array.from({ length: 10 }, (_, i) => makeCard('image', i))
    const result = buildCarouselMessage({ to: '+5511999999999', cards })
    expect(result.interactive.action.carousel_cards).toHaveLength(10)
  })

  it('deve lançar erro com menos de 2 cards', () => {
    expect(() =>
      buildCarouselMessage({ to: '+5511999999999', cards: [makeCard()] })
    ).toThrow('between 2 and 10 cards')
  })

  it('deve lançar erro com mais de 10 cards', () => {
    const cards = Array.from({ length: 11 }, (_, i) => makeCard('image', i))
    expect(() =>
      buildCarouselMessage({ to: '+5511999999999', cards })
    ).toThrow('between 2 and 10 cards')
  })

  it('deve lançar erro com 0 cards', () => {
    expect(() =>
      buildCarouselMessage({ to: '+5511999999999', cards: [] })
    ).toThrow('between 2 and 10 cards')
  })

  it('deve lançar erro quando tipos de header são diferentes', () => {
    expect(() =>
      buildCarouselMessage({
        to: '+5511999999999',
        cards: [makeCard('image', 0), makeCard('video', 1)],
      })
    ).toThrow('same header type')
  })

  it('deve aceitar todos os cards com header tipo "video"', () => {
    const cards = [makeCard('video', 0), makeCard('video', 1)]
    const result = buildCarouselMessage({ to: '+5511999999999', cards })
    expect(result.interactive.action.carousel_cards).toHaveLength(2)
  })

  it('deve indexar cards corretamente (card_index)', () => {
    const cards = [makeCard('image', 0), makeCard('image', 1), makeCard('image', 2)]
    const result = buildCarouselMessage({ to: '+5511999999999', cards })
    result.interactive.action.carousel_cards.forEach((card: { card_index: number }, i: number) => {
      expect(card.card_index).toBe(i)
    })
  })

  it('deve construir componentes HEADER, BODY e BUTTON para cada card', () => {
    const cards = [makeCard('image', 0), makeCard('image', 1)]
    const result = buildCarouselMessage({ to: '+5511999999999', cards })

    const firstCard = result.interactive.action.carousel_cards[0]
    const types = firstCard.components.map((c: { type: string }) => c.type)
    expect(types).toEqual(['HEADER', 'BODY', 'BUTTON'])
  })

  it('deve usar mediaId no header quando informado', () => {
    const cards = [makeCard('image', 0), makeCard('image', 1)]
    const result = buildCarouselMessage({ to: '+5511999999999', cards })

    const headerComponent = result.interactive.action.carousel_cards[0].components[0]
    expect(headerComponent.parameters[0].image).toEqual({ id: 'media_0' })
  })

  it('deve usar mediaUrl no header quando mediaId não é informado', () => {
    const cards = [
      {
        header: { type: 'image' as const, mediaUrl: 'https://example.com/img.jpg' },
        body: 'Produto',
        action: { buttonText: 'Comprar', url: 'https://example.com' },
      },
      {
        header: { type: 'image' as const, mediaUrl: 'https://example.com/img2.jpg' },
        body: 'Produto 2',
        action: { buttonText: 'Comprar', url: 'https://example.com/2' },
      },
    ]
    const result = buildCarouselMessage({ to: '+5511999999999', cards })

    const headerComponent = result.interactive.action.carousel_cards[0].components[0]
    expect(headerComponent.parameters[0].image).toEqual({ link: 'https://example.com/img.jpg' })
  })

  it('deve incluir context quando replyToMessageId é informado', () => {
    const cards = [makeCard('image', 0), makeCard('image', 1)]
    const result = buildCarouselMessage({
      to: '+5511999999999',
      cards,
      replyToMessageId: 'wamid.abc',
    })
    expect(result.context).toEqual({ message_id: 'wamid.abc' })
  })

  it('não deve incluir context quando replyToMessageId não é informado', () => {
    const cards = [makeCard('image', 0), makeCard('image', 1)]
    const result = buildCarouselMessage({ to: '+5511999999999', cards })
    expect(result.context).toBeUndefined()
  })
})
