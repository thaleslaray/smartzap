import { NextResponse } from 'next/server'
import { campaignDb, campaignContactDb } from '@/lib/supabase-db'
import { CreateCampaignSchema, validateBodyOrError } from '@/lib/api-validation'
import { Client as QStashClient } from '@upstash/qstash'
import { fetchWithTimeout, safeText } from '@/lib/server-http'

// Force dynamic - NO caching at all
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Registry in-memory (dev-only) for localhost scheduling.
// QStash cannot reach localhost, então usamos um setTimeout para disparar o dispatch.
// Observação: isso só funciona enquanto o processo do `next dev` estiver rodando.
const localScheduleRegistry: Map<string, NodeJS.Timeout> =
  (globalThis as any).__smartzapLocalScheduleRegistry
  || ((globalThis as any).__smartzapLocalScheduleRegistry = new Map<string, NodeJS.Timeout>())

/**
 * GET /api/campaigns
 * List all campaigns from Supabase (NO CACHE - always fresh)
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const limitParam = url.searchParams.get('limit')
    const offsetParam = url.searchParams.get('offset')
    const search = url.searchParams.get('search') || ''
    const status = url.searchParams.get('status') || ''
    const folderId = url.searchParams.get('folderId') || null  // null = todas, 'none' = sem pasta
    const tagIdsParam = url.searchParams.get('tagIds') || ''  // comma-separated
    const tagIds = tagIdsParam ? tagIdsParam.split(',').filter(Boolean) : null

    const wantsPaged =
      limitParam !== null ||
      offsetParam !== null ||
      search.length > 0 ||
      status.length > 0 ||
      folderId !== null ||
      tagIds !== null

    if (wantsPaged) {
      const limitRaw = Number(limitParam)
      const offsetRaw = Number(offsetParam)
      const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 20))
      const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0)

      const result = await campaignDb.list({
        limit,
        offset,
        search,
        status,
        folderId,
        tagIds,
      })

      return NextResponse.json(
        { ...result, limit, offset },
        {
          headers: {
            // Disable ALL caching
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
          }
        }
      )
    }

    const campaigns = await campaignDb.getAll()
    return NextResponse.json(campaigns, {
      headers: {
        // Disable ALL caching
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    })
  } catch (error) {
    console.error('Failed to fetch campaigns:', error)
    return NextResponse.json(
      { error: 'Falha ao buscar campanhas' },
      { status: 500 }
    )
  }
}

interface CreateCampaignBody {
  name: string
  templateName: string
  recipients: number
  scheduledAt?: string
  selectedContactIds?: string[]
  contacts?: { name: string; phone: string; email?: string | null; custom_fields?: Record<string, unknown> }[]
  // Meta API structure:
  // - header: text variables for templates with TEXT header
  // - headerMediaId: media ID for templates with MEDIA header (image/document/video)
  templateVariables?: { header: string[], headerMediaId?: string, body: string[], buttons?: Record<string, string> }
}

/**
 * POST /api/campaigns
 * Create a new campaign with contacts
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Validate input
    const validation = validateBodyOrError(CreateCampaignSchema, body)
    if (!validation.success) return validation.response

    const data = validation.data

    // Create campaign with template variables
    const campaign = await campaignDb.create({
      name: data.name,
      templateName: data.templateName,
      recipients: data.recipients,
      scheduledAt: data.scheduledAt,
      templateVariables: data.templateVariables,  // Now properly validated by Zod
      flowId: data.flowId,  // Flow/MiniApp reference (se o template usar Flow)
      flowName: data.flowName,
      folderId: data.folderId,  // Organização por pasta
    })

    // If contacts were provided, add them to campaign_contacts
    if (data.contacts && data.contacts.length > 0) {
      await campaignContactDb.addContacts(
        campaign.id,
        data.contacts.map((c) => ({
          contactId: c.contactId || c.id || (c as any).contact_id,
          phone: c.phone,
          name: c.name || '',
          email: c.email || null,
          // Snapshot Pattern: persist custom fields at campaign creation time
          custom_fields: c.custom_fields || {},
        }))
      )
    }

    // If scheduled, enqueue a one-shot QStash message to trigger dispatch at the right time.
    if (data.scheduledAt) {
      const scheduledMs = new Date(data.scheduledAt).getTime()
      const nowMs = Date.now()

      const explicitAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || null
      const vercelEnv = (process.env.VERCEL_ENV || '').trim()
      const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
        : null
      const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : null
      const requestOrigin = (() => {
        const proto = request.headers.get('x-forwarded-proto') || 'https'
        const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
        if (!host) return null
        return `${proto}://${host}`
      })()

      // Preview/dev: prefer origin to avoid cross-deploy scheduling.
      const baseUrl = (vercelEnv === 'production')
        ? (explicitAppUrl || productionUrl || vercelUrl || requestOrigin || 'http://localhost:3000')
        : (requestOrigin || vercelUrl || explicitAppUrl || productionUrl || 'http://localhost:3000')

      const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')

      if (isLocalhost) {
        // QStash cannot reach localhost.
        // DEV fallback: schedule an in-process dispatch so scheduling works locally.
        const scheduledAtIso = new Date(data.scheduledAt).toISOString()
        const dedupeSafeIso = scheduledAtIso.replace(/:/g, '_')
        const delayMs = Number.isFinite(scheduledMs) ? Math.max(0, scheduledMs - nowMs) : NaN

        console.warn('[Campaigns] scheduledAt set, but localhost detected; using local scheduler (dev-only).')

        if (process.env.NODE_ENV === 'development' && Number.isFinite(delayMs)) {
          const key = `schedule:${campaign.id}:${scheduledAtIso}`
          const existing = localScheduleRegistry.get(key)
          if (existing) clearTimeout(existing)

          console.info('[Campaigns][LocalScheduler] armed', {
            campaignId: campaign.id,
            scheduledAt: scheduledAtIso,
            delayMs,
          })

          const t = setTimeout(async () => {
            try {
              console.info('[Campaigns][LocalScheduler] firing', {
                campaignId: campaign.id,
                scheduledAt: scheduledAtIso,
              })
              const resp = await fetchWithTimeout(`${baseUrl}/api/campaign/dispatch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  campaignId: campaign.id,
                  templateName: campaign.templateName,
                  trigger: 'schedule',
                  scheduledAt: scheduledAtIso,
                }),
                timeoutMs: 30000,
              })

              if (!resp.ok) {
                const text = (await safeText(resp)) || ''
                console.warn('[Campaigns][LocalScheduler] dispatch failed:', resp.status, text)
              }
            } catch (e) {
              console.warn('[Campaigns][LocalScheduler] dispatch failed (exception):', e)
            } finally {
              // Clean up key after execution attempt
              localScheduleRegistry.delete(key)
            }
          }, delayMs)

          localScheduleRegistry.set(key, t)
        } else {
          // Keep campaign scheduled in DB, but do not enqueue.
          console.warn('[Campaigns] Local scheduler inactive (NODE_ENV != development) or invalid scheduledAt; campaign will remain SCHEDULED.')
        }
      } else if (!process.env.QSTASH_TOKEN) {
        console.warn('[Campaigns] scheduledAt set, but QSTASH_TOKEN not configured; skipping QStash enqueue.')
      } else if (!Number.isFinite(scheduledMs)) {
        console.warn('[Campaigns] scheduledAt set, but invalid datetime; skipping QStash enqueue:', data.scheduledAt)
      } else {
        const delaySeconds = Math.max(0, Math.floor((scheduledMs - nowMs) / 1000))
        const scheduledAtIso = new Date(data.scheduledAt).toISOString()
        const dedupeSafeIso = scheduledAtIso.replace(/:/g, '_')

        try {
          const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN })
          const res = await qstash.publishJSON({
            url: `${baseUrl}/api/campaign/dispatch`,
            body: {
              campaignId: campaign.id,
              templateName: campaign.templateName,
              trigger: 'schedule',
              scheduledAt: scheduledAtIso,
            },
            // One-shot schedule
            delay: delaySeconds,
            retries: 3,
            // Dedup per campaign+scheduled time (best-effort)
            deduplicationId: `schedule-${campaign.id}-${dedupeSafeIso}`,
          })

          await campaignDb.updateStatus(campaign.id, {
            qstashScheduleMessageId: res.messageId,
            qstashScheduleEnqueuedAt: new Date().toISOString(),
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error('[Campaigns] QStash enqueue failed:', message)
          return NextResponse.json(
            {
              error: 'Falha ao agendar campanha (QStash)',
              details: message,
            },
            { status: 502 }
          )
        }
      }
    }

    return NextResponse.json(campaign, { status: 201 })
  } catch (error) {
    console.error('Failed to create campaign:', error)
    return NextResponse.json(
      { error: 'Falha ao criar campanha' },
      { status: 500 }
    )
  }
}
