import { serve } from '@upstash/workflow/nextjs'
import { campaignDb, templateDb } from '@/lib/supabase-db'
import { supabase } from '@/lib/supabase'
import { CampaignStatus, ContactStatus } from '@/types'
import { getUserFriendlyMessageForMetaError, normalizeMetaErrorTextForStorage } from '@/lib/whatsapp-errors'
import { buildMetaTemplatePayload, precheckContactForTemplate, renderTemplatePreviewText } from '@/lib/whatsapp/template-contract'
import { syncCampaignTemplateToInbox } from '@/lib/inbox/inbox-service'
import { emitWorkflowTrace, maskPhone, timePhase } from '@/lib/workflow-trace'
import { createRateLimiter } from '@/lib/rate-limiter'
import { recordStableBatch, recordThroughputExceeded, getAdaptiveThrottleConfigWithSource, getAdaptiveThrottleState } from '@/lib/whatsapp-adaptive-throttle'
import { normalizePhoneNumber } from '@/lib/phone-formatter'
import { getActiveSuppressionsByPhone } from '@/lib/phone-suppressions'
import { maybeAutoSuppressByFailure } from '@/lib/auto-suppression'
import { createCampaignProgressBroadcaster, broadcastCampaignPhase } from '@/lib/realtime-broadcast-server'
import { createHash } from 'crypto'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

function hashConfig(input: unknown): string {
  // Observação: o objetivo é agrupar configs; não precisamos de criptografia forte aqui.
  // JSON.stringify é estável o suficiente porque este objeto tem chaves fixas.
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16)
}

function isHttpUrl(value: string): boolean {
  const v = String(value || '').trim()
  return /^https?:\/\//i.test(v)
}

function getTemplateHeaderMediaExampleLink(template: any): { format?: string; example?: string } {
  const components = (template as any)?.components
  if (!Array.isArray(components)) return {}
  const header = components.find((c: any) => String(c?.type || '').toUpperCase() === 'HEADER') as any | undefined
  if (!header) return {}

  const format = header?.format ? String(header.format).toUpperCase() : undefined
  if (!format || !['IMAGE', 'VIDEO', 'DOCUMENT', 'GIF'].includes(format)) return { format }

  let exampleObj: any = header.example
  if (typeof header.example === 'string') {
    try {
      exampleObj = JSON.parse(header.example)
    } catch {
      exampleObj = undefined
    }
  }

  const arr = exampleObj?.header_handle
  const example = Array.isArray(arr) && typeof arr[0] === 'string' ? String(arr[0]).trim() : undefined
  return { format, example }
}

function overrideTemplateHeaderExampleLink(template: any, link: string): any {
  const components = (template as any)?.components
  if (!Array.isArray(components)) return template

  const nextComponents = components.map((c: any) => {
    const type = String(c?.type || '').toUpperCase()
    if (type !== 'HEADER') return c

    let exampleObj: any = c.example
    if (typeof c.example === 'string') {
      try {
        exampleObj = JSON.parse(c.example)
      } catch {
        exampleObj = undefined
      }
    }

    const nextExample = {
      ...(exampleObj && typeof exampleObj === 'object' ? exampleObj : {}),
      header_handle: [link],
    }

    return {
      ...c,
      // Mantemos o formato (IMAGE/VIDEO/DOCUMENT/GIF) e forçamos o exemplo.
      example: nextExample,
    }
  })

  return { ...template, components: nextComponents }
}

function isWeplinkForbiddenMediaError(args: {
  errorCode?: number
  metaTitle?: string
  metaMessage?: string
  metaDetails?: string
}): boolean {
  // Observação: já vimos variações de código/mensagem em produção.
  // Vamos detectar pelo texto para não depender apenas do code.
  const code = Number(args.errorCode || 0)
  const blob = `${args.metaTitle || ''} ${args.metaMessage || ''} ${args.metaDetails || ''}`.toLowerCase()

  const looksLikeWeplink = blob.includes('weblink') || blob.includes('downloading media from weblink')
  const looksForbidden = blob.includes('http code 403') || blob.includes(' 403') || blob.includes('forbidden')
  if (looksLikeWeplink && looksForbidden) return true

  // Fallback: se o code já é um erro de mídia conhecido, exige pelo menos menção a weblink.
  if (code === 131052 || code === 131053 || code === 131054) {
    return blob.includes('weblink') && (blob.includes('403') || blob.includes('forbidden'))
  }

  return false
}

function getUrlHost(value: string): string | null {
  try {
    const u = new URL(value)
    return u.host || null
  } catch {
    return null
  }
}

function urlLooksLikeMetaWeblink(value: string): boolean {
  try {
    const u = new URL(value)
    const host = String(u.host || '').toLowerCase()
    const path = String(u.pathname || '').toLowerCase()

    // Observação: os "weblinks" mais problemáticos vêm de hosts da Meta e costumam exigir auth.
    if (
      host.includes('lookaside') ||
      host.includes('fbsbx') ||
      host.includes('facebook') ||
      host.includes('fbcdn')
    ) {
      return true
    }

    // Alguns links usam endpoints de attachments e/ou param mid.
    if (path.includes('attachments') || u.searchParams.has('mid')) return true

    return false
  } catch {
    return false
  }
}

function guessExtFromContentType(contentType: string | null | undefined): string {
  const ct = String(contentType || '').toLowerCase().split(';')[0].trim()
  if (ct === 'image/jpeg' || ct === 'image/jpg') return 'jpg'
  if (ct === 'image/png') return 'png'
  if (ct === 'image/webp') return 'webp'
  if (ct === 'image/gif') return 'gif'
  if (ct === 'video/mp4') return 'mp4'
  if (ct === 'video/quicktime') return 'mov'
  if (ct === 'application/pdf') return 'pdf'
  return 'bin'
}

async function tryDownloadBinary(url: string, accessToken?: string): Promise<{
  ok: boolean
  status: number
  contentType?: string
  size?: number
  buffer?: Buffer
  error?: string
}> {
  const timeoutMs = Number(process.env.MEDIA_DOWNLOAD_TIMEOUT_MS || '20000')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  const attempt = async (headers?: Record<string, string>) => {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal })
    const contentType = res.headers.get('content-type') || undefined
    if (!res.ok) {
      return { ok: false, status: res.status, contentType, error: `HTTP ${res.status}` }
    }
    const ab = await res.arrayBuffer()
    const buffer = Buffer.from(ab)
    return {
      ok: true,
      status: res.status,
      contentType,
      size: buffer.byteLength,
      buffer,
    }
  }

  try {
    // 1) Sem auth (ideal: URL realmente público)
    const a1 = await attempt()
    if (a1.ok) return a1

    // 2) Com Bearer token (muitos weblinks do Graph exigem isso)
    if (accessToken) {
      const a2 = await attempt({ Authorization: `Bearer ${accessToken}` })
      return a2
    }

    return a1
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, status: 0, error: msg }
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchSingleTemplateFromMeta(params: {
  businessAccountId: string
  accessToken: string
  templateName: string
}): Promise<
  | {
      name: string
      language?: string
      category?: string
      status?: string
      components?: unknown
      parameter_format?: 'positional' | 'named' | string
      spec_hash?: string | null
      fetched_at?: string | null
    }
  | null
> {
  const { businessAccountId, accessToken, templateName } = params
  const now = new Date().toISOString()

  const url = new URL(`https://graph.facebook.com/v24.0/${businessAccountId}/message_templates`)
  url.searchParams.set('name', templateName)
  // Campos usados no cache local (o payload de envio depende de components.example.header_handle)
  url.searchParams.set('fields', 'name,language,category,status,components,parameter_format,last_updated_time')

  const res = await fetchWithTimeout(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    timeoutMs: 20_000,
  })

  const json = (await safeJson<any>(res)) || {}
  const first = Array.isArray(json?.data) ? json.data[0] : null
  if (!res.ok || !first?.name) return null

  const parameterFormat = (() => {
    const pf = String(first.parameter_format || '').toLowerCase()
    return pf === 'named' ? 'named' : 'positional'
  })()

  const specPayload = {
    name: String(first.name),
    language: String(first.language || 'pt_BR'),
    category: String(first.category || ''),
    parameter_format: parameterFormat,
    components: first.components || [],
  }

  const specHash = createHash('sha256').update(JSON.stringify(specPayload)).digest('hex')

  return {
    name: String(first.name),
    language: String(first.language || 'pt_BR'),
    category: first.category ? String(first.category) : undefined,
    status: first.status ? String(first.status) : undefined,
    components: first.components || [],
    parameter_format: parameterFormat,
    spec_hash: specHash,
    fetched_at: now,
  }
}

interface Contact {
  contactId: string
  phone: string
  name: string
  custom_fields?: Record<string, unknown>
  email?: string
}

interface CampaignWorkflowInput {
  campaignId: string
  traceId?: string
  templateName: string
  contacts: Contact[]
  templateVariables?: { header: string[], headerMediaId?: string, body: string[], buttons?: Record<string, string> }  // Meta API structure
  templateSnapshot?: {
    name: string
    language?: string
    parameter_format?: 'positional' | 'named'
    spec_hash?: string | null
    fetched_at?: string | null
    components?: any
  }
  phoneNumberId: string
  accessToken: string
  isResend?: boolean
  // Config de throttle passada do dispatch (evita dependência de DB no QStash)
  throttleConfig?: {
    enabled: boolean
    sendConcurrency: number
    batchSize: number
    startMps: number
    maxMps: number
    minMps: number
    cooldownSec: number
    minIncreaseGapSec: number
    sendFloorDelayMs: number
  } | null
}

async function claimPendingForSend(
  campaignId: string,
  identifiers: { contactId: string; phone: string },
  traceId?: string
): Promise<string | null> {
  const now = new Date().toISOString()
  const query = supabase
    .from('campaign_contacts')
    .update({ status: 'sending', sending_at: now, trace_id: traceId || null })
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .eq('contact_id', identifiers.contactId)
    .select('id')

  const { data, error } = await query

  if (error) {
    console.warn(
      `[Workflow] Falha ao claimar contato ${identifiers.phone} (seguindo sem enviar):`,
      error
    )
    return null
  }
  const claimed = Array.isArray(data) && data.length > 0
  return claimed ? now : null
}

