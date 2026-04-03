import { describe, it, expect, vi } from 'vitest'

// Mock phone-formatter antes dos imports
vi.mock('@/lib/phone-formatter', () => ({
  normalizePhoneNumber: (phone: string) => phone.startsWith('+') ? phone : `+${phone}`,
  validatePhoneNumber: (phone: string) => {
    if (!phone || phone.length < 10) return { isValid: false, error: 'Telefone inválido' }
    return { isValid: true }
  },
}))

import {
  buildTemplateSpecV1,
  resolveVarValue,
  renderTemplatePreviewText,
  precheckContactForTemplate,
  buildMetaTemplatePayload,
} from '@/lib/whatsapp/template-contract'
import type { Template, TemplateComponent } from '@/types'

// =====================
// Helpers / Factories
// =====================

function makeTemplate(overrides: Partial<Template> & { components: TemplateComponent[] }): Template {
  return {
    id: 'tpl_test',
    name: 'test_template',
    category: 'MARKETING',
    language: 'pt_BR',
    status: 'APPROVED',
    content: '',
    preview: '',
    lastUpdated: new Date().toISOString(),
    parameterFormat: 'positional',
    ...overrides,
  } as Template
}

function makeContact(overrides: Record<string, unknown> = {}) {
  return {
    contactId: 'c_1',
    name: 'João',
    phone: '+5511999999999',
    email: 'joao@test.com',
    custom_fields: {},
    ...overrides,
  }
}

// =====================
// buildTemplateSpecV1
// =====================

