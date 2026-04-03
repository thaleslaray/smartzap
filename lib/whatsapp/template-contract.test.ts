import { describe, expect, it } from 'vitest'
import { precheckContactForTemplate } from '@/lib/whatsapp/template-contract'
import { buildMetaTemplatePayload, renderTemplatePreviewText } from '@/lib/whatsapp/template-payload'

const baseTemplate = {
  id: 'tpl_1',
  name: 'test_template',
  category: 'MARKETING',
  language: 'pt_BR',
  status: 'APPROVED',
  content: '',
  preview: '',
  lastUpdated: new Date().toISOString(),
  parameterFormat: 'positional' as const,
  components: [
    { type: 'BODY', text: 'Olá {{1}}' },
  ],
}

describe('template-contract precheckContactForTemplate', () => {
  it('deve marcar como skipped quando token resolve para vazio (ex: {{email}} sem email)', () => {
    const res = precheckContactForTemplate(
      {
        contactId: 'c_1',
        name: 'João',
        phone: '+5511999999999',
        email: null,
        custom_fields: {},
      },
      baseTemplate as any,
      {
        header: [],
        body: ['{{email}}'],
      }
    )

    expect(res.ok).toBe(false)
    if (res.ok) return

    expect(res.skipCode).toBe('MISSING_REQUIRED_PARAM')
    // Observabilidade: deve indicar exatamente a posição + token cru.
    expect(res.reason).toContain('body:1')
    expect(res.reason).toContain('raw="{{email}}"')

    // Estruturado: útil para UI apontar exatamente o que falta
    expect(res.missing).toBeTruthy()
    expect(res.missing?.[0]).toMatchObject({ where: 'body', key: '1', raw: '{{email}}' })
  })

  it('deve passar quando token resolve com valor (ex: {{email}} presente)', () => {
    const res = precheckContactForTemplate(
      {
        contactId: 'c_1',
        name: 'João',
        phone: '+5511999999999',
        email: 'joao@exemplo.com',
        custom_fields: {},
      },
      baseTemplate as any,
      {
        header: [],
        body: ['{{email}}'],
      }
    )

    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.normalizedPhone).toBe('+5511999999999')
    expect(res.values.body).toEqual([{ key: '1', text: 'joao@exemplo.com' }])
  })
})

describe('buildMetaTemplatePayload com LOCATION header', () => {
  const locationTemplate = {
    id: 'tpl_loc',
    name: 'location_template',
    category: 'MARKETING',
    language: 'pt_BR',
    status: 'APPROVED',
    content: '',
    preview: '',
    lastUpdated: new Date().toISOString(),
    parameterFormat: 'positional' as const,
    components: [
      { type: 'HEADER', format: 'LOCATION' },
      { type: 'BODY', text: 'Visite nossa loja!' },
    ],
  }

  const locationTemplateWithData = {
    ...locationTemplate,
    components: [
      {
        type: 'HEADER',
        format: 'LOCATION',
        location: {
          latitude: '-23.5505',
          longitude: '-46.6333',
          name: 'Loja Centro',
          address: 'Rua Augusta, 500',
        },
      },
      { type: 'BODY', text: 'Visite nossa loja!' },
    ],
  }

  it('deve construir payload correto com dados de localização passados em values', () => {
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'location_template',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: {
        body: [],
        headerLocation: {
          latitude: '-23.5505',
          longitude: '-46.6333',
          name: 'Loja São Paulo',
          address: 'Av. Paulista, 1000',
        },
      },
      template: locationTemplate as any,
    })

    expect(payload.template.components).toContainEqual({
      type: 'header',
      parameters: [
        {
          type: 'location',
          location: {
            latitude: '-23.5505',
            longitude: '-46.6333',
            name: 'Loja São Paulo',
            address: 'Av. Paulista, 1000',
          },
        },
      ],
    })
  })

  it('deve extrair dados de localização do template quando não passados em values', () => {
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'location_template',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: {
        body: [],
      },
      template: locationTemplateWithData as any,
    })

    expect(payload.template.components).toContainEqual({
      type: 'header',
      parameters: [
        {
          type: 'location',
          location: {
            latitude: '-23.5505',
            longitude: '-46.6333',
            name: 'Loja Centro',
            address: 'Rua Augusta, 500',
          },
        },
      ],
    })
  })

  it('deve lançar erro quando template LOCATION não tem dados de localização em nenhum lugar', () => {
    expect(() =>
      buildMetaTemplatePayload({
        to: '+5511999999999',
        templateName: 'location_template',
        language: 'pt_BR',
        parameterFormat: 'positional',
        values: {
          body: [],
        },
        template: locationTemplate as any,
      })
    ).toThrow(/não há dados de localização/)
  })

  it('deve passar headerLocation através do precheck', () => {
    const res = precheckContactForTemplate(
      {
        contactId: 'c_1',
        name: 'João',
        phone: '+5511999999999',
      },
      locationTemplate as any,
      {
        body: [],
        headerLocation: {
          latitude: '-23.5505',
          longitude: '-46.6333',
          name: 'Loja SP',
          address: 'Av. Paulista',
        },
      }
    )

    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.values.headerLocation).toEqual({
      latitude: '-23.5505',
      longitude: '-46.6333',
      name: 'Loja SP',
      address: 'Av. Paulista',
    })
  })
})

