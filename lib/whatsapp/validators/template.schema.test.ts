import { describe, it, expect } from 'vitest'
import { CreateTemplateSchema } from './template.schema'

// =====================
// Helpers
// =====================

/** Input mínimo válido para CreateTemplateSchema */
function validBase(overrides: Record<string, unknown> = {}) {
  return {
    name: 'meu_template',
    language: 'pt_BR',
    category: 'UTILITY' as const,
    body: { text: 'Olá, tudo bem?' },
    ...overrides,
  }
}

/** Extrai apenas as mensagens de erro de um resultado Zod falho */
function errorMessages(result: { success: boolean; error?: { issues: Array<{ message: string }> } }): string[] {
  if (result.success) return []
  return result.error!.issues.map(i => i.message)
}

/** Extrai paths de erro como strings "a.b.c" */
function errorPaths(result: { success: boolean; error?: { issues: Array<{ path: (string | number)[] }> } }): string[] {
  if (result.success) return []
  return result.error!.issues.map(i => i.path.join('.'))
}

// =====================
// CAMPOS OBRIGATÓRIOS E FORMATO DO NOME
// =====================

describe('CreateTemplateSchema - campos obrigatórios e nome', () => {
  it('deve aceitar um template válido mínimo', () => {
    const result = CreateTemplateSchema.safeParse(validBase())
    expect(result.success).toBe(true)
  })

  it('deve rejeitar quando name está ausente', () => {
    const { name: _, ...rest } = validBase()
    const result = CreateTemplateSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar nome com letras maiúsculas', () => {
    const result = CreateTemplateSchema.safeParse(validBase({ name: 'MeuTemplate' }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('minúsculas')])
    )
  })

  it('deve rejeitar nome com espaços', () => {
    const result = CreateTemplateSchema.safeParse(validBase({ name: 'meu template' }))
    expect(result.success).toBe(false)
  })

  it('deve rejeitar nome com hífens', () => {
    const result = CreateTemplateSchema.safeParse(validBase({ name: 'meu-template' }))
    expect(result.success).toBe(false)
  })

  it('deve aceitar nome com underscore e números', () => {
    const result = CreateTemplateSchema.safeParse(validBase({ name: 'promo_2024_v2' }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar nome vazio', () => {
    const result = CreateTemplateSchema.safeParse(validBase({ name: '' }))
    expect(result.success).toBe(false)
  })

  it('deve usar defaults para language e category', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'test',
      body: { text: 'Olá' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.language).toBe('pt_BR')
      expect(result.data.category).toBe('UTILITY')
    }
  })
})

// =====================
// BOTÕES - LIMITES POR TIPO
// =====================

describe('CreateTemplateSchema - limites de botões por tipo', () => {
  it('deve aceitar até 2 botões URL', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [
        { type: 'URL', text: 'Link 1', url: 'https://a.com' },
        { type: 'URL', text: 'Link 2', url: 'https://b.com' },
      ],
    }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar 3 botões URL', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [
        { type: 'URL', text: 'Link 1', url: 'https://a.com' },
        { type: 'URL', text: 'Link 2', url: 'https://b.com' },
        { type: 'URL', text: 'Link 3', url: 'https://c.com' },
      ],
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('2 botões do tipo URL')])
    )
  })

  it('deve aceitar 1 botão PHONE_NUMBER', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [
        { type: 'PHONE_NUMBER', text: 'Ligar', phone_number: '+5511999999999' },
      ],
    }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar 2 botões PHONE_NUMBER', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [
        { type: 'PHONE_NUMBER', text: 'Ligar 1', phone_number: '+5511999999999' },
        { type: 'PHONE_NUMBER', text: 'Ligar 2', phone_number: '+5511888888888' },
      ],
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('1 botão do tipo PHONE_NUMBER')])
    )
  })

  it('deve aceitar 1 botão COPY_CODE', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [
        { type: 'COPY_CODE', example: 'ABC123' },
      ],
    }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar 2 botões COPY_CODE', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [
        { type: 'COPY_CODE', example: 'ABC123' },
        { type: 'COPY_CODE', example: 'DEF456' },
      ],
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('1 botão do tipo COPY_CODE')])
    )
  })
})