describe('buildTemplateSpecV1', () => {
  it('deve extrair spec básica de template com body simples', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Olá {{1}}, tudo bem?' },
      ],
    })
    const spec = buildTemplateSpecV1(template)
    expect(spec.templateName).toBe('test_template')
    expect(spec.language).toBe('pt_BR')
    expect(spec.parameterFormat).toBe('positional')
    expect(spec.body.requiredKeys).toEqual(['1'])
    expect(spec.header).toBeUndefined()
    expect(spec.footer).toBeUndefined()
    expect(spec.buttons).toEqual([])
  })

  it('deve extrair múltiplas variáveis posicionais do body', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Olá {{1}}, seu código é {{2}}.' },
      ],
    })
    const spec = buildTemplateSpecV1(template)
    expect(spec.body.requiredKeys).toEqual(['1', '2'])
  })

  it('deve extrair header de texto com variável', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Promoção {{1}}!' },
        { type: 'BODY', text: 'Aproveite.' },
      ],
    })
    const spec = buildTemplateSpecV1(template)
    expect(spec.header).toEqual({ kind: 'text', requiredKeys: ['1'] })
  })

  it('deve extrair header de texto sem variável', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Promoção!' },
        { type: 'BODY', text: 'Aproveite.' },
      ],
    })
    const spec = buildTemplateSpecV1(template)
    expect(spec.header).toEqual({ kind: 'text', requiredKeys: [] })
  })

  it('deve ignorar header não-TEXT (IMAGE, etc)', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Veja a imagem.' },
      ],
    })
    const spec = buildTemplateSpecV1(template)
    expect(spec.header).toBeUndefined()
  })

  it('deve extrair footer', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        { type: 'FOOTER', text: 'Responda SAIR para cancelar' },
      ],
    })
    const spec = buildTemplateSpecV1(template)
    expect(spec.footer).toEqual({ text: 'Responda SAIR para cancelar' })
  })

  it('deve não incluir footer quando text está vazio', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        { type: 'FOOTER', text: '' },
      ],
    })
    const spec = buildTemplateSpecV1(template)
    expect(spec.footer).toBeUndefined()
  })

  it('deve lançar erro quando BODY está ausente', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Header' },
      ],
    })
    expect(() => buildTemplateSpecV1(template)).toThrow('BODY ausente')
  })

  it('deve lançar erro quando header tem mais de 1 parâmetro', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Olá {{1}} e {{2}}' },
        { type: 'BODY', text: 'Corpo.' },
      ],
    })
    expect(() => buildTemplateSpecV1(template)).toThrow('no máximo 1 parâmetro')
  })

  it('deve lançar erro para placeholders posicionais com buraco', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Olá {{1}}, código {{3}}.' },
      ],
    })
    expect(() => buildTemplateSpecV1(template)).toThrow('buraco')
  })

  it('deve extrair botão URL estático', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'URL', text: 'Ver', url: 'https://site.com/page' },
          ],
        },
      ],
    })
    const spec = buildTemplateSpecV1(template)
    expect(spec.buttons).toEqual([
      { kind: 'url', index: 0, isDynamic: false, requiredKeys: [] },
    ])
  })

  it('deve extrair botão URL dinâmico', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'URL', text: 'Ver', url: 'https://site.com/{{1}}' },
          ],
        },
      ],
    })
    const spec = buildTemplateSpecV1(template)
    expect(spec.buttons).toEqual([
      { kind: 'url', index: 0, isDynamic: true, requiredKeys: ['1'] },
    ])
  })

  it('deve extrair botão não-URL como "other"', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'QUICK_REPLY', text: 'Sim' },
            { type: 'PHONE_NUMBER', text: 'Ligar', phone_number: '+5511999' },
          ],
        },
      ],
    })
    const spec = buildTemplateSpecV1(template)
    expect(spec.buttons).toEqual([
      { kind: 'other', index: 0 },
      { kind: 'other', index: 1 },
    ])
  })

  it('deve manter índices globais dos botões com múltiplos BUTTONS components', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'QUICK_REPLY', text: 'Sim' },
          ],
        },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'URL', text: 'Link', url: 'https://a.com' },
          ],
        },
      ],
    })
    const spec = buildTemplateSpecV1(template)
    expect(spec.buttons[0]).toEqual({ kind: 'other', index: 0 })
    expect(spec.buttons[1]).toEqual({ kind: 'url', index: 1, isDynamic: false, requiredKeys: [] })
  })

  it('deve lançar erro para named format com URL dinâmica', () => {
    const template = makeTemplate({
      parameterFormat: 'named',
      components: [
        { type: 'BODY', text: 'Olá {{nome}}.' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'URL', text: 'Ver', url: 'https://site.com/{{1}}' },
          ],
        },
      ],
    })
    expect(() => buildTemplateSpecV1(template)).toThrow('named')
  })

  it('deve extrair tokens nomeados no body', () => {
    const template = makeTemplate({
      parameterFormat: 'named',
      components: [
        { type: 'BODY', text: 'Olá {{nome}}, seu email é {{email}}.' },
      ],
    })
    const spec = buildTemplateSpecV1(template)
    expect(spec.parameterFormat).toBe('named')
    expect(spec.body.requiredKeys).toEqual(['nome', 'email'])
  })

  it('deve extrair token nomeado no header', () => {
    const template = makeTemplate({
      parameterFormat: 'named',
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Promoção {{promo}}!' },
        { type: 'BODY', text: 'Corpo.' },
      ],
    })
    const spec = buildTemplateSpecV1(template)
    expect(spec.header).toEqual({ kind: 'text', requiredKeys: ['promo'] })
  })

  it('deve lançar erro para placeholders nomeados inválidos', () => {
    // Nota: A regex de extração /\{\{([a-z0-9_]+)\}\}/g só captura lowercase.
    // {{Nome}} (com maiúscula) não é capturado, logo não gera erro.
    // Para acionar a validação interna, usamos {{_nome}} (underline no início).
    const template = makeTemplate({
      parameterFormat: 'named',
      components: [
        { type: 'BODY', text: 'Olá {{_nome}}, tudo bem?' },
      ],
    })
    expect(() => buildTemplateSpecV1(template)).toThrow('inválido')
  })

  it('deve lançar erro quando components é array vazio (sem BODY)', () => {
    // Nota: com components=undefined + content=string, o fallback é a string (não um array),
    // o que causa TypeError em .find(). Testamos com array vazio que é o caso real.
    const template = makeTemplate({
      components: [] as any,
    })
    expect(() => buildTemplateSpecV1(template)).toThrow('BODY ausente')
  })

  it('deve extrair body sem variáveis (requiredKeys vazio)', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Mensagem sem variáveis.' },
      ],
    })
    const spec = buildTemplateSpecV1(template)
    expect(spec.body.requiredKeys).toEqual([])
  })

  it('deve lançar erro para botão URL dinâmico com mais de 1 variável', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'URL', text: 'Ver', url: 'https://site.com/{{1}}/{{2}}' },
          ],
        },
      ],
    })
    expect(() => buildTemplateSpecV1(template)).toThrow('no máximo 1 variável')
  })
})

// =====================
// resolveVarValue
// =====================

