import type { Template, TemplateComponent, TemplateButton } from '@/types'
import { normalizePhoneNumber, validatePhoneNumber } from '@/lib/phone-formatter'

export type TemplateParameterFormat = 'positional' | 'named'

export type SkipCode =
  | 'MISSING_CONTACT_ID'
  | 'INVALID_PHONE'
  | 'TEMPLATE_NOT_FOUND'
  | 'TEMPLATE_CONTRACT_INVALID'
  | 'MISSING_REQUIRED_PARAM'
  | 'UNSUPPORTED_TEMPLATE_FEATURE'

export type TemplateVariablesPositional = {
  header?: string[]
  headerMediaId?: string
  headerLocation?: {
    latitude: string
    longitude: string
    name: string
    address: string
  }
  body: string[]
  buttons?: Record<string, string>
}

export type TemplateVariablesNamed = {
  header?: Record<string, string>
  headerMediaId?: string
  headerLocation?: {
    latitude: string
    longitude: string
    name: string
    address: string
  }
  body: Record<string, string>
  buttons?: Record<string, string>
}

export type TemplateVariablesAny = TemplateVariablesPositional | TemplateVariablesNamed

export interface TemplateSpecV1 {
  templateName: string
  language: string
  parameterFormat: TemplateParameterFormat

  header?: {
    kind: 'text'
    // Keys are positional indices ("1") or named placeholders ("first_name")
    requiredKeys: string[]
  }

  body: {
    requiredKeys: string[]
  }

  footer?: {
    text: string
  }

  buttons: Array<
    | {
        kind: 'url'
        index: number
        // If URL has variables, these are the required keys for this button
        requiredKeys: string[]
        // Whether the URL includes variables
        isDynamic: boolean
      }
    | {
        kind: 'other'
        index: number
      }
  >
}

export interface ContactLike {
  phone: string
  name?: string
  email?: string | null
  custom_fields?: Record<string, unknown>
  contactId?: string | null
}

export interface ResolvedTemplateValues {
  header?: Array<{ key: string; text: string }>
  headerMediaId?: string
  headerLocation?: {
    latitude: string
    longitude: string
    name: string
    address: string
  }
  body: Array<{ key: string; text: string }>
  buttons?: Array<{ index: number; params: Array<{ key: string; text: string }> }>
}

export interface PrecheckResult {
  ok: true
  normalizedPhone: string
  values: ResolvedTemplateValues
}

export type MissingParamDetail = {
  where: 'header' | 'body' | 'button'
  key: string
  buttonIndex?: number
  raw: string
}

export interface PrecheckFailure {
  ok: false
  skipCode: SkipCode
  reason: string
  normalizedPhone?: string
  missing?: MissingParamDetail[]
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === ''
}

function getParameterFormatFromTemplate(template: any): TemplateParameterFormat {
  const pf = (template?.parameter_format || template?.parameterFormat) as unknown
  const normalized = typeof pf === 'string' ? pf.toLowerCase() : ''
  return normalized === 'named' ? 'named' : 'positional'
}

function extractPositionalKeys(text: string): string[] {
  const matches = text.match(/\{\{(\d+)\}\}/g) || []
  const numbers = new Set<number>()
  for (const m of matches) {
    const n = Number(m.replace(/[{}]/g, ''))
    if (Number.isFinite(n)) numbers.add(n)
  }
  const sorted = Array.from(numbers).sort((a, b) => a - b)
  if (sorted.length === 0) return []

  const max = sorted[sorted.length - 1]
  for (let i = 1; i <= max; i++) {
    if (!numbers.has(i)) {
      // "documented-only" hard rule: no holes
      throw new Error(`Placeholders posicionais com buraco: falta {{${i}}}`)
    }
  }

  return sorted.map(n => String(n))
}

function extractNamedKeys(text: string): string[] {
  const matches = text.match(/\{\{([a-z0-9_]+)\}\}/g) || []
  const names = new Set<string>()
  for (const m of matches) {
    const name = m.replace(/[{}]/g, '')
    // documented rule: lowercase, numbers, underscore
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      throw new Error(`Placeholder nomeado inválido: {{${name}}}. Use apenas letras minúsculas, números e underscore.`)
    }
    names.add(name)
  }
  return Array.from(names)
}