async function bulkClaimPendingForSend(
  campaignId: string,
  contacts: Array<{ contactId: string }>,
  traceId?: string
): Promise<{ claimedAt: string | null; claimedIds: Set<string> }> {
  const ids = Array.from(
    new Set(
      (contacts || [])
        .map((c) => String(c.contactId || '').trim())
        .filter(Boolean)
    )
  )

  if (ids.length === 0) return { claimedAt: null, claimedIds: new Set() }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('campaign_contacts')
    .update({ status: 'sending', sending_at: now, trace_id: traceId || null })
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .in('contact_id', ids)
    .select('contact_id')

  if (error) {
    console.warn('[Workflow] Falha no bulk claim pending->sending (seguindo sem enviar):', error)
    return { claimedAt: null, claimedIds: new Set() }
  }

  const claimedIds = new Set<string>((data || []).map((r: any) => String(r.contact_id)))
  return { claimedAt: claimedIds.size > 0 ? now : null, claimedIds }
}

/**
 * Build template body parameters
 * {{1}} = contact name (dynamic per contact)
 * {{2}}, {{3}}, ... = static values from templateVariables
 */
function buildBodyParameters(contactName: string, templateVariables: string[] = []): Array<{ type: string; text: string }> {
  // First parameter is always the contact name
  const parameters = [{ type: 'text', text: contactName || 'Cliente' }]

  // Add static variables for {{2}}, {{3}}, etc.
  for (const value of templateVariables) {
    parameters.push({ type: 'text', text: value || '' })
  }

  return parameters
}

// Atualiza status do contato no banco (Supabase)
async function updateContactStatus(
  campaignId: string,
  identifiers: { contactId: string; phone: string },
  status: 'sent' | 'failed' | 'skipped',
  opts?: {
    sendingAt?: string
    messageId?: string
    error?: string
    errorCode?: number
    errorTitle?: string
    errorDetails?: string
    errorFbtraceId?: string
    errorSubcode?: number
    errorHref?: string
    skipCode?: string
    skipReason?: string
    traceId?: string
  }
): Promise<{ ok: boolean; reason?: 'no_rows' | 'error' }> {
  try {
    const now = new Date().toISOString()
    const update: any = {
      status,
    }

    // Útil para manter o valor de início de processamento sem depender do bulk.
    if (opts?.sendingAt) {
      update.sending_at = opts.sendingAt
    }

    // Correlation id for tracing across dispatch/workflow/webhook
    if (opts?.traceId) {
      update.trace_id = opts.traceId
    }

    if (status === 'sent') {
      update.sent_at = now
      update.message_id = opts?.messageId || null
      update.error = null

      // Idempotência: se estamos re-enviando, limpamos rastros antigos.
      update.failed_at = null
      update.skipped_at = null
      update.failure_code = null
      update.failure_reason = null
      update.failure_title = null
      update.failure_details = null
      update.failure_fbtrace_id = null
      update.failure_subcode = null
      update.failure_href = null

      update.skip_code = null
      update.skip_reason = null
    }

    if (status === 'failed') {
      update.failed_at = now
      update.sent_at = null
      update.skipped_at = null
      update.message_id = null
      update.error = opts?.error || null

      // Colunas próprias (quando temos contexto estruturado)
      if (typeof opts?.errorCode === 'number') update.failure_code = opts.errorCode
      if (typeof opts?.errorTitle === 'string') update.failure_title = normalizeMetaErrorTextForStorage(opts.errorTitle, 200)
      if (typeof opts?.errorDetails === 'string') update.failure_details = normalizeMetaErrorTextForStorage(opts.errorDetails, 800)
      if (typeof opts?.errorFbtraceId === 'string') update.failure_fbtrace_id = normalizeMetaErrorTextForStorage(opts.errorFbtraceId, 200)
      if (typeof opts?.errorSubcode === 'number') update.failure_subcode = opts.errorSubcode
      if (typeof opts?.errorHref === 'string') update.failure_href = normalizeMetaErrorTextForStorage(opts.errorHref, 400)

      // failure_reason é usado pela UI e por queries; mantemos alinhado com `error`.
      if (typeof opts?.error === 'string' && opts.error.trim()) {
        update.failure_reason = opts.error
      }

      update.skip_code = null
      update.skip_reason = null
    }

    if (status === 'skipped') {
      const skipReason = opts?.skipReason || opts?.error || null
      update.skipped_at = now
      update.skip_code = opts?.skipCode || null
      update.skip_reason = skipReason
      // CHECK constraint exige: failure_reason IS NOT NULL OR error IS NOT NULL quando status='skipped'
      update.error = skipReason
      update.message_id = null

      update.sent_at = null
      update.failed_at = null
      update.failure_code = null
      update.failure_reason = skipReason
      update.failure_title = null
      update.failure_details = null
      update.failure_fbtrace_id = null
      update.failure_subcode = null
      update.failure_href = null
    }

    // Importante: não podemos regredir status (ex.: webhook já marcou delivered/read)
    // enquanto o workflow ainda está persistindo `sent`.
    let query = supabase
      .from('campaign_contacts')
      .update(update)
      .eq('campaign_id', campaignId)
      .eq('contact_id', identifiers.contactId)

    if (status === 'sent') {
      query = query.in('status', ['pending', 'sending', 'sent'] as any)
    }

    const { data, error } = await query.select('id')
    if (error) {
      console.error(`Failed to update contact status: ${identifiers.phone}`, error)
      return { ok: false, reason: 'error' }
    }

    const updated = Array.isArray(data) && data.length > 0
    return updated ? { ok: true } : { ok: false, reason: 'no_rows' }
  } catch (e) {
    console.error(`Failed to update contact status: ${identifiers.phone}`, e)
    return { ok: false, reason: 'error' }
  }
}