describe('resolveVarValue', () => {
  const contact = makeContact()

  it('deve resolver {{nome}} para contact.name', () => {
    expect(resolveVarValue('{{nome}}', contact)).toBe('João')
  })

  it('deve resolver {{name}} para contact.name', () => {
    expect(resolveVarValue('{{name}}', contact)).toBe('João')
  })

  it('deve resolver {{contact.name}} para contact.name', () => {
    expect(resolveVarValue('{{contact.name}}', contact)).toBe('João')
  })

  it('deve resolver {{telefone}} para contact.phone', () => {
    expect(resolveVarValue('{{telefone}}', contact)).toBe('+5511999999999')
  })

  it('deve resolver {{phone}} para contact.phone', () => {
    expect(resolveVarValue('{{phone}}', contact)).toBe('+5511999999999')
  })

  it('deve resolver {{contact.phone}} para contact.phone', () => {
    expect(resolveVarValue('{{contact.phone}}', contact)).toBe('+5511999999999')
  })

  it('deve resolver {{email}} para contact.email', () => {
    expect(resolveVarValue('{{email}}', contact)).toBe('joao@test.com')
  })

  it('deve resolver {{contact.email}} para contact.email', () => {
    expect(resolveVarValue('{{contact.email}}', contact)).toBe('joao@test.com')
  })

  it('deve resolver {{email}} buscando em custom_fields quando email é null', () => {
    const c = makeContact({ email: null, custom_fields: { email: 'cf@test.com' } })
    expect(resolveVarValue('{{email}}', c)).toBe('cf@test.com')
  })

  it('deve retornar "Cliente" quando nome está ausente', () => {
    const c = makeContact({ name: undefined })
    expect(resolveVarValue('{{nome}}', c)).toBe('Cliente')
  })

  it('deve retornar string vazia quando telefone está ausente', () => {
    const c = makeContact({ phone: '' })
    expect(resolveVarValue('{{telefone}}', c)).toBe('')
  })

  it('deve retornar string vazia quando email está ausente e não tem custom_fields', () => {
    const c = makeContact({ email: null, custom_fields: {} })
    expect(resolveVarValue('{{email}}', c)).toBe('')
  })

  it('deve resolver custom field existente', () => {
    const c = makeContact({ custom_fields: { cidade: 'São Paulo' } })
    expect(resolveVarValue('{{cidade}}', c)).toBe('São Paulo')
  })

  it('deve retornar vazio para custom field inexistente', () => {
    const c = makeContact({ custom_fields: {} })
    expect(resolveVarValue('{{cidade}}', c)).toBe('')
  })

  it('deve retornar vazio para custom field null', () => {
    const c = makeContact({ custom_fields: { cidade: null } })
    expect(resolveVarValue('{{cidade}}', c)).toBe('')
  })

  it('deve converter custom field numérico para string', () => {
    const c = makeContact({ custom_fields: { idade: 30 } })
    expect(resolveVarValue('{{idade}}', c)).toBe('30')
  })

  it('deve retornar valor literal quando não é token', () => {
    expect(resolveVarValue('Texto normal', contact)).toBe('Texto normal')
  })

  it('deve retornar vazio quando input é undefined', () => {
    expect(resolveVarValue(undefined, contact)).toBe('')
  })

  it('deve retornar vazio quando input é string vazia', () => {
    expect(resolveVarValue('', contact)).toBe('')
  })

  it('deve tratar espaços ao redor do token', () => {
    expect(resolveVarValue('  {{nome}}  ', contact)).toBe('João')
  })
})

// =====================
// renderTemplatePreviewText
// =====================