function extractKeys(text: string, format: TemplateParameterFormat): string[] {
  if (!text || !text.includes('{{')) return []
  return format === 'named' ? extractNamedKeys(text) : extractPositionalKeys(text)
}

function hasAnyPlaceholder(text?: string): boolean {
  return !!text && text.includes('{{')
}

function buttonUrlHasAnyPlaceholder(url?: string): boolean {
  return !!url && url.includes('{{')
}

export function buildTemplateSpecV1(template: Template): TemplateSpecV1 {
  const components: TemplateComponent[] = (template.components as any) || (template.content as any) || []
  const language = template.language || 'pt_BR'
  const parameterFormat = getParameterFormatFromTemplate(template)

  const headerComponent = components.find(c => c.type === 'HEADER' && c.format === 'TEXT' && typeof c.text === 'string')
  const bodyComponent = components.find(c => c.type === 'BODY' && typeof c.text === 'string')
  const footerComponent = components.find(c => c.type === 'FOOTER' && typeof c.text === 'string')
  const buttonComponents = components.filter(c => c.type === 'BUTTONS')

  if (!bodyComponent?.text) {
    throw new Error('Template inválido: componente BODY ausente')
  }

  // HEADER (documented-only): if header text contains placeholders, it supports exactly 1 parameter
  const headerKeys = headerComponent?.text ? extractKeys(headerComponent.text, parameterFormat) : []
  if (headerKeys.length > 1) {
    throw new Error('Template inválido: HEADER de texto suporta no máximo 1 parâmetro')
  }

  const bodyKeys = extractKeys(bodyComponent.text, parameterFormat)

  const buttons: TemplateSpecV1['buttons'] = []
  let globalButtonIndex = 0

  for (const bc of buttonComponents) {
    const btns: TemplateButton[] = (bc.buttons as any) || []
    for (const b of btns) {
      if (b.type === 'URL') {
        const isDynamic = buttonUrlHasAnyPlaceholder(b.url)

        if (parameterFormat === 'named' && isDynamic) {
          // documented-only: named URL placeholders are not documented for URL buttons
          throw new Error('Template inválido: URL dinâmica em botão não é documentada para parameter_format=named. Use template positional ou URL fixa.')
        }

        // documented examples show {{1}} for URL dynamic
        const requiredKeys = isDynamic && b.url ? extractPositionalKeys(b.url) : []
        if (isDynamic && requiredKeys.length > 1) {
          // Keep v1 strict and simple
          throw new Error('Template inválido: botão URL dinâmico suporta no máximo 1 variável no contrato v1')
        }

        buttons.push({
          kind: 'url',
          index: globalButtonIndex,
          isDynamic,
          requiredKeys,
        })
      } else {
        buttons.push({ kind: 'other', index: globalButtonIndex })
      }

      globalButtonIndex++
    }
  }

  return {
    templateName: template.name,
    language,
    parameterFormat,
    header: headerComponent ? { kind: 'text', requiredKeys: headerKeys } : undefined,
    body: { requiredKeys: bodyKeys },
    footer: footerComponent?.text ? { text: footerComponent.text } : undefined,
    buttons,
  }
}

export function resolveVarValue(raw: string | undefined, contact: ContactLike): string {
  const val = (raw ?? '').trim()

  // Tokens documentados internamente do SmartZap (não Meta): nomes em pt-BR + compat
  if (val === '{{nome}}' || val === '{{name}}' || val === '{{contact.name}}') {
    return (contact.name || 'Cliente').trim()
  }
  if (val === '{{telefone}}' || val === '{{phone}}' || val === '{{contact.phone}}') {
    return (contact.phone || '').trim()
  }
  if (val === '{{email}}' || val === '{{contact.email}}') {
    const email = (contact.email ?? (contact.custom_fields as any)?.email ?? '')
    return String(email || '').trim()
  }

  // Custom field token: {{campo_personalizado}}
  const customFieldMatch = val.match(/^\{\{([a-zA-Z0-9_]+)\}\}$/)
  if (customFieldMatch) {
    const fieldName = customFieldMatch[1]
    const customFields = (contact.custom_fields || {}) as Record<string, unknown>
    if (customFields[fieldName] !== undefined && customFields[fieldName] !== null) {
      return String(customFields[fieldName]).trim()
    }
    return ''
  }

  return val
}

