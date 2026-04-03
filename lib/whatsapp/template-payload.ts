/**
 * Template Payload Builder
 *
 * Constrói os payloads da Meta API a partir de templates e valores resolvidos.
 * Separado de template-contract.ts para isolar a lógica de serialização/payload
 * da lógica de validação/spec.
 */

import type { Template, TemplateComponent, TemplateButton } from '@/types'
import type { TemplateParameterFormat, ResolvedTemplateValues } from './template-contract'
import { buttonUrlHasAnyPlaceholder } from './template-contract'

// ── Private helpers ──────────────────────────────────────────────────────────

type TemplateButtonInfo = {
  index: number
  button: TemplateButton
}

function collectTemplateButtons(components: TemplateComponent[]): TemplateButtonInfo[] {
  const buttons: TemplateButtonInfo[] = []
  let index = 0
  for (const comp of components) {
    if (comp.type !== 'BUTTONS') continue
    const btns = (comp.buttons as TemplateButton[]) || []
    for (const btn of btns) {
      buttons.push({ index, button: btn })
      index += 1
    }
  }
  return buttons
}

function mapButtonSubType(buttonType?: TemplateButton['type']): string | null {
  switch (buttonType) {
    case 'URL':
      return 'url'
    case 'QUICK_REPLY':
      return 'quick_reply'
    case 'PHONE_NUMBER':
      return 'phone_number'
    case 'COPY_CODE':
      return 'copy_code'
    case 'OTP':
      return 'otp'
    case 'FLOW':
      return 'flow'
    default:
      // Tipos não suportados pela Meta API para templates
      return null
  }
}

function generateFlowToken(flowId?: string, campaignId?: string): string {
  const seed = Math.random().toString(36).slice(2, 8)
  const stamp = Date.now().toString(36)
  const suffix = campaignId ? `:c:${campaignId}` : ''
  return `smartzap:${flowId || 'flow'}:${stamp}:${seed}${suffix}`
}

function appendCampaignToFlowToken(token: string, campaignId?: string): string {
  if (!campaignId) return token
  if (token.includes(':c:')) return token
  if (!token.startsWith('smartzap:')) return token
  return `${token}:c:${campaignId}`
}

// ── Public API ───────────────────────────────────────────────────────────────