describe('renderTemplatePreviewText', () => {
  it('deve renderizar template com body simples e variáveis substituídas', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Olá {{1}}, bem-vindo!' },
      ],
    })
    const result = renderTemplatePreviewText(template, {
      body: [{ key: '1', text: 'João' }],
    })
    expect(result).toContain('📋 *Template: test_template*')
    expect(result).toContain('Olá João, bem-vindo!')
  })

  it('deve renderizar header TEXT com variáveis', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Promoção {{1}}!' },
        { type: 'BODY', text: 'Aproveite.' },
      ],
    })
    const result = renderTemplatePreviewText(template, {
      header: [{ key: '1', text: 'Black Friday' }],
      body: [],
    })
    expect(result).toContain('*Promoção Black Friday!*')
  })

  it('deve renderizar header IMAGE como placeholder', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Corpo.' },
      ],
    })
    const result = renderTemplatePreviewText(template, { body: [] })
    expect(result).toContain('[🖼️ Imagem]')
  })

  it('deve renderizar header VIDEO como placeholder', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'VIDEO' },
        { type: 'BODY', text: 'Corpo.' },
      ],
    })
    const result = renderTemplatePreviewText(template, { body: [] })
    expect(result).toContain('[🎬 Vídeo]')
  })

  it('deve renderizar header DOCUMENT como placeholder', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'DOCUMENT' },
        { type: 'BODY', text: 'Corpo.' },
      ],
    })
    const result = renderTemplatePreviewText(template, { body: [] })
    expect(result).toContain('[📄 Documento]')
  })

  it('deve renderizar header LOCATION com nome', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'LOCATION' },
        { type: 'BODY', text: 'Visite.' },
      ],
    })
    const result = renderTemplatePreviewText(template, {
      body: [],
      headerLocation: {
        latitude: '-23.5505',
        longitude: '-46.6333',
        name: 'Loja Centro',
        address: 'Rua Augusta',
      },
    })
    expect(result).toContain('[📍 Loja Centro]')
  })

  it('deve renderizar header LOCATION com address quando name está vazio', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'LOCATION' },
        { type: 'BODY', text: 'Visite.' },
      ],
    })
    const result = renderTemplatePreviewText(template, {
      body: [],
      headerLocation: {
        latitude: '-23.5505',
        longitude: '-46.6333',
        name: '',
        address: 'Rua Augusta',
      },
    })
    expect(result).toContain('[📍 Rua Augusta]')
  })

  it('deve renderizar header LOCATION genérico sem nome e sem address', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'LOCATION' },
        { type: 'BODY', text: 'Visite.' },
      ],
    })
    const result = renderTemplatePreviewText(template, {
      body: [],
    })
    expect(result).toContain('[📍 Localização]')
  })

  it('deve renderizar footer em itálico', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        { type: 'FOOTER', text: 'SmartZap' },
      ],
    })
    const result = renderTemplatePreviewText(template, { body: [] })
    expect(result).toContain('_SmartZap_')
  })

  it('deve renderizar botão URL', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Comprar' }] },
      ],
    })
    const result = renderTemplatePreviewText(template, { body: [] })
    expect(result).toContain('---')
    expect(result).toContain('[🔗 Comprar]')
  })

  it('deve renderizar botão QUICK_REPLY', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Sim' }] },
      ],
    })
    const result = renderTemplatePreviewText(template, { body: [] })
    expect(result).toContain('[💬 Sim]')
  })

  it('deve renderizar botão PHONE_NUMBER', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        { type: 'BUTTONS', buttons: [{ type: 'PHONE_NUMBER', text: 'Ligar' }] },
      ],
    })
    const result = renderTemplatePreviewText(template, { body: [] })
    expect(result).toContain('[📞 Ligar]')
  })

  it('deve renderizar botão COPY_CODE', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        { type: 'BUTTONS', buttons: [{ type: 'COPY_CODE', text: 'Copiar' }] },
      ],
    })
    const result = renderTemplatePreviewText(template, { body: [] })
    expect(result).toContain('[📋 Copiar]')
  })

  it('deve renderizar botão FLOW', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        { type: 'BUTTONS', buttons: [{ type: 'FLOW', text: 'Iniciar' }] },
      ],
    })
    const result = renderTemplatePreviewText(template, { body: [] })
    expect(result).toContain('[📝 Iniciar]')
  })

  it('deve renderizar múltiplos botões de componentes BUTTONS diferentes', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'A' }] },
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'B' }] },
      ],
    })
    const result = renderTemplatePreviewText(template, { body: [] })
    expect(result).toContain('[💬 A]')
    expect(result).toContain('[🔗 B]')
  })

  it('deve renderizar template completo (header + body + footer + botões)', () => {
    const template = makeTemplate({
      name: 'full_template',
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Olá {{1}}!' },
        { type: 'BODY', text: 'Você ganhou {{1}}% de desconto!' },
        { type: 'FOOTER', text: 'SmartZap' },
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Comprar' }] },
      ],
    })
    const result = renderTemplatePreviewText(template, {
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
    const template = makeTemplate({ components: [] })
    // buildTemplateSpecV1 throws, but renderTemplatePreviewText accesses components directly
    const result = renderTemplatePreviewText(template, { body: [] })
    expect(result).toContain('📋 *Template: test_template*')
  })

  it('deve renderizar body com múltiplas variáveis substituídas', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Olá {{1}}, seu pedido {{2}} está pronto.' },
      ],
    })
    const result = renderTemplatePreviewText(template, {
      body: [
        { key: '1', text: 'Ana' },
        { key: '2', text: '#1234' },
      ],
    })
    expect(result).toContain('Olá Ana, seu pedido #1234 está pronto.')
  })
})

// =====================
// precheckContactForTemplate
// =====================