// =====================
// QUICK_REPLY - CONTIGUIDADE
// =====================

describe('CreateTemplateSchema - QUICK_REPLY contíguos', () => {
  it('deve aceitar QUICK_REPLY seguidos', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [
        { type: 'QUICK_REPLY', text: 'Sim' },
        { type: 'QUICK_REPLY', text: 'Não' },
      ],
    }))
    expect(result.success).toBe(true)
  })

  it('deve aceitar QUICK_REPLY antes de outros tipos', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [
        { type: 'QUICK_REPLY', text: 'Sim' },
        { type: 'QUICK_REPLY', text: 'Não' },
        { type: 'URL', text: 'Ver', url: 'https://a.com' },
      ],
    }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar QUICK_REPLY intercalado com outros tipos', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [
        { type: 'QUICK_REPLY', text: 'Sim' },
        { type: 'URL', text: 'Ver', url: 'https://a.com' },
        { type: 'QUICK_REPLY', text: 'Não' },
      ],
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('contíguos')])
    )
  })

  it('deve aceitar outros tipos seguidos de QUICK_REPLY (sem intercalação)', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [
        { type: 'URL', text: 'Link', url: 'https://a.com' },
        { type: 'QUICK_REPLY', text: 'Sim' },
        { type: 'QUICK_REPLY', text: 'Não' },
      ],
    }))
    expect(result.success).toBe(true)
  })
})

// =====================
// NAMED FORMAT + DYNAMIC URL GUARD
// =====================

describe('CreateTemplateSchema - named format com URL dinâmica', () => {
  it('deve rejeitar parameter_format=named com URL dinâmica', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      parameter_format: 'named',
      buttons: [
        { type: 'URL', text: 'Link', url: 'https://site.com/{{1}}' },
      ],
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('named não suporta URL dinâmica')])
    )
  })

  it('deve aceitar parameter_format=named com URL fixa', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      parameter_format: 'named',
      body: { text: 'Olá {{nome}}, como vai?' },
      buttons: [
        { type: 'URL', text: 'Link', url: 'https://site.com/page' },
      ],
    }))
    expect(result.success).toBe(true)
  })

  it('deve aceitar parameter_format=positional com URL dinâmica', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      parameter_format: 'positional',
      buttons: [
        { type: 'URL', text: 'Link', url: 'https://site.com/{{1}}' },
      ],
    }))
    expect(result.success).toBe(true)
  })
})

// =====================
// FOOTER - SEM VARIÁVEIS
// =====================

describe('CreateTemplateSchema - footer sem variáveis', () => {
  it('deve aceitar footer com texto simples', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      footer: { text: 'Responda SAIR' },
    }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar footer com variáveis', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      footer: { text: 'Olá {{1}}, responda' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('Footer não permite variáveis')])
    )
  })

  it('deve rejeitar footer com variáveis nomeadas', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      footer: { text: 'Olá {{nome}}' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('Footer não permite variáveis')])
    )
  })
})

// =====================
// HEADER - EDGE PARAMETERS
// =====================

describe('CreateTemplateSchema - header não pode começar/terminar com variável', () => {
  it('deve rejeitar header que começa com variável', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      header: { format: 'TEXT', text: '{{1}} promoção' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('não pode começar nem terminar com variável')])
    )
  })

  it('deve rejeitar header que termina com variável', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      header: { format: 'TEXT', text: 'Promoção {{1}}' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('não pode começar nem terminar com variável')])
    )
  })

  it('deve aceitar header com variável no meio', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      header: { format: 'TEXT', text: 'Olá {{1}}, promoção!' },
    }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar header com mais de 1 variável', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      header: { format: 'TEXT', text: 'Olá {{1}} e {{2}} aqui' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('apenas 1 variável')])
    )
  })
})

