import { NextResponse } from 'next/server'
import { supabase, getSupabaseAdmin } from '@/lib/supabase'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { fetchWithTimeout } from '@/lib/server-http'

interface UsageData {
  vercel: {
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
    storageMB: number
    limitMB: number
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

function getStatus(percentage: number): 'ok' | 'warning' | 'critical' {
  if (percentage >= 90) return 'critical'
  if (percentage >= 70) return 'warning'
  return 'ok'
}

export async function GET() {
  const usage: UsageData = {
    vercel: {
      functionInvocations: 0,
      functionLimit: 1000000,
      functionPercentage: 0,
      edgeRequests: 0,
      edgeLimit: 10000000,
      edgePercentage: 0,
      buildMinutes: 0,
      buildLimit: 6000,
      buildPercentage: 0,
      percentage: 0,
      status: 'ok',
    },
    database: { storageMB: 0, limitMB: 500, percentage: 0, rowsRead: 0, rowsWritten: 0, status: 'ok' },
    whatsapp: { messagesSent: 0, tier: 'STANDARD', tierLimit: 100000, percentage: 0, quality: 'GREEN', status: 'ok' },
    qstash: { messagesMonth: 0, messagesLimit: 500, percentage: 0, cost: 0, status: 'ok' },
  }

  // 1. Database Usage (Supabase)
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAccessToken = process.env.SUPABASE_ACCESS_TOKEN

    // Extrair project ref da URL (ex: https://abc123xyz.supabase.co -> abc123xyz)
    const projectRef = supabaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]

    if (supabaseAccessToken && projectRef) {
      // Usar Management API para dados reais de uso
      const usageResponse = await fetchWithTimeout(
        `https://api.supabase.com/v1/projects/${projectRef}/usage?metric=DISK_SIZE`,
        {
          headers: { 'Authorization': `Bearer ${supabaseAccessToken}` },
          timeoutMs: 5000,
        }
      )

      if (usageResponse.ok) {
        const usageData = await usageResponse.json()
        // A API retorna usage em bytes, converter para MB
        const diskBytes = usageData?.disk_size?.usage || usageData?.usage || 0
        usage.database.storageMB = Math.round((diskBytes / (1024 * 1024)) * 100) / 100
        usage.database.percentage = Math.round((usage.database.storageMB / usage.database.limitMB) * 100 * 10) / 10
        usage.database.status = getStatus(usage.database.percentage)
      } else {
        // Fallback: estimar baseado em contagem de rows
        throw new Error('Management API failed, using fallback')
      }
    } else {
      // Fallback: estimar baseado em contagem de rows (sem PAT configurado)
      const supabaseAdmin = getSupabaseAdmin()
      if (!supabaseAdmin) throw new Error('Missing Supabase credentials in Usage API')

      const [
        { count: campaignsCount },
        { count: contactsCount },
        { count: campaignContactsCount },
      ] = await Promise.all([
        supabaseAdmin.from('campaigns').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('contacts').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('campaign_contacts').select('*', { count: 'exact', head: true }),
      ])

      const totalRows =
        (campaignsCount || 0) +
        (contactsCount || 0) +
        (campaignContactsCount || 0)

      // Estimativa: ~1KB por row (valor aproximado)
      const estimatedStorageMB = Math.round((totalRows * 1024) / (1024 * 1024) * 100) / 100

      usage.database.storageMB = estimatedStorageMB
      usage.database.percentage = Math.round((usage.database.storageMB / usage.database.limitMB) * 100 * 10) / 10
      usage.database.status = getStatus(usage.database.percentage)
    }
  } catch (e) {
    console.error('Failed to get Database usage:', e)
  }