describe('renderTemplatePreviewText', () => {
  it('deve renderizar template simples com body apenas', () => {
    const template = {
      id: 'tpl_1',
      name: 'test_template',
      category: 'MARKETING',
      language: 'pt_BR',
      status: 'APPROVED',
      content: '',
      preview: '',
      lastUpdated: new Date().toISOString(),
      components: [
        { type: 'BODY', text: 'Olá {{1}}, bem-vindo!' },
      ],
    }

    const result = renderTemplatePreviewText(template as any, {
      body: [{ key: '1', text: 'João' }],
    })

    expect(result).toContain('📋 *Template: test_template*')
    expect(result).toContain('Olá João, bem-vindo!')
  })

  it('deve renderizar template com header de texto', () => {
    const template = {
      id: 'tpl_2',
      name: 'header_text_template',
      category: 'MARKETING',
      language: 'pt_BR',
      status: 'APPROVED',
      content: '',
      preview: '',
      lastUpdated: new Date().toISOString(),
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Promoção {{1}}!' },
        { type: 'BODY', text: 'Aproveite nossa oferta especial.' },
      ],
    }

    const result = renderTemplatePreviewText(template as any, {
      header: [{ key: '1', text: 'Black Friday' }],
      body: [],
    })

    expect(result).toContain('📋 *Template: header_text_template*')
    expect(result).toContain('*Promoção Black Friday!*')
    expect(result).toContain('Aproveite nossa oferta especial.')
  })

  it('deve renderizar template com header de imagem', () => {
    const template = {
      id: 'tpl_3',
      name: 'image_template',
      category: 'MARKETING',
      language: 'pt_BR',
      status: 'APPROVED',
      content: '',
      preview: '',
      lastUpdated: new Date().toISOString(),
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Confira nossa oferta!' },
      ],
    }

    const result = renderTemplatePreviewText(template as any, {
      body: [],
    })

    expect(result).toContain('[🖼️ Imagem]')
  })

  it('deve renderizar template com header de vídeo', () => {
    const template = {
      id: 'tpl_4',
      name: 'video_template',
      category: 'MARKETING',
      language: 'pt_BR',
      status: 'APPROVED',
      content: '',
      preview: '',
      lastUpdated: new Date().toISOString(),
      components: [
        { type: 'HEADER', format: 'VIDEO' },
        { type: 'BODY', text: 'Assista nosso vídeo!' },
      ],
    }

    const result = renderTemplatePreviewText(template as any, {
      body: [],
    })

    expect(result).toContain('[🎬 Vídeo]')
  })

  it('deve renderizar template com header de documento', () => {
    const template = {
      id: 'tpl_5',
      name: 'doc_template',
      category: 'MARKETING',
      language: 'pt_BR',
      status: 'APPROVED',
      content: '',
      preview: '',
      lastUpdated: new Date().toISOString(),
      components: [
        { type: 'HEADER', format: 'DOCUMENT' },
        { type: 'BODY', text: 'Veja o documento.' },
      ],
    }

    const result = renderTemplatePreviewText(template as any, {
      body: [],
    })

    expect(result).toContain('[📄 Documento]')
  })

  it('deve renderizar template com header de localização', () => {
    const template = {
      id: 'tpl_6',
      name: 'location_template',
      category: 'MARKETING',
      language: 'pt_BR',
      status: 'APPROVED',
      content: '',
      preview: '',
      lastUpdated: new Date().toISOString(),
      components: [
        { type: 'HEADER', format: 'LOCATION' },
        { type: 'BODY', text: 'Visite nossa loja!' },
      ],
    }

    const result = renderTemplatePreviewText(template as any, {
      body: [],
      headerLocation: {
        latitude: '-23.5505',
        longitude: '-46.6333',
        name: 'Loja Centro',
        address: 'Rua Augusta, 500',
      },
    })

    expect(result).toContain('[📍 Loja Centro]')
  })

  it('deve renderizar template com footer', () => {
    const template = {
      id: 'tpl_7',
      name: 'footer_template',
      category: 'MARKETING',
      language: 'pt_BR',
      status: 'APPROVED',
      content: '',
      preview: '',
      lastUpdated: new Date().toISOString(),
      components: [
        { type: 'BODY', text: 'Corpo da mensagem' },
        { type: 'FOOTER', text: 'Responda SAIR para cancelar' },
      ],
    }

    const result = renderTemplatePreviewText(template as any, {
      body: [],
    })

    expect(result).toContain('_Responda SAIR para cancelar_')
  })

  it('deve renderizar template com botões', () => {
    const template = {
      id: 'tpl_8',
      name: 'buttons_template',
      category: 'MARKETING',
      language: 'pt_BR',
      status: 'APPROVED',
      content: '',
      preview: '',
      lastUpdated: new Date().toISOString(),
      components: [
        { type: 'BODY', text: 'Escolha uma opção:' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'URL', text: 'Ver Ofertas' },
            { type: 'QUICK_REPLY', text: 'Falar com Atendente' },
            { type: 'PHONE_NUMBER', text: 'Ligar' },
          ],
        },
      ],
    }

    const result = renderTemplatePreviewText(template as any, {
      body: [],
    })

    expect(result).toContain('---')
    expect(result).toContain('[🔗 Ver Ofertas]')
    expect(result).toContain('[💬 Falar com Atendente]')
    expect(result).toContain('[📞 Ligar]')
  })

  it('deve renderizar template completo com todos os componentes', () => {
    const template = {
      id: 'tpl_9',
      name: 'full_template',
      category: 'MARKETING',
      language: 'pt_BR',
      status: 'APPROVED',
      content: '',
      preview: '',
      lastUpdated: new Date().toISOString(),
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Olá {{1}}!' },
        { type: 'BODY', text: 'Você ganhou {{1}}% de desconto!' },
        { type: 'FOOTER', text: 'SmartZap' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'URL', text: 'Comprar' },
          ],
        },
      ],
    }

    const result = renderTemplatePreviewText(template as any, {
      header: [{ key: '1', text: 'Maria' }],
      body: [{ key: '1', text: '50' }],
    })

    expect(result).toContain('📋 *Template: full_template*')
    expect(result).toContain('*Olá Maria!*')
    expect(result).toContain('Você ganhou 50% de desconto!')
    expect(result).toContain('_SmartZap_')
    expect(result).toContain('[🔗 Comprar]')
  })

  it('deve lidar com template sem components', () => {
    const template = {
      id: 'tpl_10',
      name: 'empty_template',
      category: 'MARKETING',
      language: 'pt_BR',
      status: 'APPROVED',
      content: '',
      preview: '',
      lastUpdated: new Date().toISOString(),
      components: [],
    }

    const result = renderTemplatePreviewText(template as any, {
      body: [],
    })

    expect(result).toContain('📋 *Template: empty_template*')
  })
})