// =====================
// BODY - EDGE PARAMETERS
// =====================

describe('CreateTemplateSchema - body não pode começar/terminar com variável', () => {
  it('deve rejeitar body que começa com variável', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      body: { text: '{{1}} é seu cupom' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('Body não pode começar nem terminar com variável')])
    )
  })

  it('deve rejeitar body que termina com variável', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      body: { text: 'Seu cupom é {{1}}' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('Body não pode começar nem terminar com variável')])
    )
  })

  it('deve aceitar body com variável no meio', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      body: { text: 'Olá {{1}}, tudo bem?' },
    }))
    expect(result.success).toBe(true)
  })
})

// =====================
// POSITIONAL TOKEN VALIDATION
// =====================

describe('CreateTemplateSchema - tokens posicionais', () => {
  it('deve aceitar tokens posicionais sequenciais no body ({{1}} {{2}})', () => {
    // Variável não pode ficar na borda após strip de pontuação — texto após {{2}} evita edge rule
    const result = CreateTemplateSchema.safeParse(validBase({
      body: { text: 'Olá {{1}}, seu código é {{2}} aqui.' },
    }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar tokens posicionais com buracos no body ({{1}} {{3}})', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      body: { text: 'Olá {{1}}, código {{3}}.' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('buracos')])
    )
  })

  it('deve rejeitar tokens não numéricos no modo posicional', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      parameter_format: 'positional',
      body: { text: 'Olá {{nome}}, tudo bem?' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('posicional aceita apenas')])
    )
  })

  it('deve rejeitar token {{0}} no modo posicional (começa em 1)', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      parameter_format: 'positional',
      body: { text: 'Olá {{0}}, tudo bem?' },
    }))
    expect(result.success).toBe(false)
  })

  it('deve aceitar tokens posicionais no header', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      header: { format: 'TEXT', text: 'Olá {{1}} promoção!' },
    }))
    // Note: this will fail because {{1}} is at edge after trimming punctuation
    // The header "Olá {{1}} promoção!" has the variable in the middle, so it should pass
    expect(result.success).toBe(true)
  })

  it('deve rejeitar tokens com buracos no header posicional', () => {
    // header only supports 1 variable, so testing with {{2}} only (skipping {{1}})
    // This triggers "mais de 1 variável" or the positional hole rule
    const result = CreateTemplateSchema.safeParse(validBase({
      header: { format: 'TEXT', text: 'Olá {{2}} promoção!' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('buracos')])
    )
  })
})

// =====================
// NAMED TOKEN VALIDATION
// =====================

describe('CreateTemplateSchema - tokens nomeados', () => {
  it('deve aceitar tokens nomeados válidos no body', () => {
    // Variável não pode ficar na borda após strip de pontuação — texto após {{email_addr}} evita edge rule
    const result = CreateTemplateSchema.safeParse(validBase({
      parameter_format: 'named',
      body: { text: 'Olá {{nome}}, seu email é {{email_addr}} informado.' },
    }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar tokens nomeados com maiúsculas no body', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      parameter_format: 'named',
      body: { text: 'Olá {{Nome}}, tudo bem?' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('named aceita apenas minúsculas')])
    )
  })

  it('deve rejeitar tokens nomeados duplicados no body', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      parameter_format: 'named',
      body: { text: 'Olá {{nome}}, novamente {{nome}}.' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('únicos')])
    )
  })

  it('deve rejeitar tokens nomeados com maiúsculas no header', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      parameter_format: 'named',
      header: { format: 'TEXT', text: 'Olá {{Nome}} promoção!' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('named aceita apenas minúsculas')])
    )
  })

  it('deve rejeitar tokens nomeados duplicados no header', () => {
    // Header supports max 1 variable, so duplicates also trigger "mais de 1 variável"
    // But the named validation checks for duplicate names specifically
    const result = CreateTemplateSchema.safeParse(validBase({
      parameter_format: 'named',
      header: { format: 'TEXT', text: 'A {{nome}} e {{nome}} fim' },
    }))
    expect(result.success).toBe(false)
    // Should have "mais de 1 variável" AND possibly "únicos"
    const msgs = errorMessages(result as any)
    expect(msgs).toEqual(
      expect.arrayContaining([expect.stringContaining('apenas 1 variável')])
    )
  })

  it('deve aceitar token nomeado válido no header', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      parameter_format: 'named',
      header: { format: 'TEXT', text: 'Olá {{nome}} promoção!' },
    }))
    expect(result.success).toBe(true)
  })
})