  // 2. QStash Usage
  try {
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

    if (upstashEmail && upstashApiKey && process.env.QSTASH_TOKEN) {
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

        usage.qstash = {
          messagesMonth: monthlyMessages,
          messagesLimit: isPayAsYouGo ? 0 : 500,
          percentage: isPayAsYouGo ? 0 : Math.round((monthlyMessages / 500) * 100 * 10) / 10,
          cost: monthlyBilling,
          status: isPayAsYouGo ? 'ok' : getStatus(Math.round((monthlyMessages / 500) * 100)) as 'ok' | 'warning' | 'critical'
        }
      }
    }
  } catch (e) {
    console.error('Failed to get QStash usage:', e)
  }

  // 3. WhatsApp Usage
  try {
    // IMPORTANTE: o tier do WhatsApp é uma janela móvel de ~24h e é baseado em destinatários únicos.
    // Para não ficar “travado” acima de 100%, usamos campaign_contacts (sent_at) nas últimas 24h.
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

    usage.whatsapp.messagesSent = uniqueRecipients.size

    const credentials = await getWhatsAppCredentials()
    if (credentials) {
      try {
        const [tierResponse, qualityResponse] = await Promise.all([
          fetchWithTimeout(
            `https://graph.facebook.com/v24.0/${credentials.phoneNumberId}?fields=whatsapp_business_manager_messaging_limit`,
            { headers: { 'Authorization': `Bearer ${credentials.accessToken}` }, timeoutMs: 3500 }
          ),
          fetchWithTimeout(
            `https://graph.facebook.com/v24.0/${credentials.phoneNumberId}?fields=quality_score`,
            { headers: { 'Authorization': `Bearer ${credentials.accessToken}` }, timeoutMs: 3500 }
          )
        ])

        if (tierResponse.ok) {
          const tierData = await tierResponse.json()
          const rawTier = tierData.whatsapp_business_manager_messaging_limit
          if (typeof rawTier === 'string') {
            usage.whatsapp.tier = rawTier
          } else if (rawTier && typeof rawTier === 'object') {
            usage.whatsapp.tier = rawTier.current_limit || rawTier.tier || 'TIER_250'
          }
        }

        if (qualityResponse.ok) {
          const qualityData = await qualityResponse.json()
          usage.whatsapp.quality = qualityData.quality_score?.score?.toUpperCase() || 'GREEN'
        }

        const tierLimits: Record<string, number> = {
          'TIER_250': 250,
          'TIER_1K': 1000,
          'TIER_2K': 2000,
          'TIER_10K': 10000,
          'TIER_100K': 100000,
          'TIER_UNLIMITED': 1000000,
          'STANDARD': 100000,
        }
        usage.whatsapp.tierLimit = tierLimits[usage.whatsapp.tier] || 250
      } catch (e) {
        console.error('Failed to get WhatsApp tier:', e)
      }
    }

    usage.whatsapp.percentage = Math.round((usage.whatsapp.messagesSent / usage.whatsapp.tierLimit) * 100 * 10) / 10
    usage.whatsapp.status = getStatus(usage.whatsapp.percentage)
  } catch (e) {
    console.error('Failed to get WhatsApp usage:', e)
  }

  // 4. Vercel Usage
  try {
    if (process.env.VERCEL_API_TOKEN) {
      const teamId = process.env.VERCEL_TEAM_ID || ''
      const now = new Date()
      const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const to = now.toISOString()

      const baseUrl = `https://api.vercel.com/v2/usage?teamId=${teamId}&from=${from}&to=${to}`

      const [requestsResponse, buildsResponse] = await Promise.all([
        fetchWithTimeout(`${baseUrl}&type=requests`, {
          headers: { 'Authorization': `Bearer ${process.env.VERCEL_API_TOKEN}` },
          timeoutMs: 3500,
        }),
        fetchWithTimeout(`${baseUrl}&type=builds`, {
          headers: { 'Authorization': `Bearer ${process.env.VERCEL_API_TOKEN}` },
          timeoutMs: 3500,
        }),
      ])

      if (requestsResponse.ok) {
        const data = await requestsResponse.json()
        if (data.data && Array.isArray(data.data)) {
          for (const day of data.data) {
            usage.vercel.functionInvocations += (day.function_invocation_successful_count || 0)
            usage.vercel.functionInvocations += (day.function_invocation_error_count || 0)
            usage.vercel.functionInvocations += (day.function_invocation_throttle_count || 0)
            usage.vercel.functionInvocations += (day.function_invocation_timeout_count || 0)
            usage.vercel.edgeRequests += (day.request_hit_count || 0)
            usage.vercel.edgeRequests += (day.request_miss_count || 0)
          }
        }
      }

      if (buildsResponse.ok) {
        const data = await buildsResponse.json()
        if (data.data && Array.isArray(data.data)) {
          for (const day of data.data) {
            usage.vercel.buildMinutes += (day.build_build_seconds || 0)
          }
        }
        usage.vercel.buildMinutes = Math.round(usage.vercel.buildMinutes / 60)
      }

      usage.vercel.functionPercentage = Math.round((usage.vercel.functionInvocations / usage.vercel.functionLimit) * 100 * 10) / 10
      usage.vercel.edgePercentage = Math.round((usage.vercel.edgeRequests / usage.vercel.edgeLimit) * 100 * 10) / 10
      usage.vercel.buildPercentage = Math.round((usage.vercel.buildMinutes / usage.vercel.buildLimit) * 100 * 10) / 10
      usage.vercel.percentage = Math.max(
        usage.vercel.functionPercentage,
        usage.vercel.edgePercentage,
        usage.vercel.buildPercentage
      )
    }

    usage.vercel.status = getStatus(usage.vercel.percentage)
  } catch (e) {
    console.error('Failed to get Vercel usage:', e)
  }

  return NextResponse.json(
    {
      success: true,
      timestamp: new Date().toISOString(),
      period: 'current_month',
      usage,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    }
  )
}
