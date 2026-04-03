/**
 * WhatsApp Flow Endpoint - Handlers
 *
 * Processa as acoes do WhatsApp Flow para agendamento dinamico.
 * Integra com Google Calendar para buscar slots e criar eventos.
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import {
  getCalendarConfig,
  listBusyTimes,
  createEvent,
  type GoogleCalendarConfig,
} from '@/lib/google-calendar'
import { settingsDb } from '@/lib/supabase-db'
import { supabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/supabase'
import {
  createSuccessResponse,
  createCloseResponse,
  createErrorResponse,
  type FlowDataExchangeRequest,
} from './flow-endpoint-crypto'

// --- Tipos ---

type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

type WorkingHoursDay = {
  day: Weekday
  enabled: boolean
  start: string
  end: string
  slots?: Array<{ start: string; end: string }>
}

type CalendarBookingConfig = {
  timezone: string
  slotDurationMinutes: number
  slotBufferMinutes: number
  workingHours: WorkingHoursDay[]
  minAdvanceHours?: number
  maxAdvanceDays?: number
  allowSimultaneous?: boolean
}

type ServiceType = {
  id: string
  title: string
  durationMinutes?: number
}

// --- Constantes ---

const WEEKDAY_KEYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const WEEKDAY_LABELS: Record<Weekday, 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
}

const DEFAULT_SERVICES: ServiceType[] = [
  { id: 'consulta', title: 'Consulta', durationMinutes: 30 },
  { id: 'visita', title: 'Visita', durationMinutes: 60 },
  { id: 'suporte', title: 'Suporte', durationMinutes: 30 },
]

const DEFAULT_CONFIG: CalendarBookingConfig = {
  timezone: 'America/Sao_Paulo',
  slotDurationMinutes: 30,
  slotBufferMinutes: 10,
  workingHours: [
    { day: 'mon', enabled: true, start: '09:00', end: '18:00' },
    { day: 'tue', enabled: true, start: '09:00', end: '18:00' },
    { day: 'wed', enabled: true, start: '09:00', end: '18:00' },
    { day: 'thu', enabled: true, start: '09:00', end: '18:00' },
    { day: 'fri', enabled: true, start: '09:00', end: '18:00' },
    { day: 'sat', enabled: false, start: '09:00', end: '13:00' },
    { day: 'sun', enabled: false, start: '09:00', end: '13:00' },
  ],
  minAdvanceHours: 4,
  maxAdvanceDays: 14,
  allowSimultaneous: false,
}

// --- Helpers ---

async function getCalendarBookingConfig(): Promise<CalendarBookingConfig> {
  if (!isSupabaseConfigured()) return DEFAULT_CONFIG
  const raw = await settingsDb.get('calendar_booking_config')
  if (!raw) return DEFAULT_CONFIG
  try {
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return DEFAULT_CONFIG
  }
}

async function getBookingServices(fallback?: ServiceType[]): Promise<ServiceType[]> {
  // #region agent log
  console.log('[getBookingServices] start', { supabaseConfigured: isSupabaseConfigured(), hasFallback: !!fallback?.length })
  // #endregion
  if (!isSupabaseConfigured()) {
    console.log('[getBookingServices] Supabase not configured, using defaults')
    return DEFAULT_SERVICES
  }
  const raw = await settingsDb.get('booking_services')
  // #region agent log
  console.log('[getBookingServices] from DB:', { hasRaw: !!raw, rawLength: raw?.length, rawPreview: raw?.substring(0, 100) })
  // #endregion
  if (!raw) {
    console.log('[getBookingServices] No data in DB, using defaults')
    return DEFAULT_SERVICES
  }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      console.log('[getBookingServices] Parsed is not array, using defaults')
      return DEFAULT_SERVICES
    }
    const normalized = parsed
      .map((opt) => ({
        id: typeof opt?.id === 'string' ? opt.id.trim() : String(opt?.id ?? '').trim(),
        title: typeof opt?.title === 'string' ? opt.title.trim() : String(opt?.title ?? '').trim(),
        ...(typeof opt?.durationMinutes === 'number' ? { durationMinutes: opt.durationMinutes } : {}),
      }))
      .filter((opt) => opt.id && opt.title)
    // #region agent log
    console.log('[getBookingServices] normalized:', { count: normalized.length, first: normalized[0] })
    // #endregion
    const resolved = normalized.length ? normalized : (fallback?.length ? fallback : DEFAULT_SERVICES)
    // #region agent log
    // #endregion
    return resolved
  } catch (e) {
    console.error('[getBookingServices] Parse error:', e)
    return fallback?.length ? fallback : DEFAULT_SERVICES
  }
}

function extractMetaFlowIdFromToken(flowToken?: string | null): string | null {
  const raw = String(flowToken || '').trim()
  if (!raw) return null
  const m = raw.match(/^smartzap:(\d{6,25}):/)
  return m?.[1] || null
}

async function loadFlowJsonFromToken(flowToken?: string | null): Promise<Record<string, unknown> | null> {
  if (!isSupabaseConfigured()) return null
  const metaFlowId = extractMetaFlowIdFromToken(flowToken)
  if (!metaFlowId) return null
  const { data, error } = await supabase
    .from('flows')
    .select('flow_json')
    .eq('meta_flow_id', metaFlowId)
    .limit(1)
  if (error) return null
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.flow_json) return null
  if (typeof row.flow_json === 'object') return row.flow_json as Record<string, unknown>
  if (typeof row.flow_json === 'string') {
    try {
      const parsed = JSON.parse(row.flow_json)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  return null
}

function getDataBindingKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = raw.match(/^\$\{data\.([a-zA-Z0-9_]+)\}$/)
  return m?.[1] || null
}

function getFormBindingKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = raw.match(/^\$\{form\.([a-zA-Z0-9_]+)\}$/)
  return m?.[1] || null
}

type BookingRuntimeKeys = {
  startScreenId: string
  timeScreenId: string
  customerScreenId: string
  serviceField: string | null
  dateField: string | null
  slotField: string | null
  payloadKeyByField: Record<string, string>
  dataKeys: {
    services?: string
    dates?: string
    slots?: string
    minDate?: string
    maxDate?: string
    includeDays?: string
    unavailableDates?: string
    startTitle?: string
    startSubtitle?: string
    timeTitle?: string
    timeSubtitle?: string
    customerTitle?: string
    customerSubtitle?: string
  }
  examples: {
    startTitle?: string
    startSubtitle?: string
    timeTitle?: string
    timeSubtitle?: string
    customerTitle?: string
    customerSubtitle?: string
  }
  fallbackServices?: ServiceType[]
}

type FlowNode = Record<string, unknown> & { children?: FlowNode[] }

function collectComponents(nodes: FlowNode[] | undefined | null, out: FlowNode[]) {
  if (!Array.isArray(nodes)) return
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    out.push(node)
    if (Array.isArray(node.children)) {
      collectComponents(node.children, out)
    }
  }
}

function extractScreenComponents(screen: FlowNode): FlowNode[] {
  const out: FlowNode[] = []
  const layout = screen?.layout as FlowNode | undefined
  const layoutChildren = Array.isArray(layout?.children) ? layout.children : []
  collectComponents(layoutChildren as FlowNode[], out)
  return out
}

function extractPayloadKeyMap(screen: FlowNode): Record<string, string> {
  const comps = extractScreenComponents(screen)
  const footer = comps.find((c) => {
    const action = c?.['on-click-action'] as Record<string, unknown> | undefined
    return c?.type === 'Footer' && action?.name === 'data_exchange'
  })
  const action = footer?.['on-click-action'] as Record<string, unknown> | undefined
  const payload = action?.payload
  if (!payload || typeof payload !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(payload)) {
    const field = getFormBindingKey(value)
    if (field) out[field] = key
  }
  return out
}

function extractExample(screen: FlowNode, key?: string): string | undefined {
  if (!key) return undefined
  const data = screen?.data as Record<string, unknown> | undefined
  if (!data || typeof data !== 'object') return undefined
  const entry = data[key]
  if (!entry || typeof entry !== 'object') return undefined
  const example = (entry as Record<string, unknown>).__example__
  return typeof example === 'string' ? example : undefined
}

function extractServiceOptionsFromFlowJson(flowJson: Record<string, unknown>): ServiceType[] | null {
  const screens = Array.isArray(flowJson?.screens) ? flowJson.screens : []
  for (const screen of screens) {
    const data = (screen as FlowNode)?.data as Record<string, unknown> | undefined
    if (!data || typeof data !== 'object') continue
    const servicesEntry = data.services
    const example = servicesEntry && typeof servicesEntry === 'object' ? (servicesEntry as Record<string, unknown>).__example__ : null
    if (Array.isArray(example)) {
      const normalized = example
        .map((opt) => ({
          id: typeof opt?.id === 'string' ? opt.id.trim() : String(opt?.id ?? '').trim(),
          title: typeof opt?.title === 'string' ? opt.title.trim() : String(opt?.title ?? '').trim(),
          ...(typeof opt?.durationMinutes === 'number' ? { durationMinutes: opt.durationMinutes } : {}),
        }))
        .filter((opt) => opt.id && opt.title)
      return normalized.length ? normalized : null
    }
  }
  return null
}

function extractBookingRuntime(flowJson: Record<string, unknown>): BookingRuntimeKeys | null {
  const screens = Array.isArray(flowJson?.screens) ? flowJson.screens : []
  if (!screens.length) return null

  type ScreenInfo = { screen: FlowNode; comps: FlowNode[]; payloadMap: Record<string, string> }

  const screenInfo: ScreenInfo[] = screens.map((screen: unknown) => {
    const s = screen as FlowNode
    const comps = extractScreenComponents(s)
    const payloadMap = extractPayloadKeyMap(s)
    return { screen: s, comps, payloadMap }
  })

  const isChoice = (c: FlowNode) => c?.type === 'Dropdown' || c?.type === 'RadioButtonsGroup' || c?.type === 'CheckboxGroup'
  const isDate = (c: FlowNode) => c?.type === 'CalendarPicker' || c?.type === 'DatePicker'

  const startInfo =
    screenInfo.find(({ comps }) =>
      comps.some((c) => isChoice(c) && getDataBindingKey(c?.['data-source']) === 'services')
    ) ||
    screenInfo.find(({ comps }) => comps.some((c) => isChoice(c) && !!getDataBindingKey(c?.['data-source'])))

  const timeInfo =
    screenInfo.find(({ comps }) => comps.some((c) => isChoice(c) && getDataBindingKey(c?.['data-source']) === 'slots')) ||
    screenInfo.find(({ comps }) => comps.some((c) => isChoice(c) && !!getDataBindingKey(c?.['data-source'])))

  const customerInfo =
    screenInfo.find(({ comps }) => comps.some((c) => c?.type === 'TextInput' || c?.type === 'TextArea')) || null

  if (!startInfo || !timeInfo || !customerInfo) return null

  const startScreen = startInfo.screen
  const timeScreen = timeInfo.screen
  const customerScreen = customerInfo.screen

  const startChoice = startInfo.comps.find((c) => isChoice(c) && !!getDataBindingKey(c?.['data-source']))
  const timeChoice = timeInfo.comps.find((c) => isChoice(c) && !!getDataBindingKey(c?.['data-source']))
  const dateInput =
    startInfo.comps.find((c) => isDate(c)) ||
    startInfo.comps.find((c) => isChoice(c) && getDataBindingKey(c?.['data-source']) === 'dates') ||
    null

  const serviceField = startChoice?.name ? String(startChoice.name) : null
  const dateField = dateInput?.name ? String(dateInput.name) : null
  const slotField = timeChoice?.name ? String(timeChoice.name) : null

  const payloadKeyByField: Record<string, string> = {
    ...startInfo.payloadMap,
    ...timeInfo.payloadMap,
    ...customerInfo.payloadMap,
  }

  const dataKeys = {
    services: getDataBindingKey(startChoice?.['data-source']) || 'services',
    dates: getDataBindingKey(startInfo.comps.find((c) => getDataBindingKey(c?.['data-source']) === 'dates')?.['data-source']) || 'dates',
    slots: getDataBindingKey(timeChoice?.['data-source']) || 'slots',
    minDate: getDataBindingKey(dateInput?.['min-date']) || 'min_date',
    maxDate: getDataBindingKey(dateInput?.['max-date']) || 'max_date',
    includeDays: getDataBindingKey(dateInput?.['include-days']) || 'include_days',
    unavailableDates: getDataBindingKey(dateInput?.['unavailable-dates']) || 'unavailable_dates',
    startTitle: getDataBindingKey(startScreen?.title) || 'title',
    startSubtitle: getDataBindingKey(startInfo.comps.find((c) => c?.type === 'TextSubheading')?.text) || 'subtitle',
    timeTitle: getDataBindingKey(timeScreen?.title) || 'title',
    timeSubtitle: getDataBindingKey(timeInfo.comps.find((c) => c?.type === 'TextSubheading')?.text) || 'subtitle',
    customerTitle: getDataBindingKey(customerScreen?.title) || 'title',
    customerSubtitle: getDataBindingKey(customerInfo.comps.find((c) => c?.type === 'TextSubheading')?.text) || 'subtitle',
  }

  const examples = {
    startTitle: extractExample(startScreen, dataKeys.startTitle),
    startSubtitle: extractExample(startScreen, dataKeys.startSubtitle),
    timeTitle: extractExample(timeScreen, dataKeys.timeTitle),
    timeSubtitle: extractExample(timeScreen, dataKeys.timeSubtitle),
    customerTitle: extractExample(customerScreen, dataKeys.customerTitle),
    customerSubtitle: extractExample(customerScreen, dataKeys.customerSubtitle),
  }

  return {
    startScreenId: String(startScreen?.id || 'BOOKING_START'),
    timeScreenId: String(timeScreen?.id || 'SELECT_TIME'),
    customerScreenId: String(customerScreen?.id || 'CUSTOMER_INFO'),
    serviceField,
    dateField,
    slotField,
    payloadKeyByField,
    dataKeys,
    examples,
    fallbackServices: extractServiceOptionsFromFlowJson(flowJson) || undefined,
  }
}

function getWeekdayKey(date: Date, timeZone: string): Weekday {
  const isoDay = Number(formatInTimeZone(date, timeZone, 'i'))
  return WEEKDAY_KEYS[isoDay - 1]
}

function isWorkingDay(date: Date, timeZone: string, workingHours: WorkingHoursDay[]): boolean {
  const dayKey = getWeekdayKey(date, timeZone)
  const workingDay = workingHours.find((d) => d.day === dayKey)
  return workingDay?.enabled ?? false
}

function parseTimeToMinutes(value: string): number {
  const [hh, mm] = value.split(':').map(Number)
  return (hh || 0) * 60 + (mm || 0)
}

const WEEKDAY_FULL_LABELS: Record<Weekday, string> = {
  mon: 'Segunda',
  tue: 'Terca',
  wed: 'Quarta',
  thu: 'Quinta',
  fri: 'Sexta',
  sat: 'Sabado',
  sun: 'Domingo',
}

function getWeekdayLabel(date: Date, timeZone: string): string {
  const isoDay = Number(formatInTimeZone(date, timeZone, 'i'))
  const dayKey = WEEKDAY_KEYS[isoDay - 1]
  return WEEKDAY_FULL_LABELS[dayKey]
}

function formatDateLabel(dateStr: string, timeZone: string): string {
  const date = fromZonedTime(`${dateStr}T00:00:00`, timeZone)
  const dayLabel = getWeekdayLabel(date, timeZone)
  return `${formatInTimeZone(date, timeZone, 'dd/MM/yyyy')} (${dayLabel})`
}

function formatDateChip(dateStr: string, timeZone: string): string {
  const date = fromZonedTime(`${dateStr}T00:00:00`, timeZone)
  const dayLabel = getWeekdayLabel(date, timeZone)
  return `${dayLabel} - ${formatInTimeZone(date, timeZone, 'dd/MM')}`
}

type CalendarPickerData = {
  minDate: string
  maxDate: string
  includeDays: Array<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'>
  unavailableDates: string[]
}

type AvailableDateOption = {
  id: string
  title: string
}

/**
 * Dados para CalendarPicker (min/max e dias permitidos)
 */