// =====================
// LIMITED TIME OFFER (LTO) CONSTRAINTS
// =====================

describe('CreateTemplateSchema - Limited Time Offer (LTO)', () => {
  const ltoBase = (overrides: Record<string, unknown> = {}) => ({
    name: 'lto_template',
    language: 'pt_BR',
    category: 'MARKETING' as const,
    body: { text: 'Oferta especial para você!' },
    limited_time_offer: { text: 'Expira hoje!', has_expiration: true },
    buttons: [{ type: 'COPY_CODE' as const, example: 'PROMO10' }],
    ...overrides,
  })

  it('deve aceitar LTO válida com MARKETING + COPY_CODE + body curto', () => {
    const result = CreateTemplateSchema.safeParse(ltoBase())
    expect(result.success).toBe(true)
  })

  it('deve rejeitar LTO com category diferente de MARKETING', () => {
    const result = CreateTemplateSchema.safeParse(ltoBase({ category: 'UTILITY' }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('MARKETING')])
    )
  })

  it('deve rejeitar LTO com body maior que 600 caracteres', () => {
    const longBody = 'A'.repeat(601)
    const result = CreateTemplateSchema.safeParse(ltoBase({
      body: { text: longBody },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('600 caracteres')])
    )
  })

  it('deve aceitar LTO com body de exatamente 600 caracteres', () => {
    const result = CreateTemplateSchema.safeParse(ltoBase({
      body: { text: 'A'.repeat(600) },
    }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar LTO com footer', () => {
    const result = CreateTemplateSchema.safeParse(ltoBase({
      footer: { text: 'Rodapé' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('não permite rodapé')])
    )
  })

  it('deve rejeitar LTO com header TEXT (apenas IMAGE/VIDEO permitido)', () => {
    const result = CreateTemplateSchema.safeParse(ltoBase({
      header: {
        format: 'TEXT',
        text: 'Olá {{1}} promo!',
      },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('IMAGE ou VIDEO')])
    )
  })

  it('deve aceitar LTO com header IMAGE', () => {
    const result = CreateTemplateSchema.safeParse(ltoBase({
      header: {
        format: 'IMAGE',
        example: { header_handle: ['handle123'] },
      },
    }))
    expect(result.success).toBe(true)
  })

  it('deve aceitar LTO com header VIDEO', () => {
    const result = CreateTemplateSchema.safeParse(ltoBase({
      header: {
        format: 'VIDEO',
        example: { header_handle: ['handle123'] },
      },
    }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar LTO sem botão COPY_CODE', () => {
    const result = CreateTemplateSchema.safeParse(ltoBase({
      buttons: [{ type: 'QUICK_REPLY', text: 'Sim' }],
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('COPY_CODE')])
    )
  })

  it('deve rejeitar LTO com COPY_CODE sem exemplo', () => {
    const result = CreateTemplateSchema.safeParse(ltoBase({
      buttons: [{ type: 'COPY_CODE' }],
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('exemplo do COPY_CODE')])
    )
  })

  it('deve rejeitar LTO com COPY_CODE com exemplo maior que 15 caracteres', () => {
    const result = CreateTemplateSchema.safeParse(ltoBase({
      buttons: [{ type: 'COPY_CODE', example: 'A'.repeat(16) }],
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('15 caracteres')])
    )
  })

  it('deve aceitar LTO com COPY_CODE com exemplo de 15 caracteres', () => {
    const result = CreateTemplateSchema.safeParse(ltoBase({
      buttons: [{ type: 'COPY_CODE', example: 'A'.repeat(15) }],
    }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar LTO com header DOCUMENT', () => {
    const result = CreateTemplateSchema.safeParse(ltoBase({
      header: {
        format: 'DOCUMENT',
        example: { header_handle: ['handle123'] },
      },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('IMAGE ou VIDEO')])
    )
  })
})

// =====================
// HEADER MEDIA - EXIGE HANDLE
// =====================

describe('CreateTemplateSchema - header de mídia exige header_handle', () => {
  it('deve rejeitar header IMAGE sem header_handle', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      header: { format: 'IMAGE' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('header_handle')])
    )
  })

  it('deve aceitar header IMAGE com header_handle', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      header: { format: 'IMAGE', example: { header_handle: ['h123'] } },
    }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar header VIDEO sem header_handle', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      header: { format: 'VIDEO' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('header_handle')])
    )
  })

  it('deve rejeitar header DOCUMENT sem header_handle', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      header: { format: 'DOCUMENT' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('header_handle')])
    )
  })

  it('deve rejeitar header GIF sem header_handle', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      category: 'MARKETING',
      header: { format: 'GIF' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('header_handle')])
    )
  })
})