// Upstash Workflow - Durable background processing
// Each step is a separate HTTP request, bypasses Vercel 10s timeout
const workflowHandler = serve<CampaignWorkflowInput>(
  async (context) => {
    const { campaignId, templateName, contacts, templateVariables, phoneNumberId, accessToken, templateSnapshot, traceId: incomingTraceId, throttleConfig: payloadThrottleConfig } = context.requestPayload

    const traceId = (incomingTraceId && String(incomingTraceId).trim().length > 0)
      ? String(incomingTraceId).trim()
      : `wf_${campaignId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`


    // HARDENING: workflow é estritamente baseado em contact_id.
    // Se vier algum contato sem contactId, é bug no dispatch/resend e devemos falhar cedo.
    // NOTA: Esta validação é síncrona e determinística, pode ficar fora de context.run()
    const missingContactIds = (contacts || []).filter((c) => !c.contactId || String(c.contactId).trim().length === 0)
    if (missingContactIds.length > 0) {
      const sample = missingContactIds.slice(0, 10).map((c) => ({ phone: c.phone, name: c.name || '' }))
      throw new Error(
        `[Workflow] Payload inválido: ${missingContactIds.length} contato(s) sem contactId. Exemplo: ${JSON.stringify(sample)}`
      )
    }

    let shouldStopWorkflow: 'cancelled' | null = null

    // Step 1: Check cancellation and mark campaign as SENDING
    // IMPORTANTE: Todo código não-determinístico (DB, fetch, etc) DEVE estar dentro de context.run()
    // Ref: https://upstash.com/docs/workflow/basics/caveats#avoid-non-deterministic-code-outside-context-run
    await context.run('init-campaign', async () => {
      // Emit trace de início
      await emitWorkflowTrace({
        traceId,
        campaignId,
        step: 'workflow',
        phase: 'start',
        ok: true,
        extra: {
          contacts: contacts?.length || 0,
          hasTemplateSnapshot: Boolean(templateSnapshot),
          isResend: Boolean((context.requestPayload as any)?.isResend),
        },
      })

      const nowIso = new Date().toISOString()
      const existing = await campaignDb.getById(campaignId)

      // Verifica se campanha foi cancelada antes de iniciar
      if (existing?.status === CampaignStatus.CANCELLED) {
        await emitWorkflowTrace({
          traceId,
          campaignId,
          step: 'workflow',
          phase: 'cancelled_before_start',
          ok: true,
        })
        console.log(`🛑 Campaign ${campaignId} already CANCELLED before workflow start. Exiting.`)
        shouldStopWorkflow = 'cancelled'
        return
      }

      const startedAt = (existing as any)?.startedAt || nowIso

      await campaignDb.updateStatus(campaignId, {
        status: CampaignStatus.SENDING,
        startedAt,
        completedAt: null,
      })

      console.log(`📊 Campaign ${campaignId} started with ${contacts.length} contacts (traceId=${traceId})`)
      console.log(`📝 Template variables: ${JSON.stringify(templateVariables || [])}`)
    })

    if (shouldStopWorkflow === 'cancelled') {
      console.log(`🛑 Workflow stopped for campaign ${campaignId} (CANCELLED during init).`)
      return
    }

    // Step 2: Preparar batches (usa config do payload ou fallback para DB)
    // IMPORTANTE: Chamadas assíncronas devem estar dentro de context.run()
    const { batches, BATCH_SIZE, cfgForBatching } = await context.run('prepare-batches', async () => {
      // Prioridade: config do payload (passada pelo dispatch) > DB > env > default
      let cfg: Awaited<ReturnType<typeof getAdaptiveThrottleConfigWithSource>> | null = null
      if (payloadThrottleConfig) {
        cfg = { config: payloadThrottleConfig, source: 'db' as const, rawPresent: true }
        console.log('[Workflow] Using throttle config from dispatch payload')
      } else {
        cfg = await getAdaptiveThrottleConfigWithSource().catch(() => null)
        console.log(`[Workflow] Throttle config from ${cfg?.source ?? 'fallback'}`)
      }
      const rawBatchSize = Number(cfg?.config?.batchSize ?? process.env.WHATSAPP_WORKFLOW_BATCH_SIZE ?? '10')
      const batchSize = Number.isFinite(rawBatchSize)
        ? Math.max(1, Math.min(200, Math.floor(rawBatchSize)))
        : 10

      const contactBatches: Contact[][] = []
      for (let i = 0; i < contacts.length; i += batchSize) {
        contactBatches.push(contacts.slice(i, i + batchSize))
      }

      console.log(`📦 Prepared ${contactBatches.length} batches of up to ${batchSize} contacts each (batchSize=${batchSize})`)
      return { batches: contactBatches, BATCH_SIZE: batchSize, cfgForBatching: cfg }
    })

    // Step 3+: Process contacts in smaller batches
    // Each batch is a separate step = separate HTTP request = bypasses 10s limit
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]


      await context.run(`send-batch-${batchIndex}`, async () => {
        const step = `send-batch-${batchIndex}`

        let batchOk = true
        let batchError: string | null = null

        await emitWorkflowTrace({
          traceId,
          campaignId,
          step,
          batchIndex,
          phase: 'batch_start',
          ok: true,
          extra: { batchSize: batch.length, batches: batches.length },
        })

        let sentCount = 0
        let failedCount = 0
        let skippedCount = 0
        let firstDispatchAtInBatch: string | null = null
        let lastSentAtInBatch: string | null = null
        let metaTimeMs = 0
        let dbTimeMs = 0

        // Adaptive throttle (global throughput) — state compartilhado via settings.
        // Ajuda a "pisar no acelerador" sem ficar batendo em 130429 o tempo todo.
        // Usa a config que já foi carregada no prepare-batches (evita nova chamada ao DB)
        const adaptiveConfig = cfgForBatching?.config || null
        const adaptiveEnabled = Boolean(adaptiveConfig?.enabled)
        let sawThroughput429 = false
        let limiter: ReturnType<typeof createRateLimiter> | null = null

        let targetMpsForBatch: number | null = null
        const floorDelayMs = Number(adaptiveConfig?.sendFloorDelayMs ?? process.env.WHATSAPP_SEND_FLOOR_DELAY_MS ?? '0')

        const rawConcurrency = Number(adaptiveConfig?.sendConcurrency ?? process.env.WHATSAPP_SEND_CONCURRENCY ?? '1')
        const concurrency = Number.isFinite(rawConcurrency)
          ? Math.max(1, Math.min(50, Math.floor(rawConcurrency)))
          : 1

        // Broadcast efêmero de progresso (UI em tempo real) — best-effort.
        // DB continua sendo a fonte da verdade; isto só melhora UX.
        const progress = createCampaignProgressBroadcaster({
          campaignId,
          traceId,
          batchIndex,
          flushIntervalMs: 250,
        })

        try {
          // Sinaliza início do batch para a UI (sem depender de Postgres changes)
          try {
            await broadcastCampaignPhase(campaignId, {
              traceId,
              batchIndex,
              phase: 'batch_start',
            })
          } catch {
            // best-effort
          }

          const initialTemplate = await templateDb.getByName(templateName)
          if (!initialTemplate) throw new Error(`Template ${templateName} não encontrado no banco local. Sincronize Templates.`)

          // Fonte operacional do batch: preferimos snapshot da campanha quando existir.
          let templateForBatch: any = templateSnapshot || initialTemplate

          // Refresh sob demanda para reduzir 403/URL expirada em header de mídia.
          let refreshedTemplateForBatch: any | null = null
          let refreshPromise: Promise<any | null> | null = null

          // Fallback: quando o weblink retornado pela Meta não é acessível pelos servidores do WhatsApp,
          // tentamos baixar a mídia no backend e re-hospedar em um URL público (Supabase Storage).
          type HostedHeaderMediaResult = {
            url: string
            mode: 'public' | 'signed'
            bucket: string
            path: string
            contentType?: string
            size?: number
            downloadStatus?: number
            publicProbeStatus?: number
            signedExpiresIn?: number
          }

          let hostedHeaderMediaForBatch: HostedHeaderMediaResult | null = null
          let hostPromise: Promise<HostedHeaderMediaResult | null> | null = null
          let headerMediaIdForBatch: string | null = null
          let headerMediaIdPromise: Promise<string | null> | null = null

          const hashHeaderMediaSource = (value: string): string => {
            return createHash('sha256').update(value).digest('hex').slice(0, 32)
          }

          const uploadMediaToMeta = async (params: {
            phoneNumberId: string
            accessToken: string
            buffer: Buffer
            contentType?: string
            filename: string
          }): Promise<{ ok: boolean; status: number; id?: string; error?: string }> => {
            try {
              const form = new FormData()
              const contentType = params.contentType || 'application/octet-stream'
              form.append('messaging_product', 'whatsapp')
              form.append('type', contentType)
              const bytes = new Uint8Array(params.buffer)
              form.append('file', new Blob([bytes], { type: contentType }), params.filename)

              const res = await fetch(`https://graph.facebook.com/v24.0/${params.phoneNumberId}/media`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${params.accessToken}` },
                body: form,
              })
              const body = await safeJson<any>(res)
              if (!res.ok) {
                return {
                  ok: false,
                  status: res.status,
                  error: body?.error?.message || `HTTP ${res.status}`,
                }
              }
              const id = String(body?.id || '').trim()
              if (!id) {
                return { ok: false, status: res.status, error: 'Resposta sem media_id' }
              }
              return { ok: true, status: res.status, id }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e)
              return { ok: false, status: 0, error: msg }
            }
          }

          const ensureHeaderMediaIdForBatch = async (templateCandidate?: any): Promise<string | null> => {
            if (headerMediaIdForBatch) return headerMediaIdForBatch
            if (headerMediaIdPromise) return await headerMediaIdPromise

            headerMediaIdPromise = (async () => {
              try {
                const active = templateCandidate || refreshedTemplateForBatch || templateForBatch || initialTemplate
                const headerInfo = getTemplateHeaderMediaExampleLink(active)
                const example = headerInfo.example
                if (!example || !isHttpUrl(example)) return null
                const exampleHash = hashHeaderMediaSource(example)

                const cachedId = (active as any)?.headerMediaId as string | null | undefined
                const cachedHash = (active as any)?.headerMediaHash as string | null | undefined
                if (cachedId && cachedHash && cachedHash === exampleHash) {
                  headerMediaIdForBatch = cachedId
                  return headerMediaIdForBatch
                }

                const maxBytes = Number(process.env.MEDIA_REHOST_MAX_BYTES || String(25 * 1024 * 1024))
                const downloaded = await tryDownloadBinary(example, accessToken)
                if (!downloaded.ok || !downloaded.buffer) return null
                if (typeof downloaded.size === 'number' && downloaded.size > maxBytes) return null

                const contentType = downloaded.contentType || 'application/octet-stream'
                const ext = guessExtFromContentType(contentType)
                const safeName = String(templateName || 'template').replace(/[^a-zA-Z0-9_\-]/g, '_')
                const filename = `${safeName}.${ext}`

                const up = await uploadMediaToMeta({
                  phoneNumberId,
                  accessToken,
                  buffer: downloaded.buffer,
                  contentType,
                  filename,
                })
                if (!up.ok || !up.id) return null
                headerMediaIdForBatch = up.id

                // Cache persistente: evita reupload em próximos disparos.
                try {
                  await supabase
                    .from('templates')
                    .update({
                      header_media_id: up.id,
                      header_media_hash: exampleHash,
                      header_media_updated_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    })
                    .eq('name', templateName)
                } catch (e) {
                  console.warn('[Workflow] Falha ao persistir header_media_id (best-effort):', e)
                }

                return headerMediaIdForBatch
              } catch (e) {
                console.warn('[Workflow] Falha ao gerar media_id do header (best-effort):', e)
                return null
              }
            })()

            const out = await headerMediaIdPromise
            return out
          }

          const ensureRefreshedTemplateForBatch = async (): Promise<any | null> => {
            if (refreshedTemplateForBatch) return refreshedTemplateForBatch
            if (refreshPromise) return await refreshPromise
            refreshPromise = (async () => {
              try {
                const creds = await getWhatsAppCredentials()
                if (!creds?.businessAccountId || !accessToken) return null

                const refreshed = await fetchSingleTemplateFromMeta({
                  businessAccountId: creds.businessAccountId,
                  accessToken,
                  templateName,
                })

                if (!refreshed) return null
                await templateDb.upsert([refreshed])
                const local = await templateDb.getByName(templateName)
                refreshedTemplateForBatch = local || refreshed
                templateForBatch = refreshedTemplateForBatch
                return refreshedTemplateForBatch
              } catch (e) {
                console.warn('[Workflow] Falha ao fazer refresh pontual do template na Meta (best-effort):', e)
                return null
              }
            })()

            const out = await refreshPromise
            return out
          }

          const ensureHostedHeaderMediaUrlForBatch = async (templateCandidate?: any): Promise<HostedHeaderMediaResult | null> => {
            if (hostedHeaderMediaForBatch) return hostedHeaderMediaForBatch
            if (hostPromise) return await hostPromise

            hostPromise = (async () => {
              try {
                const active = templateCandidate || refreshedTemplateForBatch || templateForBatch
                const headerInfo = getTemplateHeaderMediaExampleLink(active)
                const example = headerInfo.example
                if (!example || !isHttpUrl(example)) return null

                // Limites defensivos (evita subir arquivos gigantes por acidente)
                const maxBytes = Number(process.env.MEDIA_REHOST_MAX_BYTES || String(25 * 1024 * 1024))

                const downloaded = await tryDownloadBinary(example, accessToken)
                if (!downloaded.ok || !downloaded.buffer) {
                  return null
                }
                if (typeof downloaded.size === 'number' && downloaded.size > maxBytes) return null

                const client = supabase.admin
                if (!client) return null

                const bucket = String(process.env.SUPABASE_TEMPLATE_MEDIA_BUCKET || 'wa-template-media')
                // Best-effort: cria bucket público se não existir.
                try {
                  await client.storage.createBucket(bucket, { public: true })
                } catch {
                  // ignore (já existe / sem permissão)
                }

                // Best-effort: se o bucket já existia e estava privado, tentamos torná-lo público.
                // (Caso contrário, getPublicUrl vai gerar um URL que retorna 403.)
                try {
                  await client.storage.updateBucket(bucket, { public: true })
                } catch {
                  // ignore
                }

                const contentType = downloaded.contentType || 'application/octet-stream'
                const ext = guessExtFromContentType(contentType)
                const urlHash = createHash('sha256').update(example).digest('hex').slice(0, 12)
                const specHash = String((active as any)?.spec_hash || (active as any)?.specHash || 'na')
                const safeName = String(templateName || 'template').replace(/[^a-zA-Z0-9_\-]/g, '_')
                const path = `templates/${safeName}/${specHash}_${urlHash}.${ext}`

                const up = await client.storage
                  .from(bucket)
                  .upload(path, downloaded.buffer, {
                    contentType,
                    upsert: true,
                    cacheControl: '3600',
                  })

                if (up.error) return null

                const pub = client.storage.from(bucket).getPublicUrl(path)
                const publicUrl = pub?.data?.publicUrl

                // Proba rápida: valida se o URL público realmente é acessível sem auth.
                // Se retornar 403/401, caímos para signed URL (TTL alto), que costuma funcionar melhor com a Meta.
                const probeTimeoutMs = Number(process.env.MEDIA_PUBLIC_PROBE_TIMEOUT_MS || '8000')
                const probe = async (url: string) => {
                  try {
                    const controller = new AbortController()
                    const t = setTimeout(() => controller.abort(), probeTimeoutMs)
                    try {
                      const res = await fetch(url, { method: 'GET', signal: controller.signal })
                      return res.status
                    } finally {
                      clearTimeout(t)
                    }
                  } catch {
                    return 0
                  }
                }

                if (publicUrl) {
                  const status = await probe(publicUrl)
                  if (status >= 200 && status < 300) {
                    hostedHeaderMediaForBatch = {
                      url: publicUrl,
                      mode: 'public',
                      bucket,
                      path,
                      contentType,
                      size: downloaded.size,
                      downloadStatus: downloaded.status,
                      publicProbeStatus: status,
                    }
                    try {
                      const exampleHash = createHash('sha256').update(example).digest('hex').slice(0, 32)
                      await supabase
                        .from('templates')
                        .update({
                          header_media_preview_url: publicUrl,
                          header_media_preview_expires_at: null,
                          header_media_hash: exampleHash,
                          header_media_preview_updated_at: new Date().toISOString(),
                          updated_at: new Date().toISOString(),
                        })
                        .eq('name', templateName)
                    } catch {
                      // best-effort
                    }
                    return hostedHeaderMediaForBatch
                  }

                  // Se não é acessível publicamente, tenta signed URL.
                  const expiresIn = Number(process.env.MEDIA_SIGNED_URL_TTL_SECONDS || String(24 * 60 * 60))
                  const signed = await client.storage.from(bucket).createSignedUrl(path, expiresIn)
                  const signedUrl = signed?.data?.signedUrl
                  if (signedUrl) {
                    hostedHeaderMediaForBatch = {
                      url: signedUrl,
                      mode: 'signed',
                      bucket,
                      path,
                      contentType,
                      size: downloaded.size,
                      downloadStatus: downloaded.status,
                      publicProbeStatus: status,
                      signedExpiresIn: expiresIn,
                    }
                    try {
                      const exampleHash = createHash('sha256').update(example).digest('hex').slice(0, 32)
                      await supabase
                        .from('templates')
                        .update({
                          header_media_preview_url: signedUrl,
                          header_media_preview_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
                          header_media_hash: exampleHash,
                          header_media_preview_updated_at: new Date().toISOString(),
                          updated_at: new Date().toISOString(),
                        })
                        .eq('name', templateName)
                    } catch {
                      // best-effort
                    }
                    return hostedHeaderMediaForBatch
                  }
                }

                return null
              } catch (e) {
                console.warn('[Workflow] Falha ao re-hospedar mídia do header (best-effort):', e)
                return null
              }
            })()

            const out = await hostPromise
            return out
          }

          // ==============================================
          // PREVENTIVO: Rehost antes de enviar (evita falha
          // assíncrona no webhook mesmo quando o send é aceito)
          // ==============================================
          try {
            const headerInfoPre = getTemplateHeaderMediaExampleLink(templateForBatch)
            const examplePre = headerInfoPre.example
            const headerIsMediaPre = Boolean(
              headerInfoPre.format && ['IMAGE', 'VIDEO', 'DOCUMENT', 'GIF'].includes(String(headerInfoPre.format))
            )

            const alwaysRehostEnabled = process.env.ALWAYS_REHOST_TEMPLATE_MEDIA === '1'
            const exampleIsHttp = Boolean(examplePre && isHttpUrl(String(examplePre)))
            const exampleHost = examplePre ? getUrlHost(String(examplePre)) : null
            const templateVarsHeaderMediaId =
              (templateVariables as any)?.headerMediaId || (templateVariables as any)?.header_media_id

            // Observabilidade: quando o rehost preventivo está habilitado, queremos entender
            // por que ele rodou (ou não) em produção.
            const shouldProactivelyRehost =
              headerIsMediaPre &&
              exampleIsHttp &&
              (urlLooksLikeMetaWeblink(String(examplePre)) || alwaysRehostEnabled)

            // Se está habilitado e NÃO vamos rehost, persistimos um evento de skip com o motivo.
            if (alwaysRehostEnabled && !shouldProactivelyRehost) {
              await emitWorkflowTrace({
                traceId,
                campaignId,
                step,
                batchIndex,
                phase: 'template_media_rehost_prepare_skip',
                ok: true,
                extra: {
                  reason: !headerIsMediaPre
                    ? 'header_not_media'
                    : !examplePre
                      ? 'missing_example'
                      : !exampleIsHttp
                        ? 'example_not_http'
                        : 'does_not_look_like_weblink',
                  headerFormat: headerInfoPre.format || null,
                  exampleHost,
                },
              })
            }

            if (shouldProactivelyRehost && examplePre) {
              await emitWorkflowTrace({
                traceId,
                campaignId,
                step,
                batchIndex,
                phase: 'template_media_rehost_prepare_start',
                ok: true,
                extra: {
                  headerFormat: headerInfoPre.format || null,
                  exampleHost,
                  alwaysRehostEnabled,
                },
              })

              const hosted = await ensureHostedHeaderMediaUrlForBatch(templateForBatch)
              if (hosted?.url) {
                templateForBatch = overrideTemplateHeaderExampleLink(templateForBatch, hosted.url)

                await emitWorkflowTrace({
                  traceId,
                  campaignId,
                  step,
                  batchIndex,
                  phase: 'template_media_rehost_prepare_ok',
                  ok: true,
                  extra: {
                    hostedMode: hosted.mode,
                    hostedHost: getUrlHost(hosted.url),
                    publicProbeStatus: hosted.publicProbeStatus ?? null,
                    signedExpiresIn: hosted.signedExpiresIn ?? null,
                  },
                })
              } else {
                await emitWorkflowTrace({
                  traceId,
                  campaignId,
                  step,
                  batchIndex,
                  phase: 'template_media_rehost_prepare_skip',
                  ok: true,
                  extra: {
                    reason: 'rehost_failed_or_unavailable',
                  },
                })
              }
            }

            // PREVENTIVO: gerar media_id automaticamente (invisível ao usuário) quando não fornecido.
            if (headerIsMediaPre && exampleIsHttp && !templateVarsHeaderMediaId) {
              await emitWorkflowTrace({
                traceId,
                campaignId,
                step,
                batchIndex,
                phase: 'template_media_id_prepare_start',
                ok: true,
                extra: {
                  headerFormat: headerInfoPre.format || null,
                  exampleHost,
                },
              })

              const mediaId = await ensureHeaderMediaIdForBatch(templateForBatch)
              if (mediaId) {
                await emitWorkflowTrace({
                  traceId,
                  campaignId,
                  step,
                  batchIndex,
                  phase: 'template_media_id_prepare_ok',
                  ok: true,
                  extra: {
                    mediaIdPrefix: mediaId.slice(0, 8),
                  },
                })
              } else {
                await emitWorkflowTrace({
                  traceId,
                  campaignId,
                  step,
                  batchIndex,
                  phase: 'template_media_id_prepare_skip',
                  ok: true,
                  extra: {
                    reason: 'media_id_unavailable',
                  },
                })
              }
            }
          } catch (e) {
            // Best-effort: nunca bloquear envio por causa disso.
            await emitWorkflowTrace({
              traceId,
              campaignId,
              step,
              batchIndex,
              phase: 'template_media_rehost_prepare_error',
              ok: false,
              extra: {
                error: e instanceof Error ? e.message : String(e),
              },
            })
          }

          // Check pause status once per batch (trade-off: no DB hit per contact)
          const { data: campaignStatusAtBatchStart } = await supabase
            .from('campaigns')
            .select('status')
            .eq('id', campaignId)
            .single()

          if (campaignStatusAtBatchStart?.status === CampaignStatus.CANCELLED) {
            console.log(`🛑 Campaign ${campaignId} is cancelled, stopping workflow at batch ${batchIndex}`)
            shouldStopWorkflow = 'cancelled'

            // Broadcast best-effort
            try {
              await broadcastCampaignPhase(campaignId, {
                traceId,
                batchIndex,
                phase: 'cancelled',
              })
            } catch {
              // best-effort
            }

            await emitWorkflowTrace({
              traceId,
              campaignId,
              step,
              batchIndex,
              phase: 'cancelled',
              ok: true,
            })

            return
          }

          if (campaignStatusAtBatchStart?.status === CampaignStatus.PAUSED) {
            console.log(`⏸️ Campaign ${campaignId} is paused, skipping batch ${batchIndex}`)
            return
          }

          if (adaptiveEnabled) {
            const state = await getAdaptiveThrottleState(phoneNumberId)
            limiter = createRateLimiter(state.targetMps)
            targetMpsForBatch = state.targetMps

            await emitWorkflowTrace({
              traceId,
              campaignId,
              step,
              batchIndex,
              phase: 'throttle_state',
              ok: true,
              extra: {
                enabled: true,
                targetMps: state.targetMps,
                cooldownUntil: state.cooldownUntil || null,
              },
            })
          }

          await emitWorkflowTrace({
            traceId,
            campaignId,
            step,
            batchIndex,
            phase: 'batch_config',
            ok: true,
            extra: {
              concurrency,
              batchSize: BATCH_SIZE,
              adaptiveEnabled,
              floorDelayMs,
              turboConfigSource: cfgForBatching?.source || null,
              turboRawPresent: cfgForBatching?.rawPresent ?? null,
              batchingConfigSource: cfgForBatching?.source || null,
              batchingRawPresent: cfgForBatching?.rawPresent ?? null,
            },
          })

          // =====================================================================
          // Checagens globais por batch (opt-out + supressões)
          // =====================================================================
          const optOutContactIds = new Set<string>()
          try {
            const ids = Array.from(new Set(batch.map(c => String(c.contactId || '').trim()).filter(Boolean)))
            if (ids.length > 0) {
              const { data: rows, error } = await supabase
                .from('contacts')
                .select('id, status')
                .in('id', ids)

              if (error) throw error
              for (const r of (rows || []) as any[]) {
                if (String(r?.status) === ContactStatus.OPT_OUT) {
                  optOutContactIds.add(String(r.id))
                }
              }
            }
          } catch (e) {
            console.warn('[Workflow] Falha ao carregar contacts.status (best-effort):', e)
          }

          let suppressionsByPhone = new Map<string, { phone: string; reason: string | null; source: string | null }>()
          try {
            const phones = Array.from(new Set(batch.map(c => normalizePhoneNumber(String(c.phone || '').trim())).filter(Boolean)))
            const active = await getActiveSuppressionsByPhone(phones)
            suppressionsByPhone = new Map(
              Array.from(active.entries()).map(([phone, row]) => [phone, { phone, reason: row.reason, source: row.source }])
            )
          } catch (e) {
            console.warn('[Workflow] Falha ao carregar phone_suppressions (best-effort):', e)
          }

          // =====================================================================
          // Bulk claim (pending -> sending) para remover round-trips por contato.
          // A partir daqui, só processamos contatos que foram realmente claimados.
          // =====================================================================
          const claimT0 = Date.now()
          const { claimedAt, claimedIds } = await bulkClaimPendingForSend(
            campaignId,
            batch.map((c) => ({ contactId: String(c.contactId) })),
            traceId
          )
          dbTimeMs += Date.now() - claimT0

          if (claimedAt && !firstDispatchAtInBatch) firstDispatchAtInBatch = claimedAt


          await emitWorkflowTrace({
            traceId,
            campaignId,
            step,
            batchIndex,
            phase: 'db_claim_pending_bulk',
            ok: true,
            ms: Date.now() - claimT0,
            extra: {
              requested: batch.length,
              claimed: claimedIds.size,
            },
          })

          if (claimedIds.size === 0) {
            console.log(`↩️ Idempotência: nenhum contato estava pending no batch ${batchIndex}, pulando.`)
            return
          }

          type ContactWriteOpts = {
            // Timestamp ISO do início do processamento do contato (mantém utilidade de sending_at sem round-trip por contato)
            sendingAt?: string
            messageId?: string
            error?: string
            errorCode?: number
            errorTitle?: string
            errorDetails?: string
            errorFbtraceId?: string
            errorSubcode?: number
            errorHref?: string
            skipCode?: string
            skipReason?: string
            traceId?: string
          }

          type PendingWriteOp = {
            contact: Contact
            status: 'sent' | 'failed' | 'skipped'
            opts?: ContactWriteOpts
          }

          const writeOps: PendingWriteOp[] = []

          const pushWriteOp = (op: PendingWriteOp) => {
            writeOps.push(op)
          }

          const processContact = async (contact: Contact) => {
            // Timestamp do início do processamento (precisa existir mesmo se cair no catch)
            const sendingAtIso = new Date().toISOString()

            try {
              const phoneMasked = maskPhone(contact.phone)

              // Só processa se foi claimado agora (idempotência + retry safe)
              if (!claimedIds.has(String(contact.contactId))) {
                return
              }

              if (limiter) {
                await limiter.acquire()
              }

              // Marca o início do processamento deste contato.
              // Persistimos via bulk upsert para manter a utilidade de `sending_at`
              // sem round-trip por contato.

            const activeTemplateForContact = refreshedTemplateForBatch || templateForBatch

            // Contrato Ouro: pré-check/guard-rail por contato (documented-only)
            const precheck = precheckContactForTemplate(
              {
                phone: contact.phone,
                name: contact.name,
                email: contact.email,
                custom_fields: contact.custom_fields,
                contactId: contact.contactId || null,
              },
              activeTemplateForContact as any,
              templateVariables as any
            )

            if (!precheck.ok) {
              pushWriteOp({
                contact,
                status: 'skipped',
                opts: {
                  sendingAt: sendingAtIso,
                  skipCode: precheck.skipCode,
                  skipReason: precheck.reason,
                  traceId,
                },
              })


              await emitWorkflowTrace({
                traceId,
                campaignId,
                step,
                batchIndex,
                contactId: contact.contactId,
                phoneMasked,
                phase: 'precheck_skip',
                ok: true,
                extra: { skipCode: precheck.skipCode, reason: precheck.reason },
              })
              skippedCount++
              progress.bump({ skipped: 1 })
              console.log(`⏭️ Skipped ${contact.phone}: ${precheck.reason}`)
              return
            }

            // Opt-out e supressão global (defensivo: também roda aqui, mesmo que o dispatch tenha filtrado)
            if (optOutContactIds.has(String(contact.contactId))) {
              pushWriteOp({
                contact,
                status: 'skipped',
                opts: {
                  sendingAt: sendingAtIso,
                  skipCode: 'OPT_OUT',
                  skipReason: 'Contato opt-out (não quer receber mensagens).',
                  traceId,
                },
              })

              await emitWorkflowTrace({
                traceId,
                campaignId,
                step,
                batchIndex,
                contactId: contact.contactId,
                phoneMasked,
                phase: 'optout_skip',
                ok: true,
              })

              skippedCount++
              progress.bump({ skipped: 1 })
              console.log(`⏭️ Skipped (opt-out) ${contact.phone}`)
              return
            }

            const suppression = suppressionsByPhone.get(precheck.normalizedPhone)
            if (suppression) {
              pushWriteOp({
                contact,
                status: 'skipped',
                opts: {
                  sendingAt: sendingAtIso,
                  skipCode: 'SUPPRESSED',
                  skipReason: `Telefone suprimido globalmente${suppression.reason ? `: ${suppression.reason}` : ''}`,
                  traceId,
                },
              })

              await emitWorkflowTrace({
                traceId,
                campaignId,
                step,
                batchIndex,
                contactId: contact.contactId,
                phoneMasked,
                phase: 'suppression_skip',
                ok: true,
                extra: { source: suppression.source, reason: suppression.reason },
              })

              skippedCount++
              progress.bump({ skipped: 1 })
              console.log(`⏭️ Skipped (suppressed) ${contact.phone}`)
              return
            }

            // Claim foi feito em bulk no início do batch.
            const valuesForSend =
              headerMediaIdForBatch && !precheck.values.headerMediaId
                ? { ...precheck.values, headerMediaId: headerMediaIdForBatch }
                : precheck.values

            let whatsappPayload: any
            try {
              const activeTemplate = refreshedTemplateForBatch || templateForBatch
              whatsappPayload = buildMetaTemplatePayload({
                to: precheck.normalizedPhone,
                templateName,
                language: (activeTemplate as any).language || 'pt_BR',
                parameterFormat: (activeTemplate as any).parameter_format || (activeTemplate as any).parameterFormat || 'positional',
                values: valuesForSend,
                template: activeTemplate as any,
                campaignId,
              })
            } catch (e) {
              const reason = e instanceof Error ? e.message : String(e)
              pushWriteOp({
                contact,
                status: 'skipped',
                opts: {
                  sendingAt: sendingAtIso,
                  skipCode: 'UNSUPPORTED_TEMPLATE_FEATURE',
                  skipReason: reason,
                  traceId,
                },
              })

              await emitWorkflowTrace({
                traceId,
                campaignId,
                step,
                batchIndex,
                contactId: contact.contactId,
                phoneMasked,
                phase: 'payload_build_skip',
                ok: true,
                extra: { reason },
              })

              skippedCount++
              progress.bump({ skipped: 1 })
              console.log(`⏭️ Skipped (payload build) ${contact.phone}: ${reason}`)
              return
            }

            if (process.env.DEBUG_META_PAYLOAD === '1') {
              console.log('--- META API PAYLOAD (CONTRACT) ---', JSON.stringify(whatsappPayload, null, 2))
            }

            const metaStart = Date.now()

            // Timeout defensivo para não ficar "preso" sem meta_send_ok/meta_send_fail.
            // Ajustável via env; default bem conservador (60s).
            const metaTimeoutMs = Number(process.env.META_FETCH_TIMEOUT_MS || '60000')
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), metaTimeoutMs)

            let response: Response
            let data: any
            try {

              await emitWorkflowTrace({
                traceId,
                campaignId,
                step,
                batchIndex,
                contactId: contact.contactId,
                phoneMasked,
                phase: 'meta_request_start',
                ok: true,
                extra: { timeoutMs: metaTimeoutMs },
              })

              response = await fetch(
                `https://graph.facebook.com/v24.0/${phoneNumberId}/messages`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(whatsappPayload),
                  signal: controller.signal,
                }
              )

              data = await response.json()
            } finally {
              clearTimeout(timeout)
            }

            const metaMs = Date.now() - metaStart
            metaTimeMs += metaMs


            if (response.ok && data.messages?.[0]?.id) {
              const messageId = data.messages[0].id


              // CRÍTICO: persistir imediatamente o message_id.
              // Caso contrário, o webhook de delivered/read pode chegar ANTES do bulk upsert,
              // falhar no lookup por message_id e a entrega nunca será contabilizada.
              const db0 = Date.now()
              await updateContactStatus(
                campaignId,
                { contactId: contact.contactId, phone: contact.phone },
                'sent',
                { sendingAt: sendingAtIso, messageId, traceId }
              )
              dbTimeMs += Date.now() - db0

              // Sincroniza template com inbox (fire-and-forget, non-blocking)
              // Permite que a IA tenha contexto e o operador veja o histórico
              const activeTemplateForSync = refreshedTemplateForBatch || templateForBatch
              syncCampaignTemplateToInbox({
                phone: precheck.normalizedPhone,
                contactId: contact.contactId,
                whatsappMessageId: messageId,
                templateName,
                templatePreviewText: renderTemplatePreviewText(
                  activeTemplateForSync as any,
                  valuesForSend
                ),
                resolvedValues: valuesForSend,
                campaignId,
                template: activeTemplateForSync as any,
              }).catch((err) => {
                console.warn(`[workflow] inbox sync failed for ${contact.phone}:`, err)
              })

              // Métrica operacional: quando foi o último "sent" (envio/dispatch), sem depender de delivery.
              lastSentAtInBatch = new Date().toISOString()

              await emitWorkflowTrace({
                traceId,
                campaignId,
                step,
                batchIndex,
                contactId: contact.contactId,
                phoneMasked,
                phase: 'meta_send_ok',
                ok: true,
                ms: metaMs,
                extra: { messageId },
              })

              sentCount++
              progress.bump({ sent: 1 })
              console.log(`✅ Sent to ${contact.phone}`)
            } else {
              // Extract error code and translate to Portuguese
              const errorCode = data.error?.code || 0
              const metaTitle = data.error?.error_user_title || data.error?.type || ''
              const metaMessage = data.error?.error_user_msg || data.error?.message || 'Unknown error'
              const metaDetails = data.error?.error_data?.details || ''
              const metaFbtraceId = data.error?.fbtrace_id || ''
              const metaSubcode = typeof data.error?.error_subcode === 'number' ? data.error.error_subcode : undefined
              const metaHref = data.error?.href || ''

              // Caso típico: template com HEADER de mídia usando `link` expirado/bloqueado.
              // A Meta tenta baixar do weblink e retorna 403 -> erro de mídia.
              // Estratégia: refresh pontual do template (Meta → local) e retry 1x.
              const activeTemplate0 = refreshedTemplateForBatch || templateForBatch
              const headerInfo0 = getTemplateHeaderMediaExampleLink(activeTemplate0)
              const isWeplink403 = isWeplinkForbiddenMediaError({
                errorCode,
                metaTitle,
                metaMessage,
                metaDetails,
              })

              const headerIsMedia = Boolean(
                headerInfo0.format && ['IMAGE', 'VIDEO', 'DOCUMENT', 'GIF'].includes(String(headerInfo0.format))
              )

              const canRetryWithRefresh = headerIsMedia && isWeplink403

              if (canRetryWithRefresh) {
                try {
                  await emitWorkflowTrace({
                    traceId,
                    campaignId,
                    step,
                    batchIndex,
                    contactId: contact.contactId,
                    phoneMasked,
                    phase: 'template_refresh_retry_start',
                    ok: true,
                    extra: {
                      errorCode,
                      headerFormat: headerInfo0.format,
                      examplePreview: headerInfo0.example || null,
                      exampleHost: headerInfo0.example ? getUrlHost(headerInfo0.example) : null,
                    },
                  })

                  const refreshed = await ensureRefreshedTemplateForBatch()
                  const activeTemplate1 = refreshed || refreshedTemplateForBatch || templateForBatch
                  const headerInfo1 = getTemplateHeaderMediaExampleLink(activeTemplate1)

                  // Só tenta retry se continuamos tendo um exemplo http(s) (para reduzir retries inúteis).
                  if (headerInfo1.example && isHttpUrl(headerInfo1.example)) {
                    const retryPayload = buildMetaTemplatePayload({
                      to: precheck.normalizedPhone,
                      templateName,
                      language: (activeTemplate1 as any).language || 'pt_BR',
                      parameterFormat:
                        (activeTemplate1 as any).parameter_format || (activeTemplate1 as any).parameterFormat || 'positional',
                      values: valuesForSend,
                      template: activeTemplate1 as any,
                      campaignId,
                    })

                    const retryStart = Date.now()
                    const controller2 = new AbortController()
                    const timeout2 = setTimeout(() => controller2.abort(), metaTimeoutMs)
                    let response2: Response
                    let data2: any
                    try {
                      response2 = await fetch(`https://graph.facebook.com/v24.0/${phoneNumberId}/messages`, {
                        method: 'POST',
                        headers: {
                          Authorization: `Bearer ${accessToken}`,
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(retryPayload),
                        signal: controller2.signal,
                      })
                      data2 = await response2.json()
                    } finally {
                      clearTimeout(timeout2)
                    }

                    const retryMs = Date.now() - retryStart
                    metaTimeMs += retryMs

                    if (response2.ok && data2?.messages?.[0]?.id) {
                      const messageId = data2.messages[0].id
                      const db0 = Date.now()
                      await updateContactStatus(
                        campaignId,
                        { contactId: contact.contactId, phone: contact.phone },
                        'sent',
                        { sendingAt: sendingAtIso, messageId, traceId }
                      )
                      dbTimeMs += Date.now() - db0
                      lastSentAtInBatch = new Date().toISOString()

                      await emitWorkflowTrace({
                        traceId,
                        campaignId,
                        step,
                        batchIndex,
                        contactId: contact.contactId,
                        phoneMasked,
                        phase: 'template_refresh_retry_ok',
                        ok: true,
                        ms: retryMs,
                        extra: { messageId },
                      })

                      sentCount++
                      progress.bump({ sent: 1 })
                      console.log(`✅ Sent (retry after template refresh) to ${contact.phone}`)
                      return
                    }

                    await emitWorkflowTrace({
                      traceId,
                      campaignId,
                      step,
                      batchIndex,
                      contactId: contact.contactId,
                      phoneMasked,
                      phase: 'template_refresh_retry_fail',
                      ok: false,
                      ms: retryMs,
                      extra: {
                        status: response2.status,
                        errorCode: data2?.error?.code,
                        errorType: data2?.error?.type,
                        fbtrace_id: data2?.error?.fbtrace_id,
                      },
                    })
                  } else {
                    await emitWorkflowTrace({
                      traceId,
                      campaignId,
                      step,
                      batchIndex,
                      contactId: contact.contactId,
                      phoneMasked,
                      phase: 'template_refresh_retry_skip',
                      ok: true,
                      extra: {
                        reason: 'no_http_example_after_refresh',
                        headerFormat: headerInfo1.format || null,
                        examplePreview: headerInfo1.example || null,
                        exampleHost: headerInfo1.example ? getUrlHost(headerInfo1.example) : null,
                      },
                    })
                  }
                } catch (e) {
                  console.warn('[Workflow] Retry após refresh do template falhou (seguindo com erro original):', e)
                }
              }

              // Fallback extra: re-hospedar a mídia do HEADER em um URL público, pois o weblink pode não ser
              // acessível para os servidores do WhatsApp, mesmo após refresh.
              if (headerIsMedia && isWeplink403) {
                try {
                  const activeTemplateForRehost = refreshedTemplateForBatch || templateForBatch
                  const headerInfo = getTemplateHeaderMediaExampleLink(activeTemplateForRehost)

                  await emitWorkflowTrace({
                    traceId,
                    campaignId,
                    step,
                    batchIndex,
                    contactId: contact.contactId,
                    phoneMasked,
                    phase: 'template_media_rehost_start',
                    ok: true,
                    extra: {
                      errorCode,
                      headerFormat: headerInfo.format || null,
                      sourceHost: headerInfo.example ? getUrlHost(headerInfo.example) : null,
                    },
                  })

                  const hosted = await ensureHostedHeaderMediaUrlForBatch(activeTemplateForRehost)
                  const hostedUrl = hosted?.url
                  if (hostedUrl) {
                    const patched = overrideTemplateHeaderExampleLink(activeTemplateForRehost, hostedUrl)

                    const retryPayload = buildMetaTemplatePayload({
                      to: precheck.normalizedPhone,
                      templateName,
                      language: (patched as any).language || 'pt_BR',
                      parameterFormat:
                        (patched as any).parameter_format || (patched as any).parameterFormat || 'positional',
                      values: valuesForSend,
                      template: patched as any,
                      campaignId,
                    })

                    const retryStart = Date.now()
                    const controller3 = new AbortController()
                    const timeout3 = setTimeout(() => controller3.abort(), metaTimeoutMs)
                    let response3: Response
                    let data3: any
                    try {
                      response3 = await fetch(`https://graph.facebook.com/v24.0/${phoneNumberId}/messages`, {
                        method: 'POST',
                        headers: {
                          Authorization: `Bearer ${accessToken}`,
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(retryPayload),
                        signal: controller3.signal,
                      })
                      data3 = await response3.json()
                    } finally {
                      clearTimeout(timeout3)
                    }

                    const retryMs = Date.now() - retryStart
                    metaTimeMs += retryMs

                    if (response3.ok && data3?.messages?.[0]?.id) {
                      const messageId = data3.messages[0].id
                      const db0 = Date.now()
                      await updateContactStatus(
                        campaignId,
                        { contactId: contact.contactId, phone: contact.phone },
                        'sent',
                        { sendingAt: sendingAtIso, messageId, traceId }
                      )
                      dbTimeMs += Date.now() - db0
                      lastSentAtInBatch = new Date().toISOString()

                      await emitWorkflowTrace({
                        traceId,
                        campaignId,
                        step,
                        batchIndex,
                        contactId: contact.contactId,
                        phoneMasked,
                        phase: 'template_media_rehost_ok',
                        ok: true,
                        ms: retryMs,
                        extra: {
                          messageId,
                          hostedHost: getUrlHost(hostedUrl),
                          hostedMode: hosted?.mode || null,
                          publicProbeStatus: hosted?.publicProbeStatus ?? null,
                          signedExpiresIn: hosted?.signedExpiresIn ?? null,
                        },
                      })

                      sentCount++
                      progress.bump({ sent: 1 })
                      console.log(`✅ Sent (retry after media rehost) to ${contact.phone}`)
                      return
                    }

                    await emitWorkflowTrace({
                      traceId,
                      campaignId,
                      step,
                      batchIndex,
                      contactId: contact.contactId,
                      phoneMasked,
                      phase: 'template_media_rehost_fail',
                      ok: false,
                      ms: retryMs,
                      extra: {
                        status: response3.status,
                        errorCode: data3?.error?.code,
                        errorType: data3?.error?.type,
                        fbtrace_id: data3?.error?.fbtrace_id,
                        hostedMode: hosted?.mode || null,
                        publicProbeStatus: hosted?.publicProbeStatus ?? null,
                        signedExpiresIn: hosted?.signedExpiresIn ?? null,
                      },
                    })
                  } else {
                    await emitWorkflowTrace({
                      traceId,
                      campaignId,
                      step,
                      batchIndex,
                      contactId: contact.contactId,
                      phoneMasked,
                      phase: 'template_media_rehost_skip',
                      ok: true,
                      extra: {
                        reason: 'rehost_failed_or_unavailable',
                      },
                    })
                  }
                } catch (e) {
                  console.warn('[Workflow] Rehost/Retry da mídia do template falhou (seguindo com erro original):', e)
                }
              }

              const translatedError = getUserFriendlyMessageForMetaError({
                code: errorCode,
                title: metaTitle,
                message: metaMessage,
                details: metaDetails,
              })

              const errorWithCode = `(#${errorCode}) ${translatedError}`

              // Feedback loop: 130429 = throughput estourado.
              // Reduzimos o alvo e aplicamos um cooldown para não continuar batendo no limite.
              if (adaptiveEnabled && errorCode === 130429 && !sawThroughput429) {
                // Set flag BEFORE awaiting, para evitar múltiplas reduções concorrentes no mesmo batch.
                sawThroughput429 = true
                const update = await recordThroughputExceeded(phoneNumberId)
                if (limiter) {
                  try {
                    limiter.updateRate(update.next.targetMps)
                  } catch {
                    // best-effort
                  }
                }
                await emitWorkflowTrace({
                  traceId,
                  campaignId,
                  step,
                  batchIndex,
                  contactId: contact.contactId,
                  phoneMasked,
                  phase: 'throttle_decrease',
                  ok: true,
                  extra: {
                    errorCode,
                    previousMps: update.previous.targetMps,
                    nextMps: update.next.targetMps,
                    cooldownUntil: update.next.cooldownUntil || null,
                  },
                })
              }

              await emitWorkflowTrace({
                traceId,
                campaignId,
                step,
                batchIndex,
                contactId: contact.contactId,
                phoneMasked,
                phase: 'meta_send_fail',
                ok: false,
                ms: metaMs,
                extra: {
                  status: response.status,
                  errorCode,
                  errorType: data.error?.type,
                  errorSubcode: data.error?.error_subcode,
                  fbtrace_id: data.error?.fbtrace_id,
                },
              })

              // Status será persistido em bulk ao final do batch.
              pushWriteOp({
                contact,
                status: 'failed',
                opts: {
                  sendingAt: sendingAtIso,
                  error: errorWithCode,
                  errorCode,
                  errorTitle: metaTitle || undefined,
                  errorDetails: metaDetails || metaMessage || undefined,
                  errorFbtraceId: metaFbtraceId || undefined,
                  errorSubcode: metaSubcode,
                  errorHref: metaHref || undefined,
                  traceId,
                },
              })

              // Auto-supressão agressiva (cross-campaign) — best-effort
              // Importante: não deve interromper o workflow; serve para proteger qualidade da conta.
              try {
                const result = await maybeAutoSuppressByFailure({
                  phone: contact.phone,
                  failureCode: errorCode,
                  failureTitle: metaTitle || null,
                  failureDetails: (metaDetails || metaMessage) ?? null,
                  failureFbtraceId: metaFbtraceId || null,
                  failureSubcode: typeof metaSubcode === 'number' ? metaSubcode : null,
                  failureHref: metaHref || null,
                  campaignId,
                })
                if (result.suppressed) {
                  await emitWorkflowTrace({
                    traceId,
                    campaignId,
                    step,
                    batchIndex,
                    contactId: contact.contactId,
                    phoneMasked,
                    phase: 'auto_suppressed',
                    ok: true,
                    extra: {
                      failureCode: errorCode,
                      recentCount: result.recentCount ?? null,
                      expiresAt: result.expiresAt ?? null,
                    },
                  })
                }
              } catch (e) {
                console.warn('[Workflow] Falha ao aplicar auto-supressão (best-effort):', e)
              }

              failedCount++
              progress.bump({ failed: 1 })
              console.log(`❌ Failed ${contact.phone}: ${errorWithCode}`)
            }

            // Delay mínimo opcional (deixa desligado por padrão).
            // Observação: com limiter ativo, esse delay não é necessário para throughput,
            // mas pode ser útil para aliviar CPU/logs em bursts.
            if (floorDelayMs > 0) {
              await new Promise(resolve => setTimeout(resolve, floorDelayMs))
            }

            } catch (error) {
              // Update contact status in Supabase
              const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido'
              // Neste ponto, contactId é obrigatório (validado no início)
              const phoneMasked = maskPhone(contact.phone)

              await emitWorkflowTrace({
                traceId,
                campaignId,
                step: `send-batch-${batchIndex}`,
                batchIndex,
                contactId: contact.contactId,
                phoneMasked,
                phase: 'contact_exception',
                ok: false,
                extra: { error: errorMsg },
              })

              pushWriteOp({
                contact,
                status: 'failed',
                opts: {
                  sendingAt: sendingAtIso,
                  error: errorMsg,
                  errorTitle: 'Contact exception',
                  errorDetails: errorMsg,
                  traceId,
                },
              })
              failedCount++
              progress.bump({ failed: 1 })
              console.error(`❌ Error sending to ${contact.phone}:`, error)
            }
          }

          // Pool bounded: N workers que puxam o próximo contato.
          // Default concurrency=1 mantém o comportamento atual (sequencial).
          let nextIndex = 0
          const workerCount = Math.min(concurrency, batch.length)

          const workers = Array.from({ length: workerCount }, () =>
            (async () => {
              while (true) {
                const idx = nextIndex
                nextIndex += 1
                if (idx >= batch.length) return
                await processContact(batch[idx])
              }
            })()
          )

          await Promise.allSettled(workers)


          // Garante que qualquer delta pendente seja publicado antes de finalizar o batch.
          try {
            await progress.flush()
          } catch {
            // best-effort
          }

          // =====================================================================
          // Persistência bulk dos resultados do batch (reduz DB overhead)
          // =====================================================================
          if (writeOps.length > 0) {
            const upsertRows = writeOps.map((op) => {
              const cid = String(op.contact.contactId)
              const base: any = {
                campaign_id: campaignId,
                contact_id: cid,
                phone: op.contact.phone,
                trace_id: traceId,
                status: op.status,
                sending_at: op.opts?.sendingAt || null,
              }

              // Reset campos (idempotente) conforme status final
              if (op.status === 'sent') {
                const now = new Date().toISOString()
                base.sent_at = now
                base.failed_at = null
                base.skipped_at = null
                base.message_id = op.opts?.messageId || null
                base.error = null
                base.skip_code = null
                base.skip_reason = null
                base.failure_code = null
                base.failure_reason = null
                base.failure_title = null
                base.failure_details = null
                base.failure_fbtrace_id = null
                base.failure_subcode = null
                base.failure_href = null
              } else if (op.status === 'skipped') {
                const now = new Date().toISOString()
                const skipReason = op.opts?.skipReason || op.opts?.error || null
                base.skipped_at = now
                base.sent_at = null
                base.failed_at = null
                base.message_id = null
                // CHECK constraint exige: failure_reason IS NOT NULL OR error IS NOT NULL quando status='skipped'
                base.error = skipReason
                base.skip_code = op.opts?.skipCode || null
                base.skip_reason = skipReason
                base.failure_code = null
                base.failure_reason = skipReason
                base.failure_title = null
                base.failure_details = null
                base.failure_fbtrace_id = null
                base.failure_subcode = null
                base.failure_href = null
              } else if (op.status === 'failed') {
                const now = new Date().toISOString()
                base.failed_at = now
                base.sent_at = null
                base.skipped_at = null
                base.message_id = null
                base.error = op.opts?.error || null

                const errorCode = op.opts?.errorCode
                if (typeof errorCode === 'number') base.failure_code = errorCode
                const title = op.opts?.errorTitle
                const details = op.opts?.errorDetails
                const fbtrace = op.opts?.errorFbtraceId
                const subcode = op.opts?.errorSubcode
                const href = op.opts?.errorHref

                if (typeof title === 'string') base.failure_title = normalizeMetaErrorTextForStorage(title, 200)
                if (typeof details === 'string') base.failure_details = normalizeMetaErrorTextForStorage(details, 800)
                if (typeof fbtrace === 'string') base.failure_fbtrace_id = normalizeMetaErrorTextForStorage(fbtrace, 200)
                if (typeof subcode === 'number') base.failure_subcode = subcode
                if (typeof href === 'string') base.failure_href = normalizeMetaErrorTextForStorage(href, 400)
                if (typeof op.opts?.error === 'string' && String(op.opts?.error).trim()) {
                  base.failure_reason = op.opts?.error
                }

                base.skip_code = null
                base.skip_reason = null
              }

              return base
            })

            const t0 = Date.now()
            const { error: bulkErr } = await supabase
              .from('campaign_contacts')
              .upsert(upsertRows, { onConflict: 'campaign_id,contact_id' })
            dbTimeMs += Date.now() - t0

            if (bulkErr) {
              console.warn('[Workflow] Bulk upsert campaign_contacts falhou; fallback por contato:', bulkErr)
              await emitWorkflowTrace({
                traceId,
                campaignId,
                step,
                batchIndex,
                phase: 'db_bulk_upsert_contacts',
                ok: false,
                ms: Date.now() - t0,
                extra: { error: bulkErr.message, rows: upsertRows.length },
              })

              // Fallback seguro (mais lento, mas preserva consistência)
              const fb0 = Date.now()
              for (const op of writeOps) {
                try {
                  await updateContactStatus(
                    campaignId,
                    { contactId: String(op.contact.contactId), phone: op.contact.phone },
                    op.status,
                    op.opts as any
                  )
                } catch {
                  // best-effort
                }
              }
              dbTimeMs += Date.now() - fb0
            } else {
              await emitWorkflowTrace({
                traceId,
                campaignId,
                step,
                batchIndex,
                phase: 'db_bulk_upsert_contacts',
                ok: true,
                ms: Date.now() - t0,
                extra: { rows: upsertRows.length },
              })
            }
          }

        } catch (err) {
          batchOk = false
          batchError = err instanceof Error ? err.message : String(err)
          throw err
        } finally {
          // Sinaliza fim do batch e faz flush final
          try {
            await progress.flush({ phase: 'batch_end' })
          } catch {
            // best-effort
          }
          try {
            await broadcastCampaignPhase(campaignId, {
              traceId,
              batchIndex,
              phase: 'batch_end',
            })
          } catch {
            // best-effort
          }
          try {
            await progress.stop()
          } catch {
            // best-effort
          }

          if (limiter) {
            try {
              limiter.stop()
            } catch {
              // best-effort
            }
          }

          // Se o batch foi estável (sem 130429), podemos aumentar um pouco o alvo.
          // Fazemos isso no finally para não perder a chance em batches com early return.
          if (adaptiveEnabled && !sawThroughput429) {
            try {
              const update = await recordStableBatch(phoneNumberId)
              if (update.changed) {
                await emitWorkflowTrace({
                  traceId,
                  campaignId,
                  step,
                  batchIndex,
                  phase: 'throttle_increase',
                  ok: true,
                  extra: {
                    previousMps: update.previous.targetMps,
                    nextMps: update.next.targetMps,
                  },
                })
              }
            } catch (e) {
              await emitWorkflowTrace({
                traceId,
                campaignId,
                step,
                batchIndex,
                phase: 'throttle_increase',
                ok: false,
                extra: {
                  error: e instanceof Error ? e.message : String(e),
                },
              })
            }
          }

          // Sempre emitimos batch_end (mesmo com erro) para fechar o passo no trace.
          await emitWorkflowTrace({
            traceId,
            campaignId,
            step,
            batchIndex,
            phase: 'batch_end',
            ok: batchOk,
            extra: {
              sentCount,
              failedCount,
              skippedCount,
              metaTimeMs,
              dbTimeMs,
              error: batchError,
              sawThroughput429,
            },
          })

          // Persistência best-effort para baselines (não pode quebrar o envio).
          try {
            const { error: batchMetricsErr } = await supabase
              .from('campaign_batch_metrics')
              .insert({
                campaign_id: campaignId,
                trace_id: traceId,
                batch_index: batchIndex,
                configured_batch_size: BATCH_SIZE,
                batch_size: batch.length,
                concurrency,
                adaptive_enabled: adaptiveEnabled,
                target_mps: targetMpsForBatch,
                floor_delay_ms: Number.isFinite(floorDelayMs) ? floorDelayMs : null,
                sent_count: sentCount,
                failed_count: failedCount,
                skipped_count: skippedCount,
                meta_requests: sentCount + failedCount,
                meta_time_ms: metaTimeMs,
                db_time_ms: dbTimeMs,
                saw_throughput_429: sawThroughput429,
                batch_ok: batchOk,
                error: batchError,
              })

            if (batchMetricsErr) throw batchMetricsErr
          } catch (e) {
            console.warn(
              '[metrics] failed to insert campaign_batch_metrics',
              JSON.stringify({
                campaignId,
                traceId,
                batchIndex,
                error: e instanceof Error ? e.message : String(e),
              })
            )

            // Também emitimos no trace para aparecer no monitor.
            try {
              await emitWorkflowTrace({
                traceId,
                campaignId,
                step,
                batchIndex,
                phase: 'metrics_batch_insert',
                ok: false,
                extra: { error: e instanceof Error ? e.message : String(e) },
              })
            } catch {
              // best-effort
            }
          }
        }

        // Update stats in Supabase (source of truth)
        // Supabase Realtime will propagate changes to frontend
        await timePhase(
          'db_update_campaign_counters',
          { traceId, campaignId, step, batchIndex },
          async () => {
            const t0 = Date.now()
            const campaign = await campaignDb.getById(campaignId)
            if (campaign) {
              // Importante: `campaigns.last_sent_at` também é mantido por trigger (0007)
              // baseado em `campaign_contacts.sent_at`. Como usamos bulk upsert, `sent_at`
              // pode ser persistido *depois* do último meta_send_ok.
              // Portanto, NUNCA devemos sobrescrever `last_sent_at` com um valor menor.
              const safeLastSentAt = (() => {
                const existing = (campaign as any).lastSentAt || null
                const candidate = lastSentAtInBatch || null
                if (!candidate) return existing
                if (!existing) return candidate
                const a = Date.parse(existing)
                const b = Date.parse(candidate)
                if (!Number.isFinite(a) || !Number.isFinite(b)) return existing || candidate
                return (b > a) ? candidate : existing
              })()

              await campaignDb.updateStatus(campaignId, {
                sent: campaign.sent + sentCount,
                failed: campaign.failed + failedCount,
                skipped: (campaign as any).skipped + skippedCount,
                // Início do disparo: quando o primeiro contato foi claimado como "sending".
                // Guardamos só se ainda não existe no registro.
                firstDispatchAt: (campaign as any).firstDispatchAt || firstDispatchAtInBatch || null,
                // Atualiza somente quando houve pelo menos 1 envio com sucesso neste batch.
                // Importante: isso mede o tempo de disparo (sent), não entrega.
                lastSentAt: safeLastSentAt,
              })
            }
            dbTimeMs += Date.now() - t0
          }
        )

        console.log(`📦 Batch ${batchIndex + 1}/${batches.length}: ${sentCount} sent, ${failedCount} failed, ${skippedCount} skipped`)
      })


      if (shouldStopWorkflow === 'cancelled') break
    }

    // Step 3: Mark campaign as completed
    if (shouldStopWorkflow === 'cancelled') {
      console.log(`🛑 Workflow stopped early for campaign ${campaignId} (CANCELLED). Skipping completion step.`)
      return
    }

    await context.run('complete-campaign', async () => {
      // Não sobrescrever cancelamento caso tenha ocorrido entre batches e este step.
      const current = await campaignDb.getById(campaignId)
      if (current?.status === CampaignStatus.CANCELLED) {
        console.log(`🛑 Campaign ${campaignId} is CANCELLED. Skipping completion update.`)
        return
      }

      const campaign = await campaignDb.getById(campaignId)

      let finalStatus = CampaignStatus.COMPLETED
      if (campaign && (campaign.failed + (campaign as any).skipped) === campaign.recipients && campaign.recipients > 0) {
        finalStatus = CampaignStatus.FAILED
      }

      await campaignDb.updateStatus(campaignId, {
        status: finalStatus,
        completedAt: new Date().toISOString()
      })

      console.log(`🎉 Campaign ${campaignId} completed!`)

      await emitWorkflowTrace({
        traceId,
        campaignId,
        step: 'complete-campaign',
        phase: 'complete',
        ok: true,
        extra: { finalStatus },
      })

      // Broadcast best-effort: força reconciliação imediata na UI.
      try {
        await broadcastCampaignPhase(campaignId, {
          traceId,
          batchIndex: -1,
          phase: 'complete',
        })
      } catch {
        // best-effort
      }

      // Persistência best-effort do "run" (baseline / evolução).
      try {
        // Usa a config que já foi carregada no prepare-batches
        const adaptiveConfig = cfgForBatching?.config || null
        const rawConcurrency = Number(adaptiveConfig?.sendConcurrency ?? process.env.WHATSAPP_SEND_CONCURRENCY ?? '1')
        const concurrency = Number.isFinite(rawConcurrency)
          ? Math.max(1, Math.min(50, Math.floor(rawConcurrency)))
          : 1
        const rawBatchSize = Number(adaptiveConfig?.batchSize ?? process.env.WHATSAPP_WORKFLOW_BATCH_SIZE ?? '10')
        const configuredBatchSize = Number.isFinite(rawBatchSize)
          ? Math.max(1, Math.min(200, Math.floor(rawBatchSize)))
          : 10

        // Agrega batches (se a tabela existir)
        let sumMetaTimeMs = 0
        let sumDbTimeMs = 0
        let sumMetaRequests = 0
        let sumProcessed = 0
        let any429 = false

        try {
          const { data: rows } = await supabase
            .from('campaign_batch_metrics')
            .select('meta_time_ms,db_time_ms,meta_requests,sent_count,failed_count,skipped_count,saw_throughput_429')
            .eq('campaign_id', campaignId)
            .eq('trace_id', traceId)

          for (const r of rows || []) {
            sumMetaTimeMs += Number(r.meta_time_ms || 0)
            sumDbTimeMs += Number(r.db_time_ms || 0)
            sumMetaRequests += Number(r.meta_requests || 0)
            const processed = Number(r.sent_count || 0) + Number(r.failed_count || 0) + Number(r.skipped_count || 0)
            sumProcessed += processed
            if (r.saw_throughput_429) any429 = true
          }
        } catch {
          // best-effort
        }

        const firstDispatchAt = (campaign as any)?.firstDispatchAt
        const lastSentAt = (campaign as any)?.lastSentAt

        const dispatchDurationMs = (firstDispatchAt && lastSentAt)
          ? Math.max(0, Date.parse(lastSentAt) - Date.parse(firstDispatchAt))
          : null

        const sentTotal = (campaign as any)?.sent ?? null
        const failedTotal = (campaign as any)?.failed ?? null
        const skippedTotal = (campaign as any)?.skipped ?? null

        const throughputMps = (dispatchDurationMs && dispatchDurationMs > 0 && typeof sentTotal === 'number')
          ? (sentTotal / (dispatchDurationMs / 1000))
          : null

        const metaAvgMs = sumMetaRequests > 0 ? (sumMetaTimeMs / sumMetaRequests) : null
        const dbAvgMs = sumProcessed > 0 ? (sumDbTimeMs / sumProcessed) : null

        const configSnapshot = {
          adaptive: adaptiveConfig
            ? {
              enabled: Boolean((adaptiveConfig as any).enabled),
              sendConcurrency: Number((adaptiveConfig as any).sendConcurrency),
              batchSize: Number((adaptiveConfig as any).batchSize),
              startMps: Number((adaptiveConfig as any).startMps),
              maxMps: Number((adaptiveConfig as any).maxMps),
              minMps: Number((adaptiveConfig as any).minMps),
              cooldownSec: Number((adaptiveConfig as any).cooldownSec),
              minIncreaseGapSec: Number((adaptiveConfig as any).minIncreaseGapSec),
              sendFloorDelayMs: Number((adaptiveConfig as any).sendFloorDelayMs),
            }
            : null,
          effective: {
            configuredBatchSize,
            concurrency,
          },
        }

        const configHash = hashConfig(configSnapshot)

        const { error: runMetricsErr } = await supabase
          .from('campaign_run_metrics')
          .upsert(
            {
              campaign_id: campaignId,
              trace_id: traceId,
              template_name: templateName,
              recipients: contacts?.length || null,
              sent_total: sentTotal,
              failed_total: failedTotal,
              skipped_total: skippedTotal,
              first_dispatch_at: firstDispatchAt || null,
              last_sent_at: lastSentAt || null,
              dispatch_duration_ms: dispatchDurationMs,
              throughput_mps: throughputMps,
              meta_avg_ms: metaAvgMs,
              db_avg_ms: dbAvgMs,
              saw_throughput_429: any429,
              config: configSnapshot,
              config_hash: configHash,
            },
            { onConflict: 'campaign_id,trace_id' }
          )

        if (runMetricsErr) throw runMetricsErr
      } catch (e) {
        console.warn(
          '[metrics] failed to upsert campaign_run_metrics',
          JSON.stringify({
            campaignId,
            traceId,
            error: e instanceof Error ? e.message : String(e),
          })
        )

        // Também emitimos no trace para aparecer no monitor.
        try {
          await emitWorkflowTrace({
            traceId,
            campaignId,
            step: 'complete-campaign',
            phase: 'metrics_run_upsert',
            ok: false,
            extra: { error: e instanceof Error ? e.message : String(e) },
          })
        } catch {
          // best-effort
        }
      }
    })
  },
  {
    // IMPORTANT:
    // Em preview/dev, NUNCA aponte baseUrl para o domínio de produção.
    // O baseUrl é usado pelo Upstash Workflow para chamar os próximos passos.
    // Se ele apontar para produção, o workflow começa no preview mas continua
    // executando passos em outro deployment (clássico: "turbo não muda nada" e
    // métricas não aparecem no lugar esperado).
    baseUrl: (() => {
      const vercelEnv = (process.env.VERCEL_ENV || '').trim() // 'production' | 'preview' | 'development'
      const deploymentUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : undefined
      const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
        : undefined
      const explicitAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || undefined

      if (vercelEnv && vercelEnv !== 'production') {
        return deploymentUrl
      }

      return explicitAppUrl || productionUrl || deploymentUrl
    })(),
    retries: 3,
  }
)

export async function POST(request: Request) {
  const signature =
    request.headers.get('upstash-signature') ||
    request.headers.get('Upstash-Signature') ||
    null
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const isLoopback =
    host.includes('localhost') ||
    host.includes('127.0.0.1') ||
    host.includes('::1')
  const baseUrl = host && !isLoopback ? `${proto}://${host}` : null
  if (baseUrl && !process.env.UPSTASH_WORKFLOW_URL) {
    process.env.UPSTASH_WORKFLOW_URL = baseUrl
  }
  if (baseUrl && !process.env.QSTASH_WORKFLOW_URL) {
    process.env.QSTASH_WORKFLOW_URL = baseUrl
  }
  const url = new URL(request.url)
  const shouldRewrite = baseUrl && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  const targetUrl = shouldRewrite
    ? `${baseUrl}${url.pathname}${url.search}`
    : request.url

  if (shouldRewrite) {
    request = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      duplex: 'half',
    } as RequestInit)
  }

  const response = await (workflowHandler as any).POST(request)
  return response
}