async function getCalendarPickerData(): Promise<CalendarPickerData> {
  const config = await getCalendarBookingConfig()
  const timeZone = config.timezone
  const maxAdvanceDays = config.maxAdvanceDays ?? 14
  
  // Pega a data atual no timezone correto (ex: America/Sao_Paulo)
  const todayStr = formatInTimeZone(new Date(), timeZone, 'yyyy-MM-dd')
  const [year, month, day] = todayStr.split('-').map(Number)

  const maxUtcDate = new Date(Date.UTC(year, month - 1, day + maxAdvanceDays, 12, 0, 0))
  const maxDateStr = maxUtcDate.toISOString().split('T')[0]

  const includeDays = config.workingHours
    .filter((d) => d.enabled)
    .map((d) => WEEKDAY_LABELS[d.day])

  const unavailableDates: string[] = []
  for (let dayOffset = 0; dayOffset <= maxAdvanceDays; dayOffset += 1) {
    const utcDate = new Date(Date.UTC(year, month - 1, day + dayOffset, 12, 0, 0))
    const dateStr = utcDate.toISOString().split('T')[0]
    const jsDay = utcDate.getUTCDay()
    const isoDay = jsDay === 0 ? 7 : jsDay
    const dayKey = WEEKDAY_KEYS[isoDay - 1]
    const workingDay = config.workingHours.find((d) => d.day === dayKey)
    if (!workingDay?.enabled) {
      unavailableDates.push(dateStr)
    }
  }

  return {
    minDate: todayStr,
    maxDate: maxDateStr,
    includeDays,
    unavailableDates,
  }
}