// Versão “estrita” usada APENAS no pré-check.
// Objetivo: detectar valores realmente ausentes, sem fallback cosmético (ex.: nome → "Cliente").
function resolveVarValueForPrecheck(raw: string | undefined, contact: ContactLike): string {
  const val = (raw ?? '').trim()

  // Tokens documentados internamente do SmartZap (não Meta): nomes em pt-BR + compat
  if (val === '{{nome}}' || val === '{{name}}' || val === '{{contact.name}}') {
    return String(contact.name || '').trim()
  }
  if (val === '{{telefone}}' || val === '{{phone}}' || val === '{{contact.phone}}') {
    return String(contact.phone || '').trim()
  }
  if (val === '{{email}}' || val === '{{contact.email}}') {
    const email = (contact.email ?? (contact.custom_fields as any)?.email ?? '')
    return String(email || '').trim()
  }

  // Custom field token: {{campo_personalizado}}
  const customFieldMatch = val.match(/^\{\{([a-zA-Z0-9_]+)\}\}$/)
  if (customFieldMatch) {
    const fieldName = customFieldMatch[1]
    const customFields = (contact.custom_fields || {}) as Record<string, unknown>
    if (customFields[fieldName] !== undefined && customFields[fieldName] !== null) {
      return String(customFields[fieldName]).trim()
    }
    return ''
  }

  return val
}

function normalizePositionalArrayOrMap(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(v => String(v ?? ''))
  if (input && typeof input === 'object') {
    // Map with numeric keys "1", "2" ...
    const entries = Object.entries(input as Record<string, unknown>)
      .filter(([k]) => /^\d+$/.test(k))
      .map(([k, v]) => [Number(k), String(v ?? '')] as const)
      .sort((a, b) => a[0] - b[0])

    const arr: string[] = []
    for (const [idx, v] of entries) {
      arr[idx - 1] = v
    }
    return arr.map(v => v ?? '')
  }
  return []
}

function normalizeNamedMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = String(v ?? '')
  }
  return out
}

