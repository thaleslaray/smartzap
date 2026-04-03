import { describe, it, expect } from 'vitest'
import {
  buildReplyButtons,
  buildListMessage,
  buildCtaUrl,
  buildLocationRequest,
  buildMenu,
} from './interactive'

// =============================================================================
// buildReplyButtons
// =============================================================================
describe('buildReplyButtons', () => {
  const baseOptions = {
    to: '+5511999999999',
    body: 'Escolha uma opção:',
    buttons: [
      { id: 'btn1', title: 'Opção 1' },
      { id: 'btn2', title: 'Opção 2' },
    ],
  }

  it('deve construir payload com 2 botões', () => {
    const result = buildReplyButtons(baseOptions)
    expect(result.messaging_product).toBe('whatsapp')
    expect(result.to).toBe('+5511999999999')
    expect(result.type).toBe('interactive')
    expect(result.interactive.type).toBe('button')
    expect(result.interactive.body.text).toBe('Escolha uma opção:')

    const action = result.interactive.action as { buttons: Array<{ type: string; reply: { id: string; title: string } }> }
    expect(action.buttons).toHaveLength(2)
    expect(action.buttons[0]).toEqual({ type: 'reply', reply: { id: 'btn1', title: 'Opção 1' } })
  })

  it('deve aceitar exatamente 3 botões (limite máximo)', () => {
    const result = buildReplyButtons({
      ...baseOptions,
      buttons: [
        { id: '1', title: 'A' },
        { id: '2', title: 'B' },
        { id: '3', title: 'C' },
      ],
    })
    const action = result.interactive.action as { buttons: unknown[] }
    expect(action.buttons).toHaveLength(3)
  })

  it('deve lançar erro com mais de 3 botões', () => {
    expect(() =>
      buildReplyButtons({
        ...baseOptions,
        buttons: [
          { id: '1', title: 'A' },
          { id: '2', title: 'B' },
          { id: '3', title: 'C' },
          { id: '4', title: 'D' },
        ],
      })
    ).toThrow('max 3 buttons')
  })

  it('deve lançar erro quando título do botão excede 20 caracteres', () => {
    expect(() =>
      buildReplyButtons({
        ...baseOptions,
        buttons: [{ id: '1', title: 'A'.repeat(21) }],
      })
    ).toThrow('exceeds 20 character limit')
  })

  it('deve aceitar título com exatamente 20 caracteres', () => {
    expect(() =>
      buildReplyButtons({
        ...baseOptions,
        buttons: [{ id: '1', title: 'A'.repeat(20) }],
      })
    ).not.toThrow()
  })

  it('deve incluir header de texto quando informado', () => {
    const result = buildReplyButtons({
      ...baseOptions,
      header: { type: 'text', text: 'Cabeçalho' },
    })
    expect(result.interactive.header).toEqual({ type: 'text', text: 'Cabeçalho' })
  })

  it('deve incluir header de imagem com mediaId', () => {
    const result = buildReplyButtons({
      ...baseOptions,
      header: { type: 'image', mediaId: 'img123' },
    })
    expect(result.interactive.header).toEqual({ type: 'image', image: { id: 'img123' } })
  })

  it('deve incluir header de imagem com mediaUrl', () => {
    const result = buildReplyButtons({
      ...baseOptions,
      header: { type: 'image', mediaUrl: 'https://example.com/img.jpg' },
    })
    expect(result.interactive.header).toEqual({
      type: 'image',
      image: { link: 'https://example.com/img.jpg' },
    })
  })

  it('deve incluir header de vídeo', () => {
    const result = buildReplyButtons({
      ...baseOptions,
      header: { type: 'video', mediaId: 'vid123' },
    })
    expect(result.interactive.header).toEqual({ type: 'video', video: { id: 'vid123' } })
  })

  it('deve incluir header de documento com filename', () => {
    const result = buildReplyButtons({
      ...baseOptions,
      header: { type: 'document', mediaId: 'doc123', filename: 'arquivo.pdf' },
    })
    expect(result.interactive.header).toEqual({
      type: 'document',
      document: { id: 'doc123', filename: 'arquivo.pdf' },
    })
  })

  it('deve incluir footer quando informado', () => {
    const result = buildReplyButtons({ ...baseOptions, footer: 'Texto do rodapé' })
    expect(result.interactive.footer).toEqual({ text: 'Texto do rodapé' })
  })

  it('deve lançar erro quando footer excede 60 caracteres', () => {
    expect(() =>
      buildReplyButtons({ ...baseOptions, footer: 'A'.repeat(61) })
    ).toThrow('Footer text exceeds 60 character limit')
  })

  it('deve aceitar footer com exatamente 60 caracteres', () => {
    expect(() =>
      buildReplyButtons({ ...baseOptions, footer: 'A'.repeat(60) })
    ).not.toThrow()
  })

  it('não deve incluir header quando não informado', () => {
    const result = buildReplyButtons(baseOptions)
    expect(result.interactive.header).toBeUndefined()
  })

  it('não deve incluir footer quando não informado', () => {
    const result = buildReplyButtons(baseOptions)
    expect(result.interactive.footer).toBeUndefined()
  })

  it('deve incluir context quando replyToMessageId é informado', () => {
    const result = buildReplyButtons({ ...baseOptions, replyToMessageId: 'wamid.abc' })
    expect(result.context).toEqual({ message_id: 'wamid.abc' })
  })

  it('não deve incluir context quando replyToMessageId não é informado', () => {
    const result = buildReplyButtons(baseOptions)
    expect(result.context).toBeUndefined()
  })
})