async function getAvailableDates(): Promise<AvailableDateOption[]> {
  const config = await getCalendarBookingConfig()
  const timeZone = config.timezone
  const maxAdvanceDays = config.maxAdvanceDays ?? 14

  const todayStr = formatInTimeZone(new Date(), timeZone, 'yyyy-MM-dd')
  const [year, month, day] = todayStr.split('-').map(Number)

  const dates: AvailableDateOption[] = []
  for (let dayOffset = 0; dayOffset <= maxAdvanceDays; dayOffset += 1) {
    const utcDate = new Date(Date.UTC(year, month - 1, day + dayOffset, 12, 0, 0))
    const dateStr = utcDate.toISOString().split('T')[0]
    const jsDay = utcDate.getUTCDay()
    const isoDay = jsDay === 0 ? 7 : jsDay
    const dayKey = WEEKDAY_KEYS[isoDay - 1]
    const workingDay = config.workingHours.find((d) => d.day === dayKey)
    if (!workingDay?.enabled) continue
    dates.push({
      id: dateStr,
      title: formatDateLabel(dateStr, timeZone),
    })
  }

  return dates
}

/**
 * Busca slots disponiveis para uma data especifica
 * 
 * Respeita:
 * - minAdvanceHours: não mostra slots que estão dentro do período mínimo de antecedência
 * - Eventos ocupados no Google Calendar
 * - Buffer entre slots
 */