// =====================
// HEADER TEXT VAZIO
// =====================

describe('CreateTemplateSchema - header TEXT exige valor', () => {
  it('deve rejeitar header TEXT com texto vazio', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      header: { format: 'TEXT', text: '' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('Cabeçalho de texto exige um valor')])
    )
  })

  it('deve rejeitar header TEXT sem texto (apenas espaços)', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      header: { format: 'TEXT', text: '   ' },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('Cabeçalho de texto exige um valor')])
    )
  })
})

// =====================
// GIF SOMENTE MARKETING
// =====================

describe('CreateTemplateSchema - GIF apenas em MARKETING', () => {
  it('deve aceitar GIF com category MARKETING', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      category: 'MARKETING',
      header: { format: 'GIF', example: { header_handle: ['h123'] } },
    }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar GIF com category UTILITY', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      category: 'UTILITY',
      header: { format: 'GIF', example: { header_handle: ['h123'] } },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('GIF é permitido apenas em templates MARKETING')])
    )
  })

  it('deve rejeitar GIF com category AUTHENTICATION', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      category: 'AUTHENTICATION',
      header: { format: 'GIF', example: { header_handle: ['h123'] } },
    }))
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('GIF é permitido apenas em templates MARKETING')])
    )
  })
})

// =====================
// URL BUTTON VALIDATION
// =====================

describe('CreateTemplateSchema - validação de URL em botões', () => {
  it('deve aceitar URL HTTPS válida', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [{ type: 'URL', text: 'Link', url: 'https://site.com/page' }],
    }))
    expect(result.success).toBe(true)
  })

  it('deve aceitar URL HTTP válida', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [{ type: 'URL', text: 'Link', url: 'http://site.com/page' }],
    }))
    expect(result.success).toBe(true)
  })

  it('deve aceitar URL com placeholder {{1}}', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [{ type: 'URL', text: 'Link', url: 'https://site.com/{{1}}' }],
    }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar URL que é apenas {{1}} (nua)', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [{ type: 'URL', text: 'Link', url: '{{1}}' }],
    }))
    expect(result.success).toBe(false)
  })

  it('deve rejeitar links wa.me', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [{ type: 'URL', text: 'Link', url: 'https://wa.me/5511999999999' }],
    }))
    expect(result.success).toBe(false)
  })

  it('deve rejeitar links whatsapp.com', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [{ type: 'URL', text: 'Link', url: 'https://whatsapp.com/send' }],
    }))
    expect(result.success).toBe(false)
  })

  it('deve rejeitar URL inválida (sem protocolo)', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [{ type: 'URL', text: 'Link', url: 'site.com/page' }],
    }))
    expect(result.success).toBe(false)
  })
})