// =============================================================================
// buildListMessage
// =============================================================================
describe('buildListMessage', () => {
  const baseOptions = {
    to: '+5511999999999',
    body: 'Escolha um item:',
    buttonText: 'Ver opções',
    sections: [
      {
        title: 'Seção 1',
        rows: [
          { id: 'r1', title: 'Item 1', description: 'Descrição 1' },
          { id: 'r2', title: 'Item 2' },
        ],
      },
    ],
  }

  it('deve construir payload de list message', () => {
    const result = buildListMessage(baseOptions)
    expect(result.messaging_product).toBe('whatsapp')
    expect(result.interactive.type).toBe('list')
    expect(result.interactive.body.text).toBe('Escolha um item:')

    const action = result.interactive.action as { button: string; sections: unknown[] }
    expect(action.button).toBe('Ver opções')
    expect(action.sections).toHaveLength(1)
  })

  it('deve lançar erro quando buttonText excede 20 caracteres', () => {
    expect(() =>
      buildListMessage({ ...baseOptions, buttonText: 'A'.repeat(21) })
    ).toThrow('List button text exceeds 20 character limit')
  })

  it('deve lançar erro quando título da row excede 24 caracteres', () => {
    expect(() =>
      buildListMessage({
        ...baseOptions,
        sections: [{ rows: [{ id: '1', title: 'A'.repeat(25) }] }],
      })
    ).toThrow('exceeds 24 character limit')
  })

  it('deve aceitar título da row com exatamente 24 caracteres', () => {
    expect(() =>
      buildListMessage({
        ...baseOptions,
        sections: [{ rows: [{ id: '1', title: 'A'.repeat(24) }] }],
      })
    ).not.toThrow()
  })

  it('deve lançar erro quando descrição da row excede 72 caracteres', () => {
    expect(() =>
      buildListMessage({
        ...baseOptions,
        sections: [{ rows: [{ id: '1', title: 'Item', description: 'A'.repeat(73) }] }],
      })
    ).toThrow('Row description exceeds 72 character limit')
  })

  it('deve aceitar descrição com exatamente 72 caracteres', () => {
    expect(() =>
      buildListMessage({
        ...baseOptions,
        sections: [{ rows: [{ id: '1', title: 'Item', description: 'A'.repeat(72) }] }],
      })
    ).not.toThrow()
  })

  it('deve lançar erro quando seção tem mais de 10 rows', () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, title: `Item ${i}` }))
    expect(() =>
      buildListMessage({ ...baseOptions, sections: [{ rows }] })
    ).toThrow() // vai dar erro de total > 10 primeiro
  })

  it('deve lançar erro quando total de rows excede 10', () => {
    const rows1 = Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, title: `A${i}` }))
    const rows2 = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, title: `B${i}` }))
    expect(() =>
      buildListMessage({
        ...baseOptions,
        sections: [{ rows: rows1 }, { rows: rows2 }],
      })
    ).toThrow('max 10 total items')
  })

  it('deve aceitar exatamente 10 rows no total', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, title: `Item ${i}` }))
    expect(() =>
      buildListMessage({ ...baseOptions, sections: [{ rows }] })
    ).not.toThrow()
  })

  it('deve incluir header de texto quando informado', () => {
    const result = buildListMessage({
      ...baseOptions,
      header: { type: 'text', text: 'Cabeçalho' },
    })
    expect(result.interactive.header).toEqual({ type: 'text', text: 'Cabeçalho' })
  })

  it('deve incluir footer quando informado', () => {
    const result = buildListMessage({ ...baseOptions, footer: 'Rodapé' })
    expect(result.interactive.footer).toEqual({ text: 'Rodapé' })
  })

  it('deve lançar erro quando footer excede 60 caracteres', () => {
    expect(() =>
      buildListMessage({ ...baseOptions, footer: 'A'.repeat(61) })
    ).toThrow('Footer text exceeds 60 character limit')
  })

  it('deve incluir context quando replyToMessageId é informado', () => {
    const result = buildListMessage({ ...baseOptions, replyToMessageId: 'wamid.abc' })
    expect(result.context).toEqual({ message_id: 'wamid.abc' })
  })
})