async function getAvailableSlots(
  dateStr: string
): Promise<Array<{ id: string; title: string }>> {
  const config = await getCalendarBookingConfig()
  const calendarConfig = await getCalendarConfig()
  const calendarId = calendarConfig?.calendarId

  if (!calendarId) {
    throw new Error('Google Calendar nao conectado')
  }

  const timeZone = config.timezone
  const slotDuration = config.slotDurationMinutes
  const bufferMinutes = config.slotBufferMinutes
  const minAdvanceHours = config.minAdvanceHours ?? 0

  // Limites do dia
  const dayStart = fromZonedTime(`${dateStr}T00:00:00`, timeZone)
  const dayEnd = fromZonedTime(`${dateStr}T23:59:59`, timeZone)
  const now = new Date()
  
  // Calcula o horário mínimo permitido (agora + minAdvanceHours)
  const minAllowedTime = new Date(now.getTime() + minAdvanceHours * 60 * 60 * 1000)

  // Busca ocupacoes do calendario
  const busyItems = await listBusyTimes({
    calendarId,
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    timeZone,
  })

  const bufferMs = bufferMinutes * 60 * 1000
  const busy = busyItems.map((item) => ({
    startMs: new Date(item.start).getTime() - bufferMs,
    endMs: new Date(item.end).getTime() + bufferMs,
  }))

  // Pega horario de trabalho do dia
  const dayKey = getWeekdayKey(dayStart, timeZone)
  const workingDay = config.workingHours.find((d) => d.day === dayKey)

  if (!workingDay?.enabled) {
    return []
  }

  // Suporta múltiplos períodos por dia (ex: 9h-12h e 14h-18h)
  // Se não tiver slots definidos, usa start/end como período único
  const workPeriods = workingDay.slots && workingDay.slots.length > 0
    ? workingDay.slots
    : [{ start: workingDay.start, end: workingDay.end }]

  // Gera slots para cada período de trabalho
  const slots: Array<{ id: string; title: string }> = []

  for (const period of workPeriods) {
    const workStart = parseTimeToMinutes(period.start)
    const workEnd = parseTimeToMinutes(period.end)
    let currentMinutes = workStart

    while (currentMinutes + slotDuration <= workEnd) {
      const hours = Math.floor(currentMinutes / 60)
      const mins = currentMinutes % 60
      const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`

      const slotStart = fromZonedTime(`${dateStr}T${timeStr}:00`, timeZone)
      const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000)

      // Verifica se slot está no passado ou dentro do período mínimo de antecedência
      if (slotStart.getTime() <= minAllowedTime.getTime()) {
        currentMinutes += slotDuration
        continue
      }

      // Verifica colisao com eventos ocupados
      const slotStartMs = slotStart.getTime()
      const slotEndMs = slotEnd.getTime()
      const hasConflict = busy.some(
        (b) => slotStartMs < b.endMs && slotEndMs > b.startMs
      )

      if (!hasConflict) {
        slots.push({
          id: slotStart.toISOString(),
          title: timeStr,
        })
      }

      currentMinutes += slotDuration
    }
  }

  return slots
}

/**
 * Cria evento no Google Calendar
 */
async function createBookingEvent(params: {
  slotIso: string
  service: string
  customerName: string
  customerPhone: string
  notes?: string
}): Promise<{ eventId: string; eventLink?: string }> {
  const config = await getCalendarBookingConfig()
  const calendarConfig = await getCalendarConfig()
  const calendarId = calendarConfig?.calendarId

  if (!calendarId) {
    throw new Error('Google Calendar nao conectado')
  }

  const slotStart = new Date(params.slotIso)
  const slotEnd = new Date(slotStart.getTime() + config.slotDurationMinutes * 60 * 1000)

  const services = await getBookingServices()
  const serviceInfo = services.find((s) => s.id === params.service)
  const serviceName = serviceInfo?.title || params.service

  const event = await createEvent({
    calendarId,
    event: {
      summary: `${serviceName} - ${params.customerName}`,
      description: [
        `Cliente: ${params.customerName}`,
        `Telefone: ${params.customerPhone}`,
        params.notes ? `Observações: ${params.notes}` : null,
        '',
        'Agendado via WhatsApp (SmartZap)',
      ]
        .filter(Boolean)
        .join('\n'),
      start: {
        dateTime: slotStart.toISOString(),
        timeZone: config.timezone,
      },
      end: {
        dateTime: slotEnd.toISOString(),
        timeZone: config.timezone,
      },
    },
  })

  return {
    eventId: event.id || 'created',
    eventLink: event.htmlLink,
  }
}

// --- Handler Principal ---

export async function handleFlowAction(
  request: FlowDataExchangeRequest
): Promise<Record<string, unknown>> {
  const { action, screen, data, flow_token: flowToken } = request

  console.log('[flow-handler] 📋 Processing:', { action, screen, dataKeys: data ? Object.keys(data) : [] })
  // #region agent log
  // #endregion

  // Notificacao de erro do client: apenas reconhecer o payload
  if (data && typeof data === 'object' && 'error' in data) {
    console.log('[flow-handler] ⚠️ Error notification received, acknowledging')
    return {
      data: {
        acknowledged: true,
      },
    }
  }

  let result: Record<string, unknown>
  const flowJson = await loadFlowJsonFromToken(flowToken)
  const runtime = flowJson ? extractBookingRuntime(flowJson) : null
  // #region agent log
  // #endregion

  switch (action) {
    case 'INIT':
      result = await handleInit(runtime)
      break

    case 'data_exchange':
      result = await handleDataExchange(screen || '', data || {}, runtime)
      break

    case 'BACK':
      result = await handleBack(screen || '', data || {})
      break

    default:
      result = createErrorResponse(`Acao desconhecida: ${action}`)
  }

  console.log('[flow-handler] ✅ Result screen:', (result as Record<string, unknown>).screen ?? 'none')

  return result
}

/**
 * INIT - Primeira tela do flow
 * Retorna lista de servicos e datas disponiveis
 */
async function handleInit(runtime?: BookingRuntimeKeys | null): Promise<Record<string, unknown>> {
  try {
    const calendarPicker = await getCalendarPickerData()
    const dates = await getAvailableDates()
    const services = await getBookingServices(runtime?.fallbackServices)
    const keys = runtime?.dataKeys

    // #region agent log
    console.log('[handleInit] services loaded:', { count: services.length, first: services[0], fallbackCount: runtime?.fallbackServices?.length })
    // #endregion

    const dataPayload: Record<string, unknown> = {
      [keys?.services || 'services']: services.map((s) => ({ id: s.id, title: s.title })),
      [keys?.dates || 'dates']: dates,
      [keys?.minDate || 'min_date']: calendarPicker.minDate,
      [keys?.maxDate || 'max_date']: calendarPicker.maxDate,
      [keys?.includeDays || 'include_days']: calendarPicker.includeDays,
      [keys?.unavailableDates || 'unavailable_dates']: calendarPicker.unavailableDates,
      [keys?.startTitle || 'title']: runtime?.examples?.startTitle || 'Agendar Atendimento',
      [keys?.startSubtitle || 'subtitle']: runtime?.examples?.startSubtitle || 'Escolha o tipo de atendimento e a data desejada',
      error_message: '',
      has_error: false,
    }

    // #region agent log
    const servicesKey = keys?.services || 'services'
    console.log('[handleInit] dataPayload services:', { key: servicesKey, count: (dataPayload[servicesKey] as unknown[] | undefined)?.length })
    // #endregion
    // #region agent log
    // #endregion

    return createSuccessResponse(runtime?.startScreenId || 'BOOKING_START', dataPayload)
  } catch (error) {
    console.error('[flow-handler] INIT error:', error)
    return createErrorResponse('Erro ao carregar opcoes de agendamento')
  }
}

/**
 * data_exchange - Usuario interagiu com o flow
 */
async function handleDataExchange(
  screen: string,
  data: Record<string, unknown>,
  runtime?: BookingRuntimeKeys | null
): Promise<Record<string, unknown>> {
  try {
    const startScreenId = runtime?.startScreenId || 'BOOKING_START'
    const timeScreenId = runtime?.timeScreenId || 'SELECT_TIME'
    const customerScreenId = runtime?.customerScreenId || 'CUSTOMER_INFO'
    const keys = runtime?.dataKeys
    const serviceField = runtime?.serviceField || 'selected_service'
    const dateField = runtime?.dateField || 'selected_date'
    const slotField = runtime?.slotField || 'selected_slot'
    const serviceKey = runtime?.payloadKeyByField?.[serviceField] || serviceField
    const dateKey = runtime?.payloadKeyByField?.[dateField] || dateField
    const slotKey = runtime?.payloadKeyByField?.[slotField] || slotField

    switch (screen) {
      // Usuario selecionou servico e data, buscar horarios
      case 'BOOKING_START':
      case startScreenId: {
        const selectedDate = data[dateKey] as string
        const selectedService = data[serviceKey] as string

        if (!selectedDate) {
          return createErrorResponse('Selecione uma data')
        }

        const slots = await getAvailableSlots(selectedDate)

        if (slots.length === 0) {
          const calendarPicker = await getCalendarPickerData()
          const dates = await getAvailableDates()
          const config = await getCalendarBookingConfig()
          const formattedChip = formatDateChip(selectedDate, config.timezone)
          return createSuccessResponse(startScreenId, {
            ...data,
            [keys?.dates || 'dates']: dates,
            [keys?.minDate || 'min_date']: calendarPicker.minDate,
            [keys?.maxDate || 'max_date']: calendarPicker.maxDate,
            [keys?.includeDays || 'include_days']: calendarPicker.includeDays,
            [keys?.unavailableDates || 'unavailable_dates']: calendarPicker.unavailableDates,
            error_message: `${formattedChip} sem horarios. Escolha outra data.`,
            has_error: true,
          })
        }

        const config = await getCalendarBookingConfig()
        const formattedDate = formatDateLabel(selectedDate, config.timezone)

        return createSuccessResponse(timeScreenId, {
          [serviceKey]: selectedService,
          [dateKey]: selectedDate,
          [keys?.slots || 'slots']: slots,
          [keys?.timeTitle || 'title']: runtime?.examples?.timeTitle || 'Escolha o Horário',
          [keys?.timeSubtitle || 'subtitle']: runtime?.examples?.timeSubtitle || `Horários disponíveis para ${formattedDate}`,
        })
      }

      // Usuario selecionou horario, pedir dados do cliente
      case 'SELECT_TIME':
      case timeScreenId: {
        const selectedSlot = data[slotKey] as string
        const selectedService = data[serviceKey] as string
        const selectedDate = data[dateKey] as string

        if (!selectedSlot) {
          return createErrorResponse('Selecione um horario')
        }

        return createSuccessResponse(customerScreenId, {
          [serviceKey]: selectedService,
          [dateKey]: selectedDate,
          [slotKey]: selectedSlot,
          [keys?.customerTitle || 'title']: runtime?.examples?.customerTitle || 'Seus Dados',
          [keys?.customerSubtitle || 'subtitle']: runtime?.examples?.customerSubtitle || 'Preencha seus dados para confirmar',
        })
      }

      // Usuario preencheu dados, confirmar agendamento
      case 'CUSTOMER_INFO':
      case customerScreenId: {
        const customerNameKey = runtime?.payloadKeyByField?.customer_name || 'customer_name'
        const customerPhoneKey = runtime?.payloadKeyByField?.customer_phone || 'customer_phone'
        const notesKey = runtime?.payloadKeyByField?.notes || 'notes'

        const customerName = data[customerNameKey] as string
        const customerPhone = data[customerPhoneKey] as string
        const notes = data[notesKey] as string
        const selectedSlot = data[slotKey] as string
        const selectedService = data[serviceKey] as string

        if (!customerName?.trim()) {
          return createErrorResponse('Informe seu nome')
        }

        // Criar evento no calendario
        const result = await createBookingEvent({
          slotIso: selectedSlot,
          service: selectedService,
          customerName: customerName.trim(),
          customerPhone: customerPhone || '',
          notes,
        })

        // Formatar horario para exibicao
        const slotDate = new Date(selectedSlot)
        const config = await getCalendarBookingConfig()
        const formattedTime = formatInTimeZone(slotDate, config.timezone, 'HH:mm')
        const dateKey = formatInTimeZone(slotDate, config.timezone, 'yyyy-MM-dd')
        const formattedDate = formatDateLabel(dateKey, config.timezone)

        const services = await getBookingServices(runtime?.fallbackServices)
        const serviceInfo = services.find((s) => s.id === selectedService)
        const serviceName = serviceInfo?.title || selectedService

        // Finalizar flow com confirmacao
        return createCloseResponse({
          success: true,
          event_id: result.eventId,
          [serviceKey]: selectedService,
          [dateKey]: formatInTimeZone(slotDate, config.timezone, 'yyyy-MM-dd'),
          [slotKey]: selectedSlot,
          [customerNameKey]: customerName.trim(),
          [customerPhoneKey]: customerPhone || '',
          [notesKey]: notes || '',
          message: `Agendamento confirmado!\n\n${serviceName}\n${formattedDate} as ${formattedTime}\n\nVoce recebera um lembrete.`,
        })
      }

      default:
        return createErrorResponse(`Tela desconhecida: ${screen}`)
    }
  } catch (error) {
    console.error('[flow-handler] data_exchange error:', error)
    return createErrorResponse(
      error instanceof Error ? error.message : 'Erro ao processar'
    )
  }
}

/**
 * BACK - Usuario voltou para tela anterior
 */
async function handleBack(
  screen: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (screen) {
    case 'SELECT_TIME':
      // Voltar para selecao de data
      return handleInit()

    case 'CUSTOMER_INFO': {
      // Voltar para selecao de horario
      const selectedDate = data.selected_date as string
      if (selectedDate) {
        const slots = await getAvailableSlots(selectedDate)
        const config = await getCalendarBookingConfig()
        const formattedDate = formatDateLabel(selectedDate, config.timezone)
        return createSuccessResponse('SELECT_TIME', {
          ...data,
          slots,
          title: 'Escolha o Horário',
          subtitle: `Horários disponíveis para ${formattedDate}`,
        })
      }
      return handleInit()
    }

    default:
      return handleInit()
  }
}
