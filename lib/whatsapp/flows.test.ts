import { describe, it, expect } from 'vitest'
import { buildFlowMessage } from './flows'

describe('buildFlowMessage', () => {
  const baseOptions = {
    to: '+5511999999999',
    body: 'Preencha o formulário',
    flowId: 'flow_123',
    flowToken: 'token_abc',
  }

  it('deve construir payload básico de flow message', () => {
    const result = buildFlowMessage(baseOptions)
    expect(result).toEqual({
      messaging_product: 'whatsapp',
      to: '+5511999999999',
      type: 'interactive',
      interactive: {
        type: 'flow',
        body: { text: 'Preencha o formulário' },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_id: 'flow_123',
            flow_token: 'token_abc',
            flow_cta: 'Abrir',
            flow_action: 'navigate',
          },
        },
      },
    })
  })

  it('deve usar flowMessageVersion padrão "3"', () => {
    const result = buildFlowMessage(baseOptions)
    expect(result.interactive.action.parameters.flow_message_version).toBe('3')
  })

  it('deve aceitar flowMessageVersion personalizado', () => {
    const result = buildFlowMessage({ ...baseOptions, flowMessageVersion: '2' })
    expect(result.interactive.action.parameters.flow_message_version).toBe('2')
  })

  it('deve usar ctaText padrão "Abrir"', () => {
    const result = buildFlowMessage(baseOptions)
    expect(result.interactive.action.parameters.flow_cta).toBe('Abrir')
  })

  it('deve aceitar ctaText personalizado', () => {
    const result = buildFlowMessage({ ...baseOptions, ctaText: 'Iniciar' })
    expect(result.interactive.action.parameters.flow_cta).toBe('Iniciar')
  })

  it('deve usar action padrão "navigate"', () => {
    const result = buildFlowMessage(baseOptions)
    expect(result.interactive.action.parameters.flow_action).toBe('navigate')
  })

  it('deve aceitar action "data_exchange"', () => {
    const result = buildFlowMessage({ ...baseOptions, action: 'data_exchange' })
    expect(result.interactive.action.parameters.flow_action).toBe('data_exchange')
  })

  it('deve incluir actionPayload quando informado', () => {
    const result = buildFlowMessage({
      ...baseOptions,
      actionPayload: { screen: 'WELCOME', data: { foo: 'bar' } },
    })
    expect(result.interactive.action.parameters.flow_action_payload).toEqual({
      screen: 'WELCOME',
      data: { foo: 'bar' },
    })
  })

  it('não deve incluir flow_action_payload quando actionPayload não é informado', () => {
    const result = buildFlowMessage(baseOptions)
    expect(result.interactive.action.parameters.flow_action_payload).toBeUndefined()
  })

  it('deve incluir header quando informado', () => {
    const result = buildFlowMessage({
      ...baseOptions,
      header: { type: 'text', text: 'Formulário' },
    })
    expect(result.interactive.header).toEqual({ type: 'text', text: 'Formulário' })
  })

  it('não deve incluir header quando não informado', () => {
    const result = buildFlowMessage(baseOptions)
    expect(result.interactive.header).toBeUndefined()
  })

  it('deve incluir footer quando informado', () => {
    const result = buildFlowMessage({ ...baseOptions, footer: 'Rodapé' })
    expect(result.interactive.footer).toEqual({ text: 'Rodapé' })
  })

  it('deve lançar erro quando footer excede 60 caracteres', () => {
    expect(() =>
      buildFlowMessage({ ...baseOptions, footer: 'A'.repeat(61) })
    ).toThrow('Footer excede 60 caracteres')
  })

  it('deve aceitar footer com exatamente 60 caracteres', () => {
    expect(() =>
      buildFlowMessage({ ...baseOptions, footer: 'A'.repeat(60) })
    ).not.toThrow()
  })

  it('deve incluir context quando replyToMessageId é informado', () => {
    const result = buildFlowMessage({ ...baseOptions, replyToMessageId: 'wamid.abc' })
    expect(result.context).toEqual({ message_id: 'wamid.abc' })
  })

  it('não deve incluir context quando replyToMessageId não é informado', () => {
    const result = buildFlowMessage(baseOptions)
    expect(result.context).toBeUndefined()
  })

  it('deve lançar erro quando flowId é vazio', () => {
    expect(() =>
      buildFlowMessage({ ...baseOptions, flowId: '' })
    ).toThrow('flowId é obrigatório')
  })

  it('deve lançar erro quando flowToken é vazio', () => {
    expect(() =>
      buildFlowMessage({ ...baseOptions, flowToken: '' })
    ).toThrow('flowToken é obrigatório')
  })
})