// =============================================================================
// buildCtaUrl
// =============================================================================
describe('buildCtaUrl', () => {
  const baseOptions = {
    to: '+5511999999999',
    body: 'Clique no botão abaixo',
    buttonText: 'Acessar site',
    url: 'https://example.com',
  }

  it('deve construir payload de CTA URL', () => {
    const result = buildCtaUrl(baseOptions)
    expect(result.messaging_product).toBe('whatsapp')
    expect(result.interactive.type).toBe('cta_url')
    expect(result.interactive.body.text).toBe('Clique no botão abaixo')

    const action = result.interactive.action as { name: string; parameters: { display_text: string; url: string } }
    expect(action.name).toBe('cta_url')
    expect(action.parameters.display_text).toBe('Acessar site')
    expect(action.parameters.url).toBe('https://example.com')
  })

  it('deve lançar erro quando buttonText excede 20 caracteres', () => {
    expect(() =>
      buildCtaUrl({ ...baseOptions, buttonText: 'A'.repeat(21) })
    ).toThrow('CTA button text exceeds 20 character limit')
  })

  it('deve aceitar buttonText com exatamente 20 caracteres', () => {
    expect(() =>
      buildCtaUrl({ ...baseOptions, buttonText: 'A'.repeat(20) })
    ).not.toThrow()
  })

  it('deve incluir header quando informado', () => {
    const result = buildCtaUrl({
      ...baseOptions,
      header: { type: 'text', text: 'Cabeçalho' },
    })
    expect(result.interactive.header).toEqual({ type: 'text', text: 'Cabeçalho' })
  })

  it('deve incluir footer quando informado', () => {
    const result = buildCtaUrl({ ...baseOptions, footer: 'Rodapé' })
    expect(result.interactive.footer).toEqual({ text: 'Rodapé' })
  })

  it('deve lançar erro quando footer excede 60 caracteres', () => {
    expect(() =>
      buildCtaUrl({ ...baseOptions, footer: 'A'.repeat(61) })
    ).toThrow('Footer text exceeds 60 character limit')
  })

  it('deve incluir context quando replyToMessageId é informado', () => {
    const result = buildCtaUrl({ ...baseOptions, replyToMessageId: 'wamid.abc' })
    expect(result.context).toEqual({ message_id: 'wamid.abc' })
  })

  it('não deve incluir header, footer ou context quando não informados', () => {
    const result = buildCtaUrl(baseOptions)
    expect(result.interactive.header).toBeUndefined()
    expect(result.interactive.footer).toBeUndefined()
    expect(result.context).toBeUndefined()
  })
})

