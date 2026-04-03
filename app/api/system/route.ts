import { NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { supabase, getSupabaseAdmin } from '@/lib/supabase'
import { fetchWithTimeout } from '@/lib/server-http'

/**
 * GET /api/system
 * 
 * Consolidated endpoint that returns:
 * - Health status of all services
 * - Usage metrics for Vercel, Supabase, WhatsApp, QStash
 * - Vercel deployment info
 * 
 * This replaces 3 separate API calls with 1, reducing function invocations.
 */

// === TYPES ===

interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  services: {
    database: { status: 'ok' | 'error' | 'not_configured'; latency?: number; message?: string }
    qstash: { status: 'ok' | 'error' | 'not_configured'; message?: string }
    whatsapp: { status: 'ok' | 'error' | 'not_configured'; source?: string; phoneNumber?: string; message?: string }
  }
}

interface UsageData {
  vercel: {
    plan: 'hobby' | 'pro' | 'enterprise' | 'unknown'
    functionInvocations: number
    functionLimit: number
    functionPercentage: number
    edgeRequests: number
    edgeLimit: number
    edgePercentage: number
    buildMinutes: number
    buildLimit: number
    buildPercentage: number
    percentage: number
    status: 'ok' | 'warning' | 'critical'
  }
  database: {
    plan: 'free' | 'pro' | 'team' | 'enterprise' | 'unknown'
    storageMB: number
    limitMB: number
    bandwidthMB: number
    bandwidthLimitMB: number
    percentage: number
    rowsRead: number
    rowsWritten: number
    status: 'ok' | 'warning' | 'critical'
  }
  whatsapp: {
    messagesSent: number
    tier: string
    tierLimit: number
    percentage: number
    quality: string
    status: 'ok' | 'warning' | 'critical'
  }
  qstash: {
    messagesMonth: number
    messagesLimit: number
    percentage: number
    cost: number
    status: 'ok' | 'warning' | 'critical'
  }
}

interface VercelInfo {
  dashboardUrl: string | null
  storesUrl: string | null
  env: string
}

interface SystemResponse {
  health: HealthStatus
  usage: UsageData
  vercel: VercelInfo
  timestamp: string
}

// === HELPERS ===

function getStatus(percentage: number): 'ok' | 'warning' | 'critical' {
  if (percentage >= 90) return 'critical'
  if (percentage >= 70) return 'warning'
  return 'ok'
}

function buildVercelDashboardUrl(): string | null {
  const vercelUrl = process.env.VERCEL_URL
  if (!vercelUrl) return null

  const cleanUrl = vercelUrl.replace('.vercel.app', '')
  const scopeMatch = cleanUrl.match(/-([a-z0-9]+-projects)$/) || cleanUrl.match(/-([a-z0-9-]+)$/)
  if (!scopeMatch) return null

  const scope = scopeMatch[1]
  const beforeScope = cleanUrl.replace(`-${scope}`, '')
  const lastHyphen = beforeScope.lastIndexOf('-')
  if (lastHyphen === -1) return null

  const possibleHash = beforeScope.substring(lastHyphen + 1)
  const projectName = beforeScope.substring(0, lastHyphen)

  if (!/^[a-z0-9]{7,12}$/.test(possibleHash)) return null

  return `https://vercel.com/${scope}/${projectName}`
}

// === MAIN HANDLER ===

