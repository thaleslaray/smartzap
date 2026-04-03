import { NextResponse } from 'next/server'
import { Client } from '@upstash/workflow'

import { supabase } from '@/lib/supabase'
import { templateDb, campaignDb } from '@/lib/supabase-db'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'

import { precheckContactForTemplate } from '@/lib/whatsapp/template-contract'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'
import { createHash } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Divide um array em pedaços de tamanho fixo para evitar URLs longas no PostgREST
function chunk<T>(array: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError('chunk size must be a positive integer')
  }
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

// Limite de concorrência para Promise.all em batches de queries ao PostgREST
const MAX_PARALLEL = 5

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

interface Params {
  params: Promise<{ id: string }>
}

interface CampaignContactRow {
  id: string
  phone: string
  name: string | null
  email: string | null
  contact_id: string | null
  custom_fields: Record<string, unknown> | null
}

interface ContactRow {
  id: string
  name: string | null
  phone: string
  email: string | null
  custom_fields: Record<string, unknown> | null
}

/**
 * POST /api/campaigns/[id]/resend-skipped
 * Revalida os contatos SKIPPED e reenfileira apenas os que ficarem válidos.
 */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { id: campaignId } = await params

    // 1) Carregar campanha (templateName + templateVariables)
    const { data: campaignRow, error: campaignError } = await supabase
      .from('campaigns')
      .select('template_name, template_variables')
      .eq('id', campaignId)
      .single()

    if (campaignError) {
      return NextResponse.json({ error: 'Falha ao carregar campanha', details: campaignError.message }, { status: 500 })
    }

    const templateName = (campaignRow as any)?.template_name as string | null
    if (!templateName) {
      return NextResponse.json({ error: 'Campanha sem template associado' }, { status: 400 })
    }

    // JSONB normalmente já é objeto. Mantém fallback por segurança.
    let templateVariables: any = (campaignRow as any)?.template_variables
    if (typeof templateVariables === 'string') {
      try {
        templateVariables = JSON.parse(templateVariables)
      } catch {
        templateVariables = undefined
      }
    }

    // 2) Template precisa existir no cache local (documented-only)
    const initialTemplate = await templateDb.getByName(templateName)
    if (!initialTemplate) {
      return NextResponse.json(
        { error: 'Template não encontrado no banco local. Sincronize Templates antes de reenviar ignorados.' },
        { status: 400 }
      )
    }

    let template = initialTemplate

    // Se o template tem HEADER de mídia, o envio precisa de URL (link) da mídia.
    // Alguns registros locais podem ter apenas handle "4::...". Fazemos refresh pontual na Meta.
    const headerInfo0 = getTemplateHeaderMediaExampleLink(template)
    if (headerInfo0.format && ['IMAGE', 'VIDEO', 'DOCUMENT', 'GIF'].includes(headerInfo0.format)) {
      const example0 = headerInfo0.example
      if (!example0 || !isHttpUrl(example0)) {
        try {
          const creds = await getWhatsAppCredentials()
          if (creds?.businessAccountId && creds?.accessToken) {
            const refreshed = await fetchSingleTemplateFromMeta({
              businessAccountId: creds.businessAccountId,
              accessToken: creds.accessToken,
              templateName,
            })
            if (refreshed) {
              await templateDb.upsert([refreshed])
              const refreshedLocal = await templateDb.getByName(templateName)
              if (refreshedLocal) template = refreshedLocal
            }
          }
        } catch (e) {
          console.warn('[ResendSkipped] Falha ao fazer refresh do template na Meta (best-effort):', e)
        }

        const headerInfo1 = getTemplateHeaderMediaExampleLink(template)
        if (!headerInfo1.example || !isHttpUrl(headerInfo1.example)) {
          return NextResponse.json(
            {
              error:
                `O template "${templateName}" possui HEADER ${headerInfo0.format}, mas o cache local não tem URL de mídia para envio.`,
              action:
                'Sincronize Templates (Meta → local) e tente novamente. Se o template ainda está em revisão, aguarde aprovação antes de reenviar.',
              details: {
                headerFormat: headerInfo0.format,
                examplePreview: headerInfo1.example || headerInfo0.example || null,
              },
            },
            { status: 400 }
          )
        }
      }
    }

    // Snapshot do template na campanha (se ainda não existir)
    try {
      const snapshot = {
        name: template.name,
        language: template.language,
        parameter_format: (template as any).parameterFormat || 'positional',
        spec_hash: (template as any).specHash ?? null,
        fetched_at: (template as any).fetchedAt ?? null,
        components: (template as any).components || (template as any).content || [],
      }

      const { data: existing } = await supabase
        .from('campaigns')
        .select('template_spec_hash')
        .eq('id', campaignId)
        .single()

      if (!(existing as any)?.template_spec_hash) {
        await supabase
          .from('campaigns')
          .update({
            template_snapshot: snapshot,
            template_spec_hash: snapshot.spec_hash,
            template_parameter_format: snapshot.parameter_format,
            template_fetched_at: snapshot.fetched_at,
            updated_at: new Date().toISOString(),
          })
          .eq('id', campaignId)
      }
    } catch (e) {
      console.warn('[ResendSkipped] Falha ao salvar snapshot do template na campanha (best-effort):', e)
    }

    // 3) Buscar contatos skipped (snapshot em campaign_contacts)
    const { data: skippedRows, error: skippedError } = await supabase
      .from('campaign_contacts')
      .select('id, phone, name, email, contact_id, custom_fields')
      .eq('campaign_id', campaignId)
      .eq('status', 'skipped')

    if (skippedError) {
      return NextResponse.json({ error: 'Falha ao buscar ignorados', details: skippedError.message }, { status: 500 })
    }

    const contacts = (skippedRows || []) as CampaignContactRow[]
    if (contacts.length === 0) {
      return NextResponse.json(
        { status: 'nothing', resent: 0, stillSkipped: 0, message: 'Não há contatos ignorados para reenviar.' },
        { status: 200 }
      )
    }

    // 3.1) Trazer dados atuais de contacts (para refletir correções no contato)
    const contactIds = Array.from(
      new Set(
        contacts
          .map((c) => c.contact_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    )

    const contactById = new Map<string, ContactRow>()
    if (contactIds.length > 0) {
      // BUG 1 FIX: batch de 150 ids para evitar HTTP 414 (URL muito longa no PostgREST)
      const idChunks = chunk(contactIds, 150)
      const chunkResults = []
      for (let i = 0; i < idChunks.length; i += MAX_PARALLEL) {
        const batch = idChunks.slice(i, i + MAX_PARALLEL)
        chunkResults.push(...(await Promise.all(
          batch.map((ids) =>
            supabase
              .from('contacts')
              .select('id, name, phone, email, custom_fields')
              .in('id', ids)
          )
        )))
      }

      for (const { data, error: latestContactsError } of chunkResults) {
        if (latestContactsError) {
          return NextResponse.json(
            { error: 'Falha ao carregar contatos', details: latestContactsError.message },
            { status: 500 }
          )
        }

        for (const c of (data || []) as any[]) {
          if (!c?.id) continue
          contactById.set(String(c.id), {
            id: String(c.id),
            name: (c.name as string | null) ?? null,
            phone: String(c.phone || ''),
            email: (c.email as string | null) ?? null,
            custom_fields: (c.custom_fields as Record<string, unknown> | null) ?? null,
          })
        }
      }
    }

    const nowIso = new Date().toISOString()

    const validForResend: Array<{ contactId: string; phone: string; name: string; email?: string; custom_fields?: Record<string, unknown> }> = []
    const updates: Array<any> = []

    // 3.2) Para registros antigos sem contact_id, tenta resolver via contacts.phone (UNIQUE)
    const missingIdPhones = Array.from(
      new Set(
        contacts
          .filter((c) => !c.contact_id)
          .map((c) => String(c.phone || '').trim())
          .filter((p) => p.length > 0)
      )
    )

    const idByPhone = new Map<string, string>()
    if (missingIdPhones.length > 0) {
      // BUG 2 FIX: batch de 100 phones para evitar HTTP 414 (URL muito longa no PostgREST)
      const phoneChunks = chunk(missingIdPhones, 100)
      const phoneChunkResults = []
      for (let i = 0; i < phoneChunks.length; i += MAX_PARALLEL) {
        const batch = phoneChunks.slice(i, i + MAX_PARALLEL)
        phoneChunkResults.push(...(await Promise.all(
          batch.map((phones) =>
            supabase
              .from('contacts')
              .select('id, phone')
              .in('phone', phones)
          )
        )))
      }

      for (const { data, error: resolvedByPhoneError } of phoneChunkResults) {
        if (resolvedByPhoneError) {
          return NextResponse.json(
            { error: 'Falha ao resolver contatos por telefone', details: resolvedByPhoneError.message },
            { status: 500 }
          )
        }

        for (const r of (data || []) as any[]) {
          if (!r?.id || !r?.phone) continue
          idByPhone.set(String(r.phone), String(r.id))
        }
      }
    }

    // Para evitar 500 por UNIQUE(campaign_id, phone):
    // vamos montar as intenções (desiredPhone) e validar conflitos antes do upsert.
    const desiredByRowId = new Map<string, { desiredPhone: string; originalPhone: string }>()
    const desiredPhoneToRowIds = new Map<string, string[]>()

    for (const row of contacts) {
      const resolvedContactId = row.contact_id || idByPhone.get(String(row.phone || '').trim()) || null
      const latest = resolvedContactId ? contactById.get(resolvedContactId) : undefined
      const effectiveName = (latest?.name ?? row.name ?? '') as string
      const effectivePhone = (latest?.phone ?? row.phone) as string
      const effectiveEmail = (latest?.email ?? row.email) as string | null
      const effectiveCustomFields = (latest?.custom_fields ?? row.custom_fields ?? {}) as Record<string, unknown>

      const precheck = precheckContactForTemplate(
        {
          phone: effectivePhone,
          name: effectiveName || '',
          email: effectiveEmail || undefined,
          custom_fields: effectiveCustomFields || {},
          contactId: resolvedContactId,
        },
        template as any,
        templateVariables
      )

      if (!resolvedContactId) {
        updates.push({
          id: row.id,
          campaign_id: campaignId,
          status: 'skipped',
          phone: precheck.normalizedPhone || effectivePhone,
          name: effectiveName || null,
          email: effectiveEmail,
          custom_fields: effectiveCustomFields,
          failure_reason: 'Contato sem ID (registro antigo ou contato removido). Abra o contato e salve novamente.',
          error: 'Contato sem ID (registro antigo ou contato removido). Abra o contato e salve novamente.',
          message_id: null,
          failed_at: null,
        })
        continue
      }

      if (!precheck.ok) {
        updates.push({
          id: row.id,
          campaign_id: campaignId,
          contact_id: resolvedContactId,
          status: 'skipped',
          // Mantém snapshot sincronizado com o contato atual
          phone: precheck.normalizedPhone || effectivePhone,
          name: effectiveName || null,
          email: effectiveEmail,
          custom_fields: effectiveCustomFields,
          // Motivo do skip: usa colunas existentes (failure_reason/error)
          failure_reason: precheck.reason,
          error: precheck.reason,
          message_id: null,
          failed_at: null,
        })
        continue
      }

      // Candidato válido: registrar intenção de phone normalizado para checar conflitos.
      desiredByRowId.set(row.id, { desiredPhone: precheck.normalizedPhone, originalPhone: row.phone })
      const arr = desiredPhoneToRowIds.get(precheck.normalizedPhone) || []
      arr.push(row.id)
      desiredPhoneToRowIds.set(precheck.normalizedPhone, arr)

      // Válido: volta para pending e limpa campos de skip/erro
      updates.push({
        id: row.id,
        campaign_id: campaignId,
        contact_id: resolvedContactId,
        phone: precheck.normalizedPhone,
        name: effectiveName || null,
        email: effectiveEmail,
        custom_fields: effectiveCustomFields,
        status: 'pending',
        failure_code: null,
        failure_reason: null,
        error: null,
        message_id: null,
        failed_at: null,
      })

      validForResend.push({
        contactId: resolvedContactId,
        phone: precheck.normalizedPhone,
        name: effectiveName || '',
        email: effectiveEmail || undefined,
        custom_fields: effectiveCustomFields || {},
      })
    }

    // 3.2) Resolver conflitos de phone dentro do próprio lote
    // Se mais de um row for para o mesmo phone normalizado, reenfileira só o primeiro.
    const rowIdsToForceSkip = new Set<string>()
    for (const [phone, rowIds] of desiredPhoneToRowIds.entries()) {
      if (rowIds.length <= 1) continue
      // mantém o primeiro, pula os demais
      for (const id of rowIds.slice(1)) rowIdsToForceSkip.add(id)
    }

    // 3.3) Resolver conflitos com outros registros já existentes na campanha
    const desiredPhones = Array.from(desiredPhoneToRowIds.keys())
    const existingPhoneToId = new Map<string, string>()
    if (desiredPhones.length > 0) {
      // BUG 3 FIX: batch de 100 phones para evitar HTTP 414 (URL muito longa no PostgREST)
      // Cada chunk precisa manter o filtro .eq('campaign_id', campaignId) para não retornar
      // registros de outras campanhas com o mesmo telefone
      const desiredPhoneChunks = chunk(desiredPhones, 100)
      const desiredPhoneChunkResults = []
      for (let i = 0; i < desiredPhoneChunks.length; i += MAX_PARALLEL) {
        const batch = desiredPhoneChunks.slice(i, i + MAX_PARALLEL)
        desiredPhoneChunkResults.push(...(await Promise.all(
          batch.map((phones) =>
            supabase
              .from('campaign_contacts')
              .select('id, phone')
              .eq('campaign_id', campaignId)
              .in('phone', phones)
          )
        )))
      }

      for (const { data, error: existingError } of desiredPhoneChunkResults) {
        if (existingError) {
          return NextResponse.json(
            { error: 'Falha ao validar conflitos de telefone', details: existingError.message },
            { status: 500 }
          )
        }

        for (const r of (data || []) as any[]) {
          if (!r?.id || !r?.phone) continue
          existingPhoneToId.set(String(r.phone), String(r.id))
        }
      }

      for (const [phone, rowIds] of desiredPhoneToRowIds.entries()) {
        const existingId = existingPhoneToId.get(phone)
        if (!existingId) continue
        // Se o phone já existe em outro registro (id diferente do próprio row), é conflito.
        for (const rowId of rowIds) {
          if (existingId !== rowId) rowIdsToForceSkip.add(rowId)
        }
      }
    }

    if (rowIdsToForceSkip.size > 0) {
      // Ajustar updates + validForResend removendo os conflitados
      const conflictReason = 'Telefone duplicado na campanha após normalização. Ajuste o telefone do contato e tente novamente.'

      // 1) Converte qualquer update pendente desses ids para skipped (sem trocar phone)
      for (let i = 0; i < updates.length; i++) {
        const u = updates[i]
        if (!u?.id || !rowIdsToForceSkip.has(String(u.id))) continue
        // Se era candidato a pending, força skipped e preserva phone original (evita bater na UNIQUE)
        const info = desiredByRowId.get(String(u.id))
        updates[i] = {
          id: u.id,
          campaign_id: campaignId,
          status: 'skipped',
          phone: info?.originalPhone || u.phone,
          name: u.name ?? null,
          email: u.email ?? null,
          custom_fields: u.custom_fields ?? {},
          failure_reason: conflictReason,
          error: conflictReason,
          message_id: null,
          failed_at: null,
        }
      }

      // 2) Remove do validForResend
      const blockedPhones = new Set<string>()
      for (const rowId of rowIdsToForceSkip) {
        const info = desiredByRowId.get(rowId)
        if (info?.desiredPhone) blockedPhones.add(info.desiredPhone)
      }
      if (blockedPhones.size > 0) {
        for (let i = validForResend.length - 1; i >= 0; i--) {
          if (blockedPhones.has(validForResend[i].phone)) validForResend.splice(i, 1)
        }
      }
    }

    // 4) Persistir updates (bulk upsert por PK id)
    const safeUpdates = updates.filter((u) => u && typeof u.id === 'string' && u.id.length > 0)
    if (updates.length !== safeUpdates.length) {
      console.warn(
        `[ResendSkipped] Ignorando ${updates.length - safeUpdates.length} update(s) sem id válido (evita inserts acidentais).`
      )
    }

    if (safeUpdates.length) {
      const { error: upsertError } = await supabase
        .from('campaign_contacts')
        .upsert(safeUpdates, { onConflict: 'id' })

      if (upsertError) {
        return NextResponse.json({ error: 'Falha ao atualizar status dos contatos', details: upsertError.message }, { status: 500 })
      }
    }

    const stillSkipped = contacts.length - validForResend.length

    // Atualiza contador de skipped na campanha (para UI imediata)
    try {
      await campaignDb.updateStatus(campaignId, { skipped: stillSkipped })
    } catch (e) {
      console.warn('[ResendSkipped] Falha ao atualizar contador de skipped na campanha (best-effort):', e)
    }

    // Recalcular total_recipients (exclui skipped) para manter UI consistente
    try {
      const [{ count: totalCount, error: totalErr }, { count: skippedCount, error: skippedErr }] = await Promise.all([
        supabase
          .from('campaign_contacts')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaignId),
        supabase
          .from('campaign_contacts')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaignId)
          .eq('status', 'skipped'),
      ])

      if (totalErr) throw totalErr
      if (skippedErr) throw skippedErr

      const updateCampaign: Record<string, unknown> = { updated_at: nowIso }
      if (typeof totalCount === 'number') {
        const skippedSafe = typeof skippedCount === 'number' ? skippedCount : 0
        updateCampaign.total_recipients = Math.max(0, totalCount - skippedSafe)
      }
      if (typeof skippedCount === 'number') updateCampaign.skipped = skippedCount

      await supabase
        .from('campaigns')
        .update(updateCampaign)
        .eq('id', campaignId)
    } catch (e) {
      console.warn('[ResendSkipped] Falha ao recalcular total_recipients (best-effort):', e)
    }

    // 5) Se ninguém ficou válido, não enfileira
    if (validForResend.length === 0) {
      return NextResponse.json(
        {
          status: 'skipped',
          resent: 0,
          stillSkipped,
          message: 'Nenhum contato ignorado passou na revalidação.',
        },
        { status: 202 }
      )
    }

    // 6) Credenciais WhatsApp (Supabase settings/env)
    const credentials = await getWhatsAppCredentials()
    if (!credentials?.phoneNumberId || !credentials?.accessToken) {
      return NextResponse.json(
        { error: 'Credenciais WhatsApp não configuradas. Configure em Configurações.' },
        { status: 401 }
      )
    }

    // 7) Enfileirar workflow com apenas os válidos
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim())
      || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}` : null)
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : null)
      || 'http://localhost:3000'

    const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')

    const traceId = `resend_${campaignId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

    const workflowPayload = {
      campaignId,
      traceId,
      templateName,
      contacts: validForResend,
      templateVariables,
      templateSnapshot: {
        name: template.name,
        language: template.language,
        parameter_format: (template as any).parameterFormat || 'positional',
        spec_hash: (template as any).specHash ?? null,
        fetched_at: (template as any).fetchedAt ?? null,
        components: (template as any).components || (template as any).content || [],
      },
      phoneNumberId: credentials.phoneNumberId,
      accessToken: credentials.accessToken,
      isResend: true,
    }

    if (isLocalhost) {
      const response = await fetchWithTimeout(`${baseUrl}/api/campaign/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflowPayload),
        timeoutMs: 30000,
      })

      if (!response.ok) {
        const errorData = (await safeJson<any>(response)) || {}
        throw new Error(errorData.error || `Workflow failed with status ${response.status}`)
      }
    } else {
      if (!process.env.QSTASH_TOKEN) {
        return NextResponse.json(
          { error: 'Serviço de workflow não configurado. Configure QSTASH_TOKEN.' },
          { status: 503 }
        )
      }

      const workflowClient = new Client({ token: process.env.QSTASH_TOKEN })
      await workflowClient.trigger({
        url: `${baseUrl}/api/campaign/workflow`,
        body: workflowPayload,
        retries: 3,
      })
    }

    return NextResponse.json(
      {
        status: 'queued',
        resent: validForResend.length,
        stillSkipped,
        traceId,
        message: `${validForResend.length} contatos reenfileirados • ${stillSkipped} ainda ignorados`,
      },
      { status: 202 }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[ResendSkipped] Error:', error)
    return NextResponse.json(
      { error: 'Falha ao reenviar ignorados', details: errorMessage },
      { status: 500 }
    )
  }
}