// =============================================================================
// buildLocationRequest
// =============================================================================
describe('buildLocationRequest', () => {
  it('deve construir payload de location request', () => {
    const result = buildLocationRequest({
      to: '+5511999999999',
      body: 'Compartilhe sua localização',
    })
    expect(result).toEqual({
      messaging_product: 'whatsapp',
      to: '+5511999999999',
      type: 'interactive',
      interactive: {
        type: 'location_request_message',
        body: { text: 'Compartilhe sua localização' },
        action: { name: 'send_location' },
      },
    })
  })

  it('deve incluir context quando replyToMessageId é informado', () => {
    const result = buildLocationRequest({
      to: '+5511999999999',
      body: 'Sua localização',
      replyToMessageId: 'wamid.abc',
    })
    expect(result.context).toEqual({ message_id: 'wamid.abc' })
  })

  it('não deve incluir context quando replyToMessageId não é informado', () => {
    const result = buildLocationRequest({ to: '+5511999999999', body: 'test' })
    expect(result.context).toBeUndefined()
  })
})

// =============================================================================
// buildMenu
// =============================================================================
describe('buildMenu', () => {
  it('deve usar reply buttons para 1-3 opções', () => {
    const result = buildMenu({
      to: '+5511999999999',
      body: 'Menu',
      options: [
        { id: '1', label: 'Opção 1' },
        { id: '2', label: 'Opção 2' },
      ],
    })
    expect(result.interactive.type).toBe('button')
  })

  it('deve usar list message para 4-10 opções', () => {
    const result = buildMenu({
      to: '+5511999999999',
      body: 'Menu',
      options: Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, label: `Opção ${i}` })),
    })
    expect(result.interactive.type).toBe('list')
  })

  it('deve usar list com exatamente 4 opções (fronteira buttons/list)', () => {
    const result = buildMenu({
      to: '+5511999999999',
      body: 'Menu',
      options: Array.from({ length: 4 }, (_, i) => ({ id: `${i}`, label: `Op ${i}` })),
    })
    expect(result.interactive.type).toBe('list')
  })

  it('deve usar buttons com exatamente 3 opções (fronteira)', () => {
    const result = buildMenu({
      to: '+5511999999999',
      body: 'Menu',
      options: Array.from({ length: 3 }, (_, i) => ({ id: `${i}`, label: `Op ${i}` })),
    })
    expect(result.interactive.type).toBe('button')
  })

  it('deve aceitar exatamente 10 opções (máximo)', () => {
    expect(() =>
      buildMenu({
        to: '+5511999999999',
        body: 'Menu',
        options: Array.from({ length: 10 }, (_, i) => ({ id: `${i}`, label: `Op ${i}` })),
      })
    ).not.toThrow()
  })

  it('deve lançar erro com 0 opções', () => {
    expect(() =>
      buildMenu({ to: '+5511999999999', body: 'Menu', options: [] })
    ).toThrow('at least one option')
  })

  it('deve lançar erro com mais de 10 opções', () => {
    expect(() =>
      buildMenu({
        to: '+5511999999999',
        body: 'Menu',
        options: Array.from({ length: 11 }, (_, i) => ({ id: `${i}`, label: `Op ${i}` })),
      })
    ).toThrow('max 10 options')
  })

  it('deve truncar labels de botões para 20 caracteres', () => {
    const result = buildMenu({
      to: '+5511999999999',
      body: 'Menu',
      options: [{ id: '1', label: 'Este é um label bem longo demais para caber' }],
    })
    const action = result.interactive.action as { buttons: Array<{ reply: { title: string } }> }
    expect(action.buttons[0].reply.title).toHaveLength(20)
  })

  it('deve truncar labels de list rows para 24 caracteres', () => {
    const result = buildMenu({
      to: '+5511999999999',
      body: 'Menu',
      options: Array.from({ length: 4 }, (_, i) => ({
        id: `${i}`,
        label: 'Este label é definitivamente longo demais',
      })),
    })
    const action = result.interactive.action as { sections: Array<{ rows: Array<{ title: string }> }> }
    expect(action.sections[0].rows[0].title).toHaveLength(24)
  })

  it('deve truncar descriptions para 72 caracteres na list', () => {
    const result = buildMenu({
      to: '+5511999999999',
      body: 'Menu',
      options: Array.from({ length: 4 }, (_, i) => ({
        id: `${i}`,
        label: `Op ${i}`,
        description: 'D'.repeat(100),
      })),
    })
    const action = result.interactive.action as { sections: Array<{ rows: Array<{ description: string }> }> }
    expect(action.sections[0].rows[0].description).toHaveLength(72)
  })

  it('deve usar "Ver opções" como buttonText padrão para list', () => {
    const result = buildMenu({
      to: '+5511999999999',
      body: 'Menu',
      options: Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, label: `Op ${i}` })),
    })
    const action = result.interactive.action as { button: string }
    expect(action.button).toBe('Ver opções')
  })

  it('deve usar listButtonText personalizado quando informado', () => {
    const result = buildMenu({
      to: '+5511999999999',
      body: 'Menu',
      options: Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, label: `Op ${i}` })),
      listButtonText: 'Escolha',
    })
    const action = result.interactive.action as { button: string }
    expect(action.button).toBe('Escolha')
  })

  it('deve passar header de texto para list (ignora outros tipos)', () => {
    const result = buildMenu({
      to: '+5511999999999',
      body: 'Menu',
      options: Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, label: `Op ${i}` })),
      header: { type: 'text', text: 'Cabeçalho' },
    })
    expect(result.interactive.header).toEqual({ type: 'text', text: 'Cabeçalho' })
  })

  it('deve ignorar header de imagem para list', () => {
    const result = buildMenu({
      to: '+5511999999999',
      body: 'Menu',
      options: Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, label: `Op ${i}` })),
      header: { type: 'image', mediaId: 'img123' },
    })
    expect(result.interactive.header).toBeUndefined()
  })

  it('deve passar header de qualquer tipo para buttons', () => {
    const result = buildMenu({
      to: '+5511999999999',
      body: 'Menu',
      options: [{ id: '1', label: 'Op 1' }],
      header: { type: 'image', mediaId: 'img123' },
    })
    expect(result.interactive.header).toEqual({ type: 'image', image: { id: 'img123' } })
  })

  it('deve aceitar 1 opção (usa buttons)', () => {
    const result = buildMenu({
      to: '+5511999999999',
      body: 'Menu',
      options: [{ id: '1', label: 'Única opção' }],
    })
    expect(result.interactive.type).toBe('button')
  })

  it('deve passar footer e replyToMessageId', () => {
    const result = buildMenu({
      to: '+5511999999999',
      body: 'Menu',
      options: [{ id: '1', label: 'Op 1' }],
      footer: 'Rodapé',
      replyToMessageId: 'wamid.abc',
    })
    expect(result.interactive.footer).toEqual({ text: 'Rodapé' })
    expect(result.context).toEqual({ message_id: 'wamid.abc' })
  })
})