export async function GET() {
  const startTime = Date.now()

  // Initialize response structure
  const response: SystemResponse = {
    health: {
      overall: 'healthy',
      services: {
        database: { status: 'not_configured' },
        qstash: { status: 'not_configured' },
        whatsapp: { status: 'not_configured' },
      },
    },
    usage: {
      vercel: {
        plan: 'unknown',
        functionInvocations: 0,
        functionLimit: 100000,
        functionPercentage: 0,
        edgeRequests: 0,
        edgeLimit: 1000000,
        edgePercentage: 0,
        buildMinutes: 0,
        buildLimit: 6000,
        buildPercentage: 0,
        percentage: 0,
        status: 'ok',
      },
      database: { plan: 'unknown', storageMB: 0, limitMB: 500, bandwidthMB: 0, bandwidthLimitMB: 5000, percentage: 0, rowsRead: 0, rowsWritten: 0, status: 'ok' },
      whatsapp: { messagesSent: 0, tier: 'STANDARD', tierLimit: 100000, percentage: 0, quality: 'GREEN', status: 'ok' },
      qstash: { messagesMonth: 0, messagesLimit: 500, percentage: 0, cost: 0, status: 'ok' },
    },
    vercel: {
      dashboardUrl: buildVercelDashboardUrl(),
      storesUrl: null,
      env: process.env.VERCEL_ENV || 'development',
    },
    timestamp: new Date().toISOString(),
  }

  // Build stores URL
  if (response.vercel.dashboardUrl) {
    response.vercel.storesUrl = `${response.vercel.dashboardUrl}/stores`
  }

  // === PARALLEL CHECKS ===
  await Promise.all([
    // 1. DATABASE (Supabase)
    (async () => {
      const hasPublishableKey =
        !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && hasPublishableKey) {
        try {
          const start = Date.now()

          const supabaseAdmin = getSupabaseAdmin()
          if (!supabaseAdmin) throw new Error('Missing Supabase credentials')

          const { error } = await supabaseAdmin.from('campaigns').select('id').limit(1)
          if (error && !error.message.includes('No rows')) throw error

          response.health.services.database = { status: 'ok', latency: Date.now() - start }

          // Estimate database size from row counts
          let actualSizeMB = 0
          try {
            const { data: sizeData } = await supabaseAdmin.rpc('get_db_size')
            if (sizeData) {
              actualSizeMB = Math.round((sizeData / (1024 * 1024)) * 100) / 100
            } else {
              throw new Error('RPC not found')
            }
          } catch {
            const [
              { count: campaignsCount },
              { count: contactsCount },
              { count: campaignContactsCount }
            ] = await Promise.all([
              supabaseAdmin.from('campaigns').select('*', { count: 'exact', head: true }),
              supabaseAdmin.from('contacts').select('*', { count: 'exact', head: true }),
              supabaseAdmin.from('campaign_contacts').select('*', { count: 'exact', head: true })
            ])

            const totalRows = (campaignsCount || 0) + (contactsCount || 0) + (campaignContactsCount || 0)
            actualSizeMB = Math.round((totalRows * 1024) / (1024 * 1024) * 100) / 100
          }

          response.usage.database.storageMB = actualSizeMB

          // Detect plan via Supabase Management API if token available
          const supabaseToken = process.env.SUPABASE_ACCESS_TOKEN
          const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
          const projectRef = projectUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]

          if (supabaseToken && projectRef) {
            try {
              const projectsRes = await fetchWithTimeout('https://api.supabase.com/v1/projects', {
                headers: { 'Authorization': `Bearer ${supabaseToken}` },
                timeoutMs: 3500,
              })

              if (projectsRes.ok) {
                const projects = await projectsRes.json()
                const project = projects.find((p: any) => p.ref === projectRef)

                if (project?.organization_id) {
                  const orgRes = await fetchWithTimeout(`https://api.supabase.com/v1/organizations/${project.organization_id}`, {
                    headers: { 'Authorization': `Bearer ${supabaseToken}` },
                    timeoutMs: 3500,
                  })

                  if (orgRes.ok) {
                    const org = await orgRes.json()
                    const orgPlan = org.plan?.toLowerCase() || 'free'

                    if (orgPlan === 'enterprise') {
                      response.usage.database.plan = 'enterprise'
                      response.usage.database.limitMB = 1000000
                    } else if (orgPlan === 'team') {
                      response.usage.database.plan = 'team'
                      response.usage.database.limitMB = 8000
                    } else if (orgPlan === 'pro') {
                      response.usage.database.plan = 'pro'
                      response.usage.database.limitMB = 8000
                    } else {
                      response.usage.database.plan = 'free'
                      response.usage.database.limitMB = 500
                    }
                  }
                }
              }
            } catch (e) {
              console.error('Failed to get Supabase plan:', e)
              response.usage.database.plan = 'unknown'
              response.usage.database.limitMB = 500
            }
          } else {
            if (actualSizeMB > 400) {
              response.usage.database.plan = 'pro'
              response.usage.database.limitMB = 8000
              response.usage.database.bandwidthLimitMB = 250000
            } else {
              response.usage.database.plan = 'free'
              response.usage.database.limitMB = 500
              response.usage.database.bandwidthLimitMB = 5000
            }
          }

          // Set bandwidth limit based on detected plan
          if (response.usage.database.plan === 'pro' || response.usage.database.plan === 'team') {
            response.usage.database.bandwidthLimitMB = 250000
          } else if (response.usage.database.plan === 'enterprise') {
            response.usage.database.bandwidthLimitMB = 1000000
          } else {
            response.usage.database.bandwidthLimitMB = 5000
          }

          // Get WhatsApp messages sent
          // Observação importante:
          // O “tier” do WhatsApp (whatsapp_business_manager_messaging_limit) é uma janela móvel
          // de ~24h e é baseado em destinatários/contatos únicos, não em “mês” ou “30 dias”.
          // Se compararmos 30 dias de envios com um limite /24h, a % fica “travada” e confusa.
          //
          // Aqui usamos campaign_contacts como proxy de “destinatários únicos enviados nas últimas 24h”.
          // Preferimos contact_id (quando existe) e fazemos fallback para phone.
          try {
            const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            const uniqueRecipients = new Set<string>()

            const pageSize = 5000
            const maxRows = 200000 // safety guard

            for (let offset = 0; offset < maxRows; offset += pageSize) {
              const { data: rows, error: rowsError } = await supabase
                .from('campaign_contacts')
                .select('contact_id,phone')
                .gte('sent_at', cutoffIso)
                .not('sent_at', 'is', null)
                .range(offset, offset + pageSize - 1)

              if (rowsError) throw rowsError
              if (!rows || rows.length === 0) break

              for (const r of rows as any[]) {
                const key = String(r?.contact_id || r?.phone || '').trim()
                if (key) uniqueRecipients.add(key)
              }

              if (rows.length < pageSize) break
            }

            response.usage.whatsapp.messagesSent = uniqueRecipients.size
          } catch (e) {
            console.warn('[System] Falha ao calcular destinatários únicos 24h (best-effort):', e)
            response.usage.whatsapp.messagesSent = 0
          }
        } catch (error) {
          response.health.services.database = { status: 'error', message: (error as Error).message }
          response.health.overall = 'unhealthy'
        }
      } else {
        response.health.services.database = { status: 'not_configured', message: 'Supabase credentials not set' }
        response.health.overall = 'unhealthy'
      }
    })(),

    // 2. QSTASH (with usage stats)
    (async () => {
      if (process.env.QSTASH_TOKEN) {
        response.health.services.qstash = { status: 'ok', message: 'Token configured' }

        // Tentar env vars primeiro, depois banco de dados
        let upstashEmail = process.env.UPSTASH_EMAIL
        let upstashApiKey = process.env.UPSTASH_API_KEY

        // Se não tiver env var, buscar do banco
        if (!upstashEmail || !upstashApiKey) {
          try {
            const { data: settingsData } = await supabase
              .from('settings')
              .select('key, value')
              .in('key', ['upstashEmail', 'upstashApiKey'])

            if (settingsData) {
              const settingsMap = new Map(settingsData.map(s => [s.key, s.value]))
              upstashEmail = upstashEmail || (settingsMap.get('upstashEmail') as string) || ''
              upstashApiKey = upstashApiKey || (settingsMap.get('upstashApiKey') as string) || ''
            }
          } catch {
            // Ignore errors fetching from DB
          }
        }

        if (upstashEmail && upstashApiKey) {
          try {
            const auth = Buffer.from(`${upstashEmail}:${upstashApiKey}`).toString('base64')
            const statsRes = await fetchWithTimeout('https://api.upstash.com/v2/qstash/stats', {
              headers: { 'Authorization': `Basic ${auth}` },
              timeoutMs: 3500,
            })

            if (statsRes.ok) {
              const stats = await statsRes.json()
              const monthlyMessages = stats.daily_requests?.reduce((sum: number, day: any) => sum + (day.y || 0), 0) || 0
              const monthlyBilling = stats.total_monthly_billing || 0
              const isPayAsYouGo = monthlyBilling > 0 || monthlyMessages > 500

              response.usage.qstash = {
                messagesMonth: monthlyMessages,
                messagesLimit: isPayAsYouGo ? 0 : 500,
                percentage: isPayAsYouGo ? 0 : Math.round((monthlyMessages / 500) * 100 * 10) / 10,
                cost: monthlyBilling,
                status: isPayAsYouGo ? 'ok' : getStatus(Math.round((monthlyMessages / 500) * 100)) as 'ok' | 'warning' | 'critical'
              }
            }
          } catch (e) {
            console.error('Failed to get QStash stats:', e)
          }
        }
      } else {
        response.health.services.qstash = { status: 'not_configured', message: 'QSTASH_TOKEN not set' }
        response.health.overall = 'degraded'
      }
    })(),

    // 3. WHATSAPP
    (async () => {
      try {
        const credentials = await getWhatsAppCredentials()

        if (credentials) {
          const testUrl = `https://graph.facebook.com/v24.0/${credentials.phoneNumberId}?fields=display_phone_number,whatsapp_business_manager_messaging_limit,quality_score`
          const res = await fetchWithTimeout(testUrl, {
            headers: { 'Authorization': `Bearer ${credentials.accessToken}` },
            timeoutMs: 3500,
          })

          if (res.ok) {
            const data = await res.json()
            response.health.services.whatsapp = {
              status: 'ok',
              source: 'db',
              phoneNumber: data.display_phone_number,
            }

            const rawTier = data.whatsapp_business_manager_messaging_limit
            if (typeof rawTier === 'string') {
              response.usage.whatsapp.tier = rawTier
            } else if (rawTier && typeof rawTier === 'object') {
              response.usage.whatsapp.tier = rawTier.current_limit || rawTier.tier || 'TIER_250'
            }

            response.usage.whatsapp.quality = data.quality_score?.score?.toUpperCase() || 'GREEN'

            const tierLimits: Record<string, number> = {
              'TIER_250': 250, 'TIER_1K': 1000, 'TIER_2K': 2000,
              'TIER_10K': 10000, 'TIER_100K': 100000, 'TIER_UNLIMITED': 1000000, 'STANDARD': 100000,
            }
            response.usage.whatsapp.tierLimit = tierLimits[response.usage.whatsapp.tier] || 250
          } else {
            const error = await res.json()
            response.health.services.whatsapp = { status: 'error', source: 'db', message: error.error?.message || 'Token invalid' }
            response.health.overall = 'degraded'
          }
        } else {
          response.health.services.whatsapp = { status: 'not_configured', source: 'none', message: 'Not configured' }
        }
      } catch (error) {
        response.health.services.whatsapp = { status: 'error', message: (error as Error).message }
        response.health.overall = 'degraded'
      }
    })(),

    // 4. VERCEL USAGE
    (async () => {
      const vercelToken = process.env.VERCEL_API_TOKEN || process.env.VERCEL_TOKEN

      if (vercelToken) {
        try {
          const teamId = process.env.VERCEL_TEAM_ID || ''
          const now = new Date()
          const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
          const to = now.toISOString()

          const userRes = await fetchWithTimeout('https://api.vercel.com/v2/user', {
            headers: { 'Authorization': `Bearer ${vercelToken}` },
            timeoutMs: 3500,
          })

          if (userRes.ok) {
            const userData = await userRes.json()
            const defaultTeamId = userData.user?.defaultTeamId

            if (defaultTeamId) {
              try {
                const teamRes = await fetchWithTimeout(`https://api.vercel.com/v2/teams/${defaultTeamId}`, {
                  headers: { 'Authorization': `Bearer ${vercelToken}` },
                  timeoutMs: 3500,
                })

                if (teamRes.ok) {
                  const teamData = await teamRes.json()
                  const billingPlan = teamData.billing?.plan

                  if (billingPlan === 'enterprise' || billingPlan === 'ent') {
                    response.usage.vercel.plan = 'enterprise'
                    response.usage.vercel.functionLimit = 1000000000
                    response.usage.vercel.edgeLimit = 1000000000
                    response.usage.vercel.buildLimit = 24000
                  } else if (billingPlan === 'pro') {
                    response.usage.vercel.plan = 'pro'
                    response.usage.vercel.functionLimit = 1000000
                    response.usage.vercel.edgeLimit = 10000000
                    response.usage.vercel.buildLimit = 24000
                  } else {
                    response.usage.vercel.plan = 'hobby'
                    response.usage.vercel.functionLimit = 100000
                    response.usage.vercel.edgeLimit = 1000000
                    response.usage.vercel.buildLimit = 6000
                  }
                }
              } catch (e) {
                console.error('Failed to fetch team info:', e)
              }
            }
          }

          const baseUrl = `https://api.vercel.com/v2/usage?teamId=${teamId}&from=${from}&to=${to}`

          const [requestsRes, buildsRes] = await Promise.all([
            fetchWithTimeout(`${baseUrl}&type=requests`, {
              headers: { 'Authorization': `Bearer ${vercelToken}` },
              timeoutMs: 3500,
            }),
            fetchWithTimeout(`${baseUrl}&type=builds`, {
              headers: { 'Authorization': `Bearer ${vercelToken}` },
              timeoutMs: 3500,
            }),
          ])

          if (requestsRes.ok) {
            const data = await requestsRes.json()
            if (data.data && Array.isArray(data.data)) {
              for (const day of data.data) {
                response.usage.vercel.functionInvocations += (day.function_invocation_successful_count || 0) +
                  (day.function_invocation_error_count || 0) + (day.function_invocation_throttle_count || 0) +
                  (day.function_invocation_timeout_count || 0)
                response.usage.vercel.edgeRequests += (day.request_hit_count || 0) + (day.request_miss_count || 0)
              }
            }
          }

          if (buildsRes.ok) {
            const data = await buildsRes.json()
            if (data.data && Array.isArray(data.data)) {
              for (const day of data.data) {
                response.usage.vercel.buildMinutes += (day.build_build_seconds || 0)
              }
            }
            response.usage.vercel.buildMinutes = Math.round(response.usage.vercel.buildMinutes / 60)
          }

          response.usage.vercel.functionPercentage = Math.round((response.usage.vercel.functionInvocations / response.usage.vercel.functionLimit) * 100 * 10) / 10
          response.usage.vercel.edgePercentage = Math.round((response.usage.vercel.edgeRequests / response.usage.vercel.edgeLimit) * 100 * 10) / 10
          response.usage.vercel.buildPercentage = Math.round((response.usage.vercel.buildMinutes / response.usage.vercel.buildLimit) * 100 * 10) / 10
          response.usage.vercel.percentage = Math.max(
            response.usage.vercel.functionPercentage,
            response.usage.vercel.edgePercentage,
            response.usage.vercel.buildPercentage
          )
          response.usage.vercel.status = getStatus(response.usage.vercel.percentage)
        } catch (error) {
          console.error('Failed to get Vercel usage:', error)
        }
      }
    })(),
  ])

  // === POST-CALCULATIONS ===
  if (response.usage.whatsapp.tierLimit > 0) {
    response.usage.whatsapp.percentage = Math.round((response.usage.whatsapp.messagesSent / response.usage.whatsapp.tierLimit) * 100 * 10) / 10
    response.usage.whatsapp.status = getStatus(response.usage.whatsapp.percentage)
  }

  if (response.usage.database.limitMB > 0) {
    const rawPct = (response.usage.database.storageMB / response.usage.database.limitMB) * 100
    response.usage.database.percentage = rawPct > 0 && rawPct < 0.1 ? 0.1 : Math.round(rawPct * 10) / 10
    response.usage.database.status = getStatus(response.usage.database.percentage)
  }

  // Recalculate overall health
  const statuses = Object.values(response.health.services).map(s => s.status)
  if (statuses.every(s => s === 'ok')) {
    response.health.overall = 'healthy'
  } else if (statuses.some(s => s === 'error') || statuses.filter(s => s === 'not_configured').length > 1) {
    response.health.overall = 'unhealthy'
  } else {
    response.health.overall = 'degraded'
  }

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      'X-Response-Time': `${Date.now() - startTime}ms`,
    },
  })
}