describe('precheckContactForTemplate', () => {
  const baseTemplate = makeTemplate({
    components: [
      { type: 'BODY', text: 'Olá {{1}}' },
    ],
  })

  it('deve falhar quando contactId está ausente', () => {
    const contact = makeContact({ contactId: null })
    const result = precheckContactForTemplate(contact, baseTemplate, { body: ['João'] } as any)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.skipCode).toBe('MISSING_CONTACT_ID')
    }
  })

  it('deve falhar quando contactId é string vazia', () => {
    const contact = makeContact({ contactId: '' })
    const result = precheckContactForTemplate(contact, baseTemplate, { body: ['João'] } as any)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.skipCode).toBe('MISSING_CONTACT_ID')
    }
  })

  it('deve falhar quando telefone é inválido', () => {
    const contact = makeContact({ phone: '123' })
    const result = precheckContactForTemplate(contact, baseTemplate, { body: ['João'] } as any)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.skipCode).toBe('INVALID_PHONE')
    }
  })

  it('deve passar com contato e variáveis válidos', () => {
    const contact = makeContact()
    const result = precheckContactForTemplate(contact, baseTemplate, { body: ['João'] } as any)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.normalizedPhone).toBe('+5511999999999')
      expect(result.values.body).toEqual([{ key: '1', text: 'João' }])
    }
  })

  it('deve falhar quando variável obrigatória resolve para vazio', () => {
    const contact = makeContact({ email: null })
    const result = precheckContactForTemplate(
      contact,
      baseTemplate,
      { body: ['{{email}}'] } as any,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.skipCode).toBe('MISSING_REQUIRED_PARAM')
      expect(result.reason).toContain('body:1')
      expect(result.reason).toContain('raw="{{email}}"')
      expect(result.missing).toBeDefined()
      expect(result.missing![0]).toMatchObject({ where: 'body', key: '1', raw: '{{email}}' })
    }
  })

  it('deve passar quando token {{email}} resolve com valor', () => {
    const contact = makeContact({ email: 'joao@test.com' })
    const result = precheckContactForTemplate(
      contact,
      baseTemplate,
      { body: ['{{email}}'] } as any,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.values.body).toEqual([{ key: '1', text: 'joao@test.com' }])
    }
  })

  it('deve passar header location em values', () => {
    const locTemplate = makeTemplate({
      components: [
        { type: 'HEADER', format: 'LOCATION' },
        { type: 'BODY', text: 'Visite nossa loja!' },
      ],
    })
    const contact = makeContact()
    const result = precheckContactForTemplate(
      contact,
      locTemplate,
      {
        body: [],
        headerLocation: {
          latitude: '-23.5505',
          longitude: '-46.6333',
          name: 'Loja SP',
          address: 'Av. Paulista',
        },
      } as any,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.values.headerLocation).toEqual({
        latitude: '-23.5505',
        longitude: '-46.6333',
        name: 'Loja SP',
        address: 'Av. Paulista',
      })
    }
  })

  it('deve resolver múltiplas variáveis no body', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Olá {{1}}, pedido {{2}}' },
      ],
    })
    const contact = makeContact()
    const result = precheckContactForTemplate(
      contact,
      template,
      { body: ['Ana', '#1234'] } as any,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.values.body).toEqual([
        { key: '1', text: 'Ana' },
        { key: '2', text: '#1234' },
      ])
    }
  })

  it('deve resolver variável no header posicional', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Promoção {{1}}!' },
        { type: 'BODY', text: 'Aproveite.' },
      ],
    })
    const contact = makeContact()
    const result = precheckContactForTemplate(
      contact,
      template,
      { header: ['Black Friday'], body: [] } as any,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.values.header).toEqual([{ key: '1', text: 'Black Friday' }])
    }
  })

  it('deve resolver variável no header nomeado', () => {
    const template = makeTemplate({
      parameterFormat: 'named',
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Promoção {{promo}}!' },
        { type: 'BODY', text: 'Aproveite.' },
      ],
    })
    const contact = makeContact()
    const result = precheckContactForTemplate(
      contact,
      template,
      { header: { promo: 'Natal' }, body: {} } as any,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.values.header).toEqual([{ key: 'promo', text: 'Natal' }])
    }
  })

  it('deve falhar quando header nomeado tem variável sem valor', () => {
    const template = makeTemplate({
      parameterFormat: 'named',
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Promoção {{promo}}!' },
        { type: 'BODY', text: 'Aproveite.' },
      ],
    })
    const contact = makeContact()
    const result = precheckContactForTemplate(
      contact,
      template,
      { header: {}, body: {} } as any,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.skipCode).toBe('MISSING_REQUIRED_PARAM')
      expect(result.reason).toContain('header:promo')
    }
  })

  it('deve resolver variáveis nomeadas no body', () => {
    const template = makeTemplate({
      parameterFormat: 'named',
      components: [
        { type: 'BODY', text: 'Olá {{nome}}, pedido {{pedido}}.' },
      ],
    })
    const contact = makeContact()
    const result = precheckContactForTemplate(
      contact,
      template,
      { body: { nome: '{{nome}}', pedido: '#999' } } as any,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.values.body).toEqual([
        { key: 'nome', text: 'João' },
        { key: 'pedido', text: '#999' },
      ])
    }
  })

  it('deve resolver botões dinâmicos posicionais', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'URL', text: 'Ver', url: 'https://site.com/{{1}}' },
          ],
        },
      ],
    })
    const contact = makeContact()
    const result = precheckContactForTemplate(
      contact,
      template,
      {
        body: [],
        buttons: { 'button_0_0': 'abc123' },
      } as any,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.values.buttons).toBeDefined()
      expect(result.values.buttons![0].index).toBe(0)
      expect(result.values.buttons![0].params).toEqual([{ key: '1', text: 'abc123' }])
    }
  })

  it('deve passar headerMediaId quando fornecido', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Corpo.' },
      ],
    })
    const contact = makeContact()
    const result = precheckContactForTemplate(
      contact,
      template,
      { body: [], headerMediaId: 'media_123' } as any,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.values.headerMediaId).toBe('media_123')
    }
  })

  it('deve lidar com body positional passado como map (objeto)', () => {
    const contact = makeContact()
    const result = precheckContactForTemplate(
      contact,
      baseTemplate,
      { body: { '1': 'Maria' } } as any,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.values.body).toEqual([{ key: '1', text: 'Maria' }])
    }
  })

  it('deve lidar com template sem variáveis no body', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Mensagem fixa sem variáveis.' },
      ],
    })
    const contact = makeContact()
    const result = precheckContactForTemplate(contact, template, { body: [] } as any)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.values.body).toEqual([])
    }
  })
})

