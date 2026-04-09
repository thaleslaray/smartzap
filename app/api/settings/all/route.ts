import { NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { supabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/supabase'
import { fetchWithTimeout } from '@/lib/server-http'
import { DEFAULT_AI_PROMPTS, DEFAULT_AI_ROUTES } from '@/lib/ai/ai-center-defaults'
import {
  prepareAiPromptsUpdate,
  prepareAiRoutesUpdate,
} from '@/lib/ai/ai-center-config'
import { DEFAULT_WEBHOOK_PATH } from '@/lib/business/settings'
import type { CalendarBookingConfig, WorkflowExecutionConfig } from '@/types/settings.types'

export const dynamic = 'force-dynamic'

// Default configs (inline to avoid circular dependencies)
const DEFAULT_CALENDAR_BOOKING_CONFIG: CalendarBookingConfig = {
  timezone: 'America/Sao_Paulo',
  slotDurationMinutes: 30,
  slotBufferMinutes: 0,
  workingHours: [
    { day: 'mon', enabled: true, start: '09:00', end: '18:00' },
    { day: 'tue', enabled: true, start: '09:00', end: '18:00' },
    { day: 'wed', enabled: true, start: '09:00', end: '18:00' },
    { day: 'thu', enabled: true, start: '09:00', end: '18:00' },
    { day: 'fri', enabled: true, start: '09:00', end: '18:00' },
    { day: 'sat', enabled: false, start: '09:00', end: '13:00' },
    { day: 'sun', enabled: false, start: '09:00', end: '13:00' },
  ],
  minAdvanceHours: 1,
  maxAdvanceDays: 30,
  allowSimultaneous: false,
}

const DEFAULT_WORKFLOW_EXECUTION_CONFIG: WorkflowExecutionConfig = {
  retryCount: 3,
  retryDelayMs: 1000,
  timeoutMs: 30000,
}
export const revalidate = 0

/**
 * GET /api/settings/all
 *
 * Consolidated endpoint that fetches all independent settings in parallel.
 * Reduces 8+ API calls to 1, improving Settings page load time.
 */

// === TYPES ===

interface CredentialsData {
  phoneNumberId?: string
  businessAccountId?: string
  displayPhoneNumber?: string
  verifiedName?: string
  hasToken?: boolean
  isConnected: boolean
  warning?: string
}

interface AISettingsData {
  provider: string
  model: string
  providers: Record<string, { isConfigured: boolean; source: string; tokenPreview: string | null }>
  isConfigured: boolean
  source: string
  tokenPreview: string | null
  routes: any
  prompts: any
}

interface MetaAppData {
  source: 'db' | 'env' | 'none'
  appId: string | null
  hasAppSecret: boolean
  isConfigured: boolean
}

type TestContactData = {
  name?: string
  phone: string
} | null

interface DomainsData {
  domains: Array<{ value: string; label: string; isPrimary: boolean }>
  webhookPath: string
  currentSelection: string | null
}

interface CalendarBookingData {
  ok: boolean
  source: 'db' | 'default'
  config: any
}

interface WorkflowExecutionData {
  ok: boolean
  source: 'db' | 'env'
  config: any
}

interface UpstashConfigData {
  configured: boolean
  email: string
  hasApiKey: boolean
}

interface AllSettingsResponse {
  credentials: CredentialsData
  ai: AISettingsData
  metaApp: MetaAppData
  testContact: TestContactData
  domains: DomainsData
  calendarBooking: CalendarBookingData
  workflowExecution: WorkflowExecutionData
  upstashConfig: UpstashConfigData
  timestamp: string
}

// === HELPERS ===

function parseJsonSetting<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

// === FETCHERS (same logic as individual routes) ===

async function fetchCredentials(): Promise<CredentialsData> {
  if (!isSupabaseConfigured()) {
    return { isConnected: false, warning: 'Supabase não configurado' }
  }

  let dbSettings = { phoneNumberId: '', businessAccountId: '', accessToken: '', isConnected: false }

  try {
    dbSettings = await settingsDb.getAll()
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return { isConnected: false, warning: `Falha ao ler credenciais do DB: ${errorMsg}` }
  }

  const { phoneNumberId, businessAccountId, accessToken, isConnected } = dbSettings

  // Se não tem credenciais ou está desconectado
  if (!phoneNumberId || !businessAccountId || !accessToken || !isConnected) {
    return { isConnected: false }
  }

  // Buscar informações adicionais da Meta API
  let displayPhoneNumber: string | undefined
  let verifiedName: string | undefined

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2500)
    const metaResponse = await fetch(
      `https://graph.facebook.com/v24.0/${phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { 'Authorization': `Bearer ${accessToken}` }, signal: controller.signal }
    )
    clearTimeout(timeout)
    if (metaResponse.ok) {
      const metaData = await metaResponse.json()
      displayPhoneNumber = metaData.display_phone_number
      verifiedName = metaData.verified_name
    }
  } catch {
    // Ignore - just won't have display number
  }

  return {
    phoneNumberId,
    businessAccountId,
    displayPhoneNumber,
    verifiedName,
    hasToken: true,
    isConnected: true,
  }
}

async function fetchAISettings(): Promise<AISettingsData> {
  const { data } = await supabase.admin
    ?.from('settings')
    .select('key, value')
    .in('key', [
      'ai_direct', 'google_api_key',
      'ai_routes', 'ai_prompts',
    ]) || { data: null }

  const settingsMap = new Map(data?.map(s => [s.key, s.value]) || [])

  const directRaw = parseJsonSetting(settingsMap.get('ai_direct') as string | null, { provider: 'google', model: '' })
  const savedModel = (directRaw.model as string) || ''

  const googleKey = (settingsMap.get('google_api_key') as string) || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || ''

  const getPreview = (key: string) => key ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : null

  return {
    provider: 'google',
    model: savedModel,
    providers: {
      google: {
        isConfigured: !!googleKey,
        source: settingsMap.get('google_api_key') ? 'database' : (googleKey ? 'env' : 'none'),
        tokenPreview: getPreview(googleKey),
      },
    },
    isConfigured: !!googleKey,
    source: settingsMap.get('google_api_key') ? 'database' : (googleKey ? 'env' : 'none'),
    tokenPreview: getPreview(googleKey),
    routes: prepareAiRoutesUpdate(parseJsonSetting(settingsMap.get('ai_routes') as string | null, DEFAULT_AI_ROUTES)),
    prompts: prepareAiPromptsUpdate(parseJsonSetting(settingsMap.get('ai_prompts') as string | null, DEFAULT_AI_PROMPTS)),
  }
}

async function fetchMetaApp(): Promise<MetaAppData> {
  const { data } = await supabase.admin
    ?.from('settings')
    .select('key, value')
    .in('key', ['metaAppId', 'metaAppSecret']) || { data: null }

  const settingsMap = new Map(data?.map(s => [s.key, s.value]) || [])
  const dbAppId = settingsMap.get('metaAppId') as string | undefined
  const dbAppSecret = settingsMap.get('metaAppSecret') as string | undefined

  const envAppId = process.env.META_APP_ID
  const envAppSecret = process.env.META_APP_SECRET

  const appId = dbAppId || envAppId || null
  const hasAppSecret = !!(dbAppSecret || envAppSecret)
  const source = dbAppId ? 'db' : (envAppId ? 'env' : 'none')

  return { source: source as 'db' | 'env' | 'none', appId, hasAppSecret, isConfigured: !!appId && hasAppSecret }
}

async function fetchTestContact(): Promise<TestContactData> {
  const { data } = await supabase.admin
    ?.from('settings')
    .select('value')
    .eq('key', 'test_contact')
    .single() || { data: null }

  if (!data?.value) return null

  try {
    const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
    if (parsed?.phone) return { name: parsed.name, phone: parsed.phone }
  } catch {
    // Ignore parse errors
  }
  return null
}

async function fetchDomains(): Promise<DomainsData> {
  const domains: Array<{ value: string; label: string; isPrimary: boolean }> = []

  // 1. VERCEL_URL (preview/branch deployments)
  if (process.env.VERCEL_URL) {
    domains.push({ value: `https://${process.env.VERCEL_URL}`, label: process.env.VERCEL_URL, isPrimary: false })
  }

  // 2. Custom production domain
  const customDomain = process.env.NEXT_PUBLIC_APP_URL || process.env.PRODUCTION_URL
  if (customDomain) {
    const url = customDomain.startsWith('http') ? customDomain : `https://${customDomain}`
    const label = url.replace(/^https?:\/\//, '')
    domains.push({ value: url, label, isPrimary: true })
  }

  // 3. Current selection from DB
  let currentSelection: string | null = null
  try {
    const { data } = await supabase.admin
      ?.from('settings')
      .select('value')
      .eq('key', 'webhook_domain')
      .single() || { data: null }
    currentSelection = data?.value || null
  } catch {
    // Ignore errors
  }

  return { domains, webhookPath: DEFAULT_WEBHOOK_PATH, currentSelection }
}

async function fetchCalendarBooking(): Promise<CalendarBookingData> {
  const { data } = await supabase.admin
    ?.from('settings')
    .select('value')
    .eq('key', 'calendar_booking_config')
    .single() || { data: null }

  if (!data?.value) {
    return { ok: true, source: 'default', config: DEFAULT_CALENDAR_BOOKING_CONFIG }
  }

  try {
    const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
    return { ok: true, source: 'db', config: { ...DEFAULT_CALENDAR_BOOKING_CONFIG, ...parsed } }
  } catch {
    return { ok: true, source: 'default', config: DEFAULT_CALENDAR_BOOKING_CONFIG }
  }
}

async function fetchWorkflowExecution(): Promise<WorkflowExecutionData> {
  const defaultConfig = {
    maxConcurrency: 5,
    retryAttempts: 3,
    timeoutSeconds: 30,
    debugMode: false,
  }

  const { data } = await supabase.admin
    ?.from('settings')
    .select('value')
    .eq('key', 'workflow_execution_config')
    .single() || { data: null }

  if (!data?.value) {
    return { ok: true, source: 'env', config: defaultConfig }
  }

  try {
    const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
    return { ok: true, source: 'db', config: { ...defaultConfig, ...parsed } }
  } catch {
    return { ok: true, source: 'env', config: defaultConfig }
  }
}

async function fetchUpstashConfig(): Promise<UpstashConfigData> {
  const { data } = await supabase.admin
    ?.from('settings')
    .select('key, value')
    .in('key', ['upstashEmail', 'upstashApiKey']) || { data: null }

  const settingsMap = new Map(data?.map(s => [s.key, s.value]) || [])
  const email = (settingsMap.get('upstashEmail') as string) || ''
  const apiKey = (settingsMap.get('upstashApiKey') as string) || ''

  return {
    configured: Boolean(email && apiKey),
    email,
    hasApiKey: Boolean(apiKey),
  }
}

// === MAIN HANDLER ===

export async function GET() {
  const startTime = Date.now()

  try {
    // Fetch all settings in parallel
    const [credentials, ai, metaApp, testContact, domains, calendarBooking, workflowExecution, upstashConfig] = await Promise.all([
      fetchCredentials().catch((e) => ({ source: 'none' as const, isConnected: false, warning: e.message })),
      fetchAISettings().catch(() => ({
        provider: 'google', model: '', providers: {}, isConfigured: false, source: 'none',
        tokenPreview: null, routes: DEFAULT_AI_ROUTES, prompts: DEFAULT_AI_PROMPTS,
      })),
      fetchMetaApp().catch(() => ({ source: 'none' as const, appId: null, hasAppSecret: false, isConfigured: false })),
      fetchTestContact().catch(() => null),
      fetchDomains().catch(() => ({ domains: [], webhookPath: DEFAULT_WEBHOOK_PATH, currentSelection: null })),
      fetchCalendarBooking().catch(() => ({ ok: true, source: 'default' as const, config: DEFAULT_CALENDAR_BOOKING_CONFIG })),
      fetchWorkflowExecution().catch(() => ({ ok: true, source: 'env' as const, config: {} })),
      fetchUpstashConfig().catch(() => ({ configured: false, email: '', hasApiKey: false })),
    ])

    const response: AllSettingsResponse = {
      credentials,
      ai,
      metaApp,
      testContact,
      domains,
      calendarBooking,
      workflowExecution,
      upstashConfig,
      timestamp: new Date().toISOString(),
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store',
        'X-Response-Time': `${Date.now() - startTime}ms`,
      },
    })
  } catch (error) {
    console.error('[Settings All] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch settings', details: String((error as any)?.message || error) },
      { status: 500 }
    )
  }
}