export function buildMetaTemplatePayload(input: {
  to: string
  templateName: string
  language: string
  parameterFormat: TemplateParameterFormat
  values: ResolvedTemplateValues
  template?: Template
  campaignId?: string
}): any {
  const { to, templateName, language, parameterFormat, values, template, campaignId } = input

  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components: [],
    },
  }

  const headerComponent = (template?.components || []).find(
    (c: any) => String(c?.type || '').toUpperCase() === 'HEADER'
  ) as any | undefined
  const headerFormat = headerComponent?.format ? String(headerComponent.format).toUpperCase() : undefined
  const headerIsMedia = headerFormat && ['IMAGE', 'VIDEO', 'DOCUMENT', 'GIF'].includes(headerFormat)
  const headerIsLocation = headerFormat === 'LOCATION'

  const extractHeaderExampleLink = (): string | undefined => {
    const example = headerComponent?.example
    if (!example) return undefined

    let obj: any = example
    if (typeof example === 'string') {
      try {
        obj = JSON.parse(example)
      } catch {
        obj = undefined
      }
    }

    const handle = obj?.header_handle
    if (Array.isArray(handle) && typeof handle[0] === 'string') {
      const v = handle[0].trim()
      return v.length ? v : undefined
    }
    return undefined
  }

  // HEADER: se for mídia, precisamos incluir parâmetro de mídia.
  // Se não houver fonte (link/id), é melhor falhar de forma explícita do que enviar payload inválido
  // e estourar erro na Meta (#132012 expected IMAGE received UNKNOWN).
  if (headerIsMedia) {
    const headerMediaId = values.headerMediaId?.trim()
    const exampleLink = extractHeaderExampleLink()
    const hasLink = Boolean(exampleLink && /^https?:\/\//i.test(exampleLink))
    if (!headerMediaId && !hasLink) {
      throw new Error(
        `Template "${templateName}" possui HEADER ${headerFormat}, mas não há mídia configurada para envio. ` +
          'Dica: sincronize os templates (para obter URL de exemplo) ou implemente suporte a mídia de header no disparo.'
      )
    }

    const mediaParamType =
      headerFormat === 'IMAGE' ? 'image' :
      headerFormat === 'DOCUMENT' ? 'document' :
      headerFormat === 'GIF' ? 'gif' :
      'video'
    const mediaKey = mediaParamType
    payload.template.components.push({
      type: 'header',
      parameters: [
        headerMediaId
          ? {
              type: mediaParamType,
              [mediaKey]: { id: headerMediaId },
            }
          : {
              type: mediaParamType,
              [mediaKey]: { link: exampleLink },
            },
      ],
    })
  }

  // HEADER de localização
  if (headerIsLocation) {
    // Primeiro tenta usar os dados passados em values.headerLocation
    // Se não existir, tenta extrair do componente HEADER do template (dados pré-configurados)
    let loc = values.headerLocation
    if (!loc?.latitude || !loc?.longitude) {
      // Tenta extrair do template (dados salvos no builder)
      const templateLocation = (headerComponent as any)?.location
      if (templateLocation?.latitude && templateLocation?.longitude) {
        loc = {
          latitude: String(templateLocation.latitude),
          longitude: String(templateLocation.longitude),
          name: String(templateLocation.name || ''),
          address: String(templateLocation.address || ''),
        }
      }
    }

    if (!loc?.latitude || !loc?.longitude) {
      throw new Error(
        `Template "${templateName}" possui HEADER LOCATION, mas não há dados de localização configurados. ` +
          'Configure latitude, longitude, nome e endereço no template antes de enviar.'
      )
    }

    // Meta exige que 'address' seja preenchido. Usa 'name' como fallback se address estiver vazio.
    const locationName = String(loc.name || '').trim()
    const locationAddress = String(loc.address || '').trim() || locationName || 'Localização'

    payload.template.components.push({
      type: 'header',
      parameters: [
        {
          type: 'location',
          location: {
            latitude: loc.latitude,
            longitude: loc.longitude,
            name: locationName || locationAddress,
            address: locationAddress,
          },
        },
      ],
    })
  }

  // HEADER de texto (apenas se o template NÃO for header de mídia ou location)
  if (!headerIsMedia && !headerIsLocation && values.header?.length) {
    payload.template.components.push({
      type: 'header',
      parameters: values.header.map((p) =>
        parameterFormat === 'named'
          ? { type: 'text', parameter_name: p.key, text: p.text }
          : { type: 'text', text: p.text }
      ),
    })
  }

  if (values.body?.length) {
    payload.template.components.push({
      type: 'body',
      parameters: values.body.map((p) =>
        parameterFormat === 'named'
          ? { type: 'text', parameter_name: p.key, text: p.text }
          : { type: 'text', text: p.text }
      ),
    })
  }

  const buttonParamsByIndex = new Map<number, Array<{ key: string; text: string }>>(
    (values.buttons || []).map((b) => [b.index, b.params])
  )

  if (template?.components?.length) {
    const templateButtons = collectTemplateButtons(template.components)
    for (const entry of templateButtons) {
      const subType = mapButtonSubType(entry.button.type)
      if (!subType) continue

      const params = buttonParamsByIndex.get(entry.index) || []
      const component: any = {
        type: 'button',
        sub_type: subType,
        index: String(entry.index),
      }

      if (subType === 'url') {
        // Botões de URL estáticos (sem {{1}} na URL) não devem ter componente no payload
        // A Meta retorna erro 132018 se enviarmos componente para botão estático
        const isDynamic = buttonUrlHasAnyPlaceholder(entry.button.url)
        if (!isDynamic) {
          continue // Skip - botão estático não precisa de componente
        }
        if (params.length) {
          component.parameters = params.map((p) => ({ type: 'text', text: p.text }))
        }
      } else if (subType === 'quick_reply') {
        if (params.length) {
          component.parameters = params.map((p) => ({ type: 'payload', payload: p.text }))
        }
      } else if (subType === 'copy_code') {
        if (params[0]?.text) {
          component.parameters = [{ type: 'coupon_code', coupon_code: params[0].text }]
        }
      } else if (subType === 'flow') {
        const flowId =
          (entry.button.flow_id as string | undefined) ||
          ((entry.button.action as any)?.flow_id as string | undefined)
        const rawFlowToken = params[0]?.text?.trim()
        const flowToken = rawFlowToken
          ? appendCampaignToFlowToken(rawFlowToken, campaignId)
          : generateFlowToken(flowId, campaignId)
        const action: Record<string, unknown> = { flow_token: flowToken }

        const flowAction = (entry.button.action as any)?.flow_action
        const flowActionPayload = (entry.button.action as any)?.flow_action_payload
        if (flowAction) action.flow_action = flowAction
        if (flowActionPayload) action.flow_action_payload = flowActionPayload

        component.parameters = [{ type: 'action', action }]
      } else if (subType === 'voice_call') {
        if (entry.button.payload) {
          component.parameters = [{ type: 'payload', payload: entry.button.payload }]
        }
      } else if (subType === 'order_details') {
        if (entry.button.action) {
          component.parameters = [{ type: 'action', action: entry.button.action }]
        }
      }

      payload.template.components.push(component)
    }
  } else if (values.buttons?.length) {
    for (const btn of values.buttons) {
      const buttonComponent: any = {
        type: 'button',
        sub_type: 'url',
        index: String(btn.index),
      }
      // Só inclui parameters se houver parâmetros (botões estáticos não aceitam)
      if (btn.params.length > 0) {
        buttonComponent.parameters = btn.params.map((p) => ({ type: 'text', text: p.text }))
      }
      payload.template.components.push(buttonComponent)
    }
  }

  return payload
}