// =====================
// buildMetaTemplatePayload
// =====================

describe('buildMetaTemplatePayload', () => {
  it('deve construir payload básico com body posicional', () => {
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'meu_template',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: {
        body: [
          { key: '1', text: 'João' },
          { key: '2', text: '#1234' },
        ],
      },
    })
    expect(payload.messaging_product).toBe('whatsapp')
    expect(payload.to).toBe('+5511999999999')
    expect(payload.type).toBe('template')
    expect(payload.template.name).toBe('meu_template')
    expect(payload.template.language).toEqual({ code: 'pt_BR' })
    expect(payload.template.components).toContainEqual({
      type: 'body',
      parameters: [
        { type: 'text', text: 'João' },
        { type: 'text', text: '#1234' },
      ],
    })
  })

  it('deve construir payload com body nomeado', () => {
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'meu_template',
      language: 'pt_BR',
      parameterFormat: 'named',
      values: {
        body: [
          { key: 'nome', text: 'Ana' },
        ],
      },
    })
    expect(payload.template.components).toContainEqual({
      type: 'body',
      parameters: [
        { type: 'text', parameter_name: 'nome', text: 'Ana' },
      ],
    })
  })

  it('deve construir payload com header de texto posicional', () => {
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: {
        header: [{ key: '1', text: 'Promo' }],
        body: [],
      },
    })
    expect(payload.template.components).toContainEqual({
      type: 'header',
      parameters: [{ type: 'text', text: 'Promo' }],
    })
  })

  it('deve construir payload com header de texto nomeado', () => {
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'named',
      values: {
        header: [{ key: 'promo', text: 'Natal' }],
        body: [],
      },
    })
    expect(payload.template.components).toContainEqual({
      type: 'header',
      parameters: [{ type: 'text', parameter_name: 'promo', text: 'Natal' }],
    })
  })

  it('deve construir payload com header IMAGE via headerMediaId', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Corpo.' },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: {
        body: [],
        headerMediaId: 'media_abc',
      },
      template,
    })
    expect(payload.template.components).toContainEqual({
      type: 'header',
      parameters: [{ type: 'image', image: { id: 'media_abc' } }],
    })
  })

  it('deve construir payload com header IMAGE via example link do template', () => {
    const template = makeTemplate({
      components: [
        {
          type: 'HEADER',
          format: 'IMAGE',
          example: { header_handle: ['https://cdn.example.com/img.png'] },
        },
        { type: 'BODY', text: 'Corpo.' },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: { body: [] },
      template,
    })
    expect(payload.template.components).toContainEqual({
      type: 'header',
      parameters: [{ type: 'image', image: { link: 'https://cdn.example.com/img.png' } }],
    })
  })

  it('deve lançar erro quando header IMAGE não tem mídia configurada', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Corpo.' },
      ],
    })
    expect(() => buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: { body: [] },
      template,
    })).toThrow(/não há mídia configurada/)
  })

  it('deve construir payload com header VIDEO', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'VIDEO' },
        { type: 'BODY', text: 'Corpo.' },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: { body: [], headerMediaId: 'vid_123' },
      template,
    })
    expect(payload.template.components).toContainEqual({
      type: 'header',
      parameters: [{ type: 'video', video: { id: 'vid_123' } }],
    })
  })

  it('deve construir payload com header DOCUMENT', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'DOCUMENT' },
        { type: 'BODY', text: 'Corpo.' },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: { body: [], headerMediaId: 'doc_123' },
      template,
    })
    expect(payload.template.components).toContainEqual({
      type: 'header',
      parameters: [{ type: 'document', document: { id: 'doc_123' } }],
    })
  })

  it('deve construir payload com header LOCATION passado em values', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'LOCATION' },
        { type: 'BODY', text: 'Visite!' },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: {
        body: [],
        headerLocation: {
          latitude: '-23.5505',
          longitude: '-46.6333',
          name: 'Loja SP',
          address: 'Av. Paulista, 1000',
        },
      },
      template,
    })
    expect(payload.template.components).toContainEqual({
      type: 'header',
      parameters: [{
        type: 'location',
        location: {
          latitude: '-23.5505',
          longitude: '-46.6333',
          name: 'Loja SP',
          address: 'Av. Paulista, 1000',
        },
      }],
    })
  })

  it('deve extrair location do template quando não passado em values', () => {
    const template = makeTemplate({
      components: [
        {
          type: 'HEADER',
          format: 'LOCATION',
          location: {
            latitude: '-23.5',
            longitude: '-46.6',
            name: 'Loja Centro',
            address: 'Rua Augusta',
          },
        } as any,
        { type: 'BODY', text: 'Visite!' },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: { body: [] },
      template,
    })
    const headerComp = payload.template.components.find((c: any) => c.type === 'header')
    expect(headerComp.parameters[0].location.latitude).toBe('-23.5')
  })

  it('deve lançar erro quando header LOCATION não tem dados', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'LOCATION' },
        { type: 'BODY', text: 'Visite!' },
      ],
    })
    expect(() => buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: { body: [] },
      template,
    })).toThrow(/não há dados de localização/)
  })

  it('deve usar name como fallback para address quando address é vazio', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'LOCATION' },
        { type: 'BODY', text: 'Visite!' },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: {
        body: [],
        headerLocation: {
          latitude: '-23.5',
          longitude: '-46.6',
          name: 'Loja Centro',
          address: '',
        },
      },
      template,
    })
    const headerComp = payload.template.components.find((c: any) => c.type === 'header')
    expect(headerComp.parameters[0].location.address).toBe('Loja Centro')
  })

  it('deve usar "Localização" como fallback quando name e address são vazios', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'LOCATION' },
        { type: 'BODY', text: 'Visite!' },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: {
        body: [],
        headerLocation: {
          latitude: '-23.5',
          longitude: '-46.6',
          name: '',
          address: '',
        },
      },
      template,
    })
    const headerComp = payload.template.components.find((c: any) => c.type === 'header')
    expect(headerComp.parameters[0].location.address).toBe('Localização')
  })

  it('deve pular botão URL estático (sem componente no payload)', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'URL', text: 'Ver', url: 'https://site.com/page' },
          ],
        },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: { body: [] },
      template,
    })
    const buttonComponents = payload.template.components.filter((c: any) => c.type === 'button')
    expect(buttonComponents).toHaveLength(0)
  })

  it('deve incluir botão URL dinâmico com parâmetros', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'URL', text: 'Ver', url: 'https://site.com/{{1}}' },
          ],
        },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: {
        body: [],
        buttons: [{ index: 0, params: [{ key: '1', text: 'abc123' }] }],
      },
      template,
    })
    const buttonComponent = payload.template.components.find((c: any) => c.type === 'button')
    expect(buttonComponent).toBeDefined()
    expect(buttonComponent.sub_type).toBe('url')
    expect(buttonComponent.parameters).toEqual([{ type: 'text', text: 'abc123' }])
  })

  it('deve incluir botão QUICK_REPLY com payload', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'QUICK_REPLY', text: 'Sim' },
          ],
        },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: {
        body: [],
        buttons: [{ index: 0, params: [{ key: 'reply', text: 'yes_payload' }] }],
      },
      template,
    })
    const buttonComponent = payload.template.components.find((c: any) => c.type === 'button')
    expect(buttonComponent).toBeDefined()
    expect(buttonComponent.sub_type).toBe('quick_reply')
    expect(buttonComponent.parameters).toEqual([{ type: 'payload', payload: 'yes_payload' }])
  })

  it('deve incluir botão COPY_CODE com coupon_code', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'COPY_CODE', text: 'Copiar' },
          ],
        },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: {
        body: [],
        buttons: [{ index: 0, params: [{ key: 'code', text: 'PROMO50' }] }],
      },
      template,
    })
    const buttonComponent = payload.template.components.find((c: any) => c.type === 'button')
    expect(buttonComponent).toBeDefined()
    expect(buttonComponent.sub_type).toBe('copy_code')
    expect(buttonComponent.parameters).toEqual([{ type: 'coupon_code', coupon_code: 'PROMO50' }])
  })

  it('deve incluir botão FLOW com flow_token gerado', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'FLOW', text: 'Iniciar', flow_id: 'flow_123' },
          ],
        },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: { body: [] },
      template,
    })
    const buttonComponent = payload.template.components.find((c: any) => c.type === 'button')
    expect(buttonComponent).toBeDefined()
    expect(buttonComponent.sub_type).toBe('flow')
    expect(buttonComponent.parameters[0].type).toBe('action')
    expect(buttonComponent.parameters[0].action.flow_token).toContain('smartzap:')
  })

  it('deve anexar campaignId ao flow_token', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'FLOW', text: 'Iniciar', flow_id: 'flow_123' },
          ],
        },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: { body: [] },
      template,
      campaignId: 'camp_abc',
    })
    const buttonComponent = payload.template.components.find((c: any) => c.type === 'button')
    expect(buttonComponent.parameters[0].action.flow_token).toContain(':c:camp_abc')
  })

  it('deve usar flow_token fornecido e anexar campaignId', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'FLOW', text: 'Iniciar', flow_id: 'flow_123' },
          ],
        },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: {
        body: [],
        buttons: [{ index: 0, params: [{ key: 'token', text: 'smartzap:flow_123:abc:xyz' }] }],
      },
      template,
      campaignId: 'camp_1',
    })
    const buttonComponent = payload.template.components.find((c: any) => c.type === 'button')
    expect(buttonComponent.parameters[0].action.flow_token).toBe('smartzap:flow_123:abc:xyz:c:camp_1')
  })

  it('deve não duplicar campaignId em flow_token', () => {
    const template = makeTemplate({
      components: [
        { type: 'BODY', text: 'Corpo.' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'FLOW', text: 'Iniciar', flow_id: 'flow_123' },
          ],
        },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: {
        body: [],
        buttons: [{ index: 0, params: [{ key: 'token', text: 'smartzap:flow_123:abc:xyz:c:camp_1' }] }],
      },
      template,
      campaignId: 'camp_1',
    })
    const buttonComponent = payload.template.components.find((c: any) => c.type === 'button')
    // Deve não adicionar ':c:camp_1' novamente
    expect(buttonComponent.parameters[0].action.flow_token).toBe('smartzap:flow_123:abc:xyz:c:camp_1')
  })

  it('deve gerar payload sem componentes quando body não tem variáveis', () => {
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: { body: [] },
    })
    expect(payload.template.components).toEqual([])
  })

  it('deve usar example.header_handle como string JSON quando possível', () => {
    const template = makeTemplate({
      components: [
        {
          type: 'HEADER',
          format: 'IMAGE',
          example: JSON.stringify({ header_handle: ['https://cdn.test.com/img.jpg'] }),
        },
        { type: 'BODY', text: 'Corpo.' },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: { body: [] },
      template,
    })
    expect(payload.template.components).toContainEqual({
      type: 'header',
      parameters: [{ type: 'image', image: { link: 'https://cdn.test.com/img.jpg' } }],
    })
  })

  it('deve gerar button components via values.buttons quando template.components está vazio', () => {
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: {
        body: [],
        buttons: [{ index: 0, params: [{ key: '1', text: 'val' }] }],
      },
    })
    const buttonComponents = payload.template.components.filter((c: any) => c.type === 'button')
    expect(buttonComponents).toHaveLength(1)
    expect(buttonComponents[0].sub_type).toBe('url')
    expect(buttonComponents[0].parameters).toEqual([{ type: 'text', text: 'val' }])
  })

  it('deve gerar botão sem parameters quando params é vazio (fallback path)', () => {
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: {
        body: [],
        buttons: [{ index: 0, params: [] }],
      },
    })
    const buttonComponents = payload.template.components.filter((c: any) => c.type === 'button')
    expect(buttonComponents).toHaveLength(1)
    expect(buttonComponents[0].parameters).toBeUndefined()
  })

  it('deve construir payload com header GIF', () => {
    const template = makeTemplate({
      components: [
        { type: 'HEADER', format: 'GIF' },
        { type: 'BODY', text: 'Corpo.' },
      ],
    })
    const payload = buildMetaTemplatePayload({
      to: '+5511999999999',
      templateName: 'test',
      language: 'pt_BR',
      parameterFormat: 'positional',
      values: { body: [], headerMediaId: 'gif_123' },
      template,
    })
    expect(payload.template.components).toContainEqual({
      type: 'header',
      parameters: [{ type: 'gif', gif: { id: 'gif_123' } }],
    })
  })
})