// =====================
// BODY VIA content (COMPATIBILIDADE)
// =====================

describe('CreateTemplateSchema - body via campo content', () => {
  it('deve aceitar conteúdo via campo content como fallback', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'my_template',
      language: 'pt_BR',
      category: 'UTILITY',
      content: 'Olá, tudo bem?',
    })
    expect(result.success).toBe(true)
  })

  it('deve validar variáveis no content (posicional)', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'my_template',
      language: 'pt_BR',
      category: 'UTILITY',
      content: 'Olá {{1}}, código {{3}}.',
    })
    expect(result.success).toBe(false)
    expect(errorMessages(result as any)).toEqual(
      expect.arrayContaining([expect.stringContaining('buracos')])
    )
  })
})

// =====================
// CAMPOS OPCIONAIS / EDGE CASES
// =====================

describe('CreateTemplateSchema - campos opcionais e edge cases', () => {
  it('deve aceitar header null', () => {
    const result = CreateTemplateSchema.safeParse(validBase({ header: null }))
    expect(result.success).toBe(true)
  })

  it('deve aceitar footer null', () => {
    const result = CreateTemplateSchema.safeParse(validBase({ footer: null }))
    expect(result.success).toBe(true)
  })

  it('deve aceitar buttons null', () => {
    const result = CreateTemplateSchema.safeParse(validBase({ buttons: null }))
    expect(result.success).toBe(true)
  })

  it('deve aceitar buttons como array vazio', () => {
    const result = CreateTemplateSchema.safeParse(validBase({ buttons: [] }))
    expect(result.success).toBe(true)
  })

  it('deve aceitar carousel null', () => {
    const result = CreateTemplateSchema.safeParse(validBase({ carousel: null }))
    expect(result.success).toBe(true)
  })

  it('deve aceitar limited_time_offer null', () => {
    const result = CreateTemplateSchema.safeParse(validBase({ limited_time_offer: null }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar body vazio', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      body: { text: '' },
    }))
    expect(result.success).toBe(false)
  })

  it('deve rejeitar body com mais de 1024 caracteres', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      body: { text: 'A'.repeat(1025) },
    }))
    expect(result.success).toBe(false)
  })

  it('deve aceitar projectId e itemId opcionais', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      projectId: 'proj_1',
      itemId: 'item_1',
    }))
    expect(result.success).toBe(true)
  })

  it('deve aceitar message_send_ttl_seconds para autenticação', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      category: 'AUTHENTICATION',
      message_send_ttl_seconds: 120,
    }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar message_send_ttl_seconds fora do range', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      message_send_ttl_seconds: 30,
    }))
    expect(result.success).toBe(false)
  })

  it('deve aceitar exampleVariables', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      exampleVariables: ['João', 'ABC123'],
    }))
    expect(result.success).toBe(true)
  })

  it('deve rejeitar botão QUICK_REPLY com texto maior que 25 caracteres', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      buttons: [{ type: 'QUICK_REPLY', text: 'A'.repeat(26) }],
    }))
    expect(result.success).toBe(false)
  })

  it('deve rejeitar header TEXT com mais de 60 caracteres', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      header: { format: 'TEXT', text: 'A'.repeat(61) },
    }))
    expect(result.success).toBe(false)
  })

  it('deve rejeitar footer com mais de 60 caracteres', () => {
    const result = CreateTemplateSchema.safeParse(validBase({
      footer: { text: 'A'.repeat(61) },
    }))
    expect(result.success).toBe(false)
  })

  it('deve rejeitar mais de 10 botões', () => {
    const buttons = Array.from({ length: 11 }, (_, i) => ({
      type: 'QUICK_REPLY' as const,
      text: `B${i}`,
    }))
    const result = CreateTemplateSchema.safeParse(validBase({ buttons }))
    expect(result.success).toBe(false)
  })
})