/**
 * Renderiza template como texto legível para exibição no inbox.
 * Usado para dar contexto à IA e ao operador sobre o que foi enviado.
 *
 * Formato de saída:
 * ```
 * 📋 *Template: nome_do_template*
 *
 * [Header se houver]
 *
 * Corpo do template com {{variáveis}} substituídas
 *
 * _Rodapé se houver_
 *
 * ---
 * [Botão 1]
 * [Botão 2]
 * ```
 */
export function renderTemplatePreviewText(
  template: Template,
  resolvedValues: ResolvedTemplateValues
): string {
  const components: TemplateComponent[] =
    (template.components as TemplateComponent[]) ||
    (template.content as unknown as TemplateComponent[]) ||
    []

  const lines: string[] = []

  // Header com nome do template
  lines.push(`📋 *Template: ${template.name}*`)
  lines.push('')

  // HEADER component
  const headerComponent = components.find((c) => c.type === 'HEADER')
  if (headerComponent) {
    if (headerComponent.format === 'TEXT' && headerComponent.text) {
      // Header de texto - substituir variáveis
      let headerText = headerComponent.text
      if (resolvedValues.header?.length) {
        headerText = replaceTemplateVariables(headerText, resolvedValues.header)
      }
      lines.push(`*${headerText}*`)
      lines.push('')
    } else if (headerComponent.format === 'IMAGE') {
      lines.push('[🖼️ Imagem]')
      lines.push('')
    } else if (headerComponent.format === 'VIDEO') {
      lines.push('[🎬 Vídeo]')
      lines.push('')
    } else if (headerComponent.format === 'DOCUMENT') {
      lines.push('[📄 Documento]')
      lines.push('')
    } else if (headerComponent.format === 'LOCATION') {
      const loc = resolvedValues.headerLocation
      if (loc?.name || loc?.address) {
        lines.push(`[📍 ${loc.name || loc.address}]`)
      } else {
        lines.push('[📍 Localização]')
      }
      lines.push('')
    }
  }

  // BODY component
  const bodyComponent = components.find((c) => c.type === 'BODY')
  if (bodyComponent?.text) {
    let bodyText = bodyComponent.text
    if (resolvedValues.body?.length) {
      bodyText = replaceTemplateVariables(bodyText, resolvedValues.body)
    }
    lines.push(bodyText)
    lines.push('')
  }

  // FOOTER component
  const footerComponent = components.find((c) => c.type === 'FOOTER')
  if (footerComponent?.text) {
    lines.push(`_${footerComponent.text}_`)
    lines.push('')
  }

  // BUTTONS components
  const buttonsComponents = components.filter((c) => c.type === 'BUTTONS')
  const allButtons: TemplateButton[] = []
  for (const bc of buttonsComponents) {
    if (bc.buttons) {
      allButtons.push(...bc.buttons)
    }
  }

  if (allButtons.length > 0) {
    lines.push('---')
    for (const btn of allButtons) {
      if (btn.type === 'URL') {
        lines.push(`[🔗 ${btn.text}]`)
      } else if (btn.type === 'PHONE_NUMBER') {
        lines.push(`[📞 ${btn.text}]`)
      } else if (btn.type === 'QUICK_REPLY') {
        lines.push(`[💬 ${btn.text}]`)
      } else if (btn.type === 'COPY_CODE') {
        lines.push(`[📋 ${btn.text}]`)
      } else if (btn.type === 'FLOW') {
        lines.push(`[📝 ${btn.text}]`)
      } else {
        lines.push(`[${btn.text}]`)
      }
    }
  }

  return lines.join('\n').trim()
}

/**
 * Substitui variáveis posicionais ({{1}}, {{2}}) ou nomeadas ({{nome}}) no texto.
 */
function replaceTemplateVariables(
  text: string,
  values: Array<{ key: string; text: string }>
): string {
  let result = text

  for (const v of values) {
    // Substitui tanto {{1}} quanto {{nome}} dependendo do formato
    const positionalRegex = new RegExp(`\\{\\{${v.key}\\}\\}`, 'g')
    result = result.replace(positionalRegex, v.text)
  }

  return result
}