export function precheckContactForTemplate(
  contact: ContactLike,
  template: Template,
  rawTemplateVariables: TemplateVariablesAny | undefined
): PrecheckResult | PrecheckFailure {
  const spec = buildTemplateSpecV1(template)

  // Enforce "no quick contact" (operational rule)
  if (isBlank(contact.contactId)) {
    return {
      ok: false,
      skipCode: 'MISSING_CONTACT_ID',
      reason: 'Contato não cadastrado (contact_id ausente). Adicione o contato na tela de Contatos antes de enviar.',
    }
  }

  const phoneValidation = validatePhoneNumber(contact.phone)
  const normalizedPhone = normalizePhoneNumber(contact.phone)
  if (!phoneValidation.isValid) {
    return {
      ok: false,
      skipCode: 'INVALID_PHONE',
      reason: phoneValidation.error || 'Telefone inválido para WhatsApp',
      normalizedPhone,
    }
  }

  const values: ResolvedTemplateValues = { body: [] }

  // Debug/observabilidade (para skip_reason): mapear qual "variável" (key) + qual token/raw foi usado.
  // Ex.: body:3 (raw="{{email}}") ou body:email (raw="{{custom_field}}")
  const requiredParams: Array<{
    where: 'header' | 'body' | 'button'
    key: string
    buttonIndex?: number
    raw: string
    resolved: string
  }> = []

  const fmtRaw = (raw: unknown) => {
    const v = raw === null || raw === undefined ? '' : String(raw)
    const trimmed = v.trim()
    return trimmed.length ? trimmed : '<vazio>'
  }

  if (spec.parameterFormat === 'positional') {
    const headerArr = normalizePositionalArrayOrMap((rawTemplateVariables as any)?.header)
    const bodyArr = normalizePositionalArrayOrMap((rawTemplateVariables as any)?.body)
    const buttons = ((rawTemplateVariables as any)?.buttons || {}) as Record<string, string>
    const headerMediaId =
      ((rawTemplateVariables as any)?.headerMediaId as string | undefined) ||
      ((rawTemplateVariables as any)?.header_media_id as string | undefined)

    if (spec.header?.requiredKeys.length) {
      const key = spec.header.requiredKeys[0] // only one
      const idx = Number(key)
      const raw = String(headerArr[idx - 1] ?? '')
      const resolved = resolveVarValueForPrecheck(raw, contact)
      values.header = [{ key, text: resolved }]
      requiredParams.push({ where: 'header', key, raw, resolved })
    }

    values.body = spec.body.requiredKeys.map(k => {
      const idx = Number(k)
      const raw = String(bodyArr[idx - 1] ?? '')
      const resolved = resolveVarValueForPrecheck(raw, contact)
      requiredParams.push({ where: 'body', key: k, raw, resolved })
      return { key: k, text: resolved }
    })

    const buttonValues: Array<{ index: number; params: Array<{ key: string; text: string }> }> = []
    for (const b of spec.buttons) {
      if (b.kind !== 'url' || !b.isDynamic) continue

      const params: Array<{ key: string; text: string }> = []
      for (const k of b.requiredKeys) {
        const idx = Number(k)
        // Accept both legacy key styles: button_{btnIndex}_0 (0-based) and button_{btnIndex}_1 (1-based)
        const legacy = buttons[`button_${b.index}_${idx - 1}`]
        const modern = buttons[`button_${b.index}_${idx}`]
        const raw = String((legacy ?? modern) ?? '')
        const resolved = resolveVarValueForPrecheck(raw, contact)
        params.push({ key: k, text: resolved })
        requiredParams.push({ where: 'button', key: k, buttonIndex: b.index, raw, resolved })
      }
      buttonValues.push({ index: b.index, params })
    }
    if (buttonValues.length) values.buttons = buttonValues
    if (headerMediaId && headerMediaId.trim()) values.headerMediaId = headerMediaId.trim()

    // LOCATION header
    const headerLocation = (rawTemplateVariables as any)?.headerLocation
    if (headerLocation?.latitude && headerLocation?.longitude) {
      values.headerLocation = {
        latitude: String(headerLocation.latitude),
        longitude: String(headerLocation.longitude),
        name: String(headerLocation.name || ''),
        address: String(headerLocation.address || ''),
      }
    }
  } else {
    // named
    const headerMap = normalizeNamedMap((rawTemplateVariables as any)?.header)
    const bodyMap = normalizeNamedMap((rawTemplateVariables as any)?.body)
    const headerMediaId =
      ((rawTemplateVariables as any)?.headerMediaId as string | undefined) ||
      ((rawTemplateVariables as any)?.header_media_id as string | undefined)

    if (spec.header?.requiredKeys.length) {
      const key = spec.header.requiredKeys[0]
      const raw = String(headerMap[key] ?? '')
      const resolved = resolveVarValueForPrecheck(raw, contact)
      values.header = [{ key, text: resolved }]
      requiredParams.push({ where: 'header', key, raw, resolved })
    }

    values.body = spec.body.requiredKeys.map(k => {
      const raw = String(bodyMap[k] ?? '')
      const resolved = resolveVarValueForPrecheck(raw, contact)
      requiredParams.push({ where: 'body', key: k, raw, resolved })
      return { key: k, text: resolved }
    })

    // buttons dynamic is forbidden for named, so nothing to resolve
    if (headerMediaId && headerMediaId.trim()) values.headerMediaId = headerMediaId.trim()

    // LOCATION header
    const headerLocation = (rawTemplateVariables as any)?.headerLocation
    if (headerLocation?.latitude && headerLocation?.longitude) {
      values.headerLocation = {
        latitude: String(headerLocation.latitude),
        longitude: String(headerLocation.longitude),
        name: String(headerLocation.name || ''),
        address: String(headerLocation.address || ''),
      }
    }
  }

  const missingDetails: MissingParamDetail[] = requiredParams
    .filter(p => isBlank(p.resolved))
    .map(p => {
      if (p.where === 'button') {
        return { where: 'button', buttonIndex: p.buttonIndex, key: p.key, raw: fmtRaw(p.raw) }
      }
      return { where: p.where, key: p.key, raw: fmtRaw(p.raw) }
    })

  const missing = missingDetails.map((p) => {
    if (p.where === 'button') {
      return `button:${p.buttonIndex}:${p.key} (raw="${p.raw}")`
    }
    return `${p.where}:${p.key} (raw="${p.raw}")`
  })

  if (missing.length) {
    return {
      ok: false,
      skipCode: 'MISSING_REQUIRED_PARAM',
      reason: `Variáveis obrigatórias sem valor: ${missing.join(', ')}`,
      normalizedPhone,
      missing: missingDetails,
    }
  }

  return { ok: true, normalizedPhone, values }
}

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
