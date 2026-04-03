/**
 * Supabase Database Service
 * 
 * Camada de acesso ao banco (Supabase)
 */

import { supabase } from './supabase'
import { redis } from './redis'
import {
    Campaign,
    Contact,
    CampaignStatus,
    ContactStatus,
    LeadForm,
    CreateLeadFormDTO,
    UpdateLeadFormDTO,
    Template,
    TemplateComponent,
    TemplateCategory,
    TemplateStatus,
    AppSettings,
    TemplateProject,
    TemplateProjectItem,
    CreateTemplateProjectDTO,
    CustomFieldDefinition,
    CampaignFolder,
    CampaignTag,
    CreateCampaignFolderDTO,
    UpdateCampaignFolderDTO,
    CreateCampaignTagDTO,
} from '../types'
import { isSuppressionActive } from '@/lib/phone-suppressions'
import { canonicalTemplateCategory } from '@/lib/template-category'
import { normalizePhoneNumber, validatePhoneNumber } from '@/lib/phone-formatter'

// Divide array em chunks de tamanho n para evitar 414 Request-URI Too Large
// no PostgREST: .in('field', array) serializa todos os valores na URL.
function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size))
    }
    return chunks
}

/**
 * Normaliza tags que podem estar aninhadas como [["tag"]] → ["tag"].
 * Resolve corrupção de dados onde arrays JSONB foram double-wrapped.
 */
function flattenTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) return []
    return tags
        .flat(Infinity)
        .map(t => {
            const s = String(t ?? '').trim()
            // Remove brackets de strings que parecem JSON arrays: '["tag"]' → 'tag'
            if (s.startsWith('[') && s.endsWith(']')) {
                try {
                    const parsed = JSON.parse(s)
                    if (Array.isArray(parsed)) return parsed.map(String)
                } catch { /* not JSON, keep as-is */ }
            }
            return s
        })
        .flat()
        .filter(Boolean)
}

// Gera um ID compatível com ambientes que usam UUID (preferencial) e também funciona como TEXT.
// - Em Supabase, muitos schemas antigos usam `uuid` como PK.
// - No schema consolidado atual, os PKs são TEXT com defaults, mas aceitar UUID como string é ok.
const generateId = () => {
    try {
        // Web Crypto (browser/edge) e Node moderno
        if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
    } catch {
        // ignore
    }

    // Fallback (menos ideal, mas evita quebrar em runtimes sem randomUUID)
    return Math.random().toString(36).slice(2)
}

const generateWebhookToken = () => {
    // Token opaco para uso em integrações/webhooks (não é senha de usuário).
    // Mantemos simples e disponível em runtimes edge/node.
    try {
        if (typeof globalThis.crypto?.randomUUID === 'function') {
            return `lfw_${globalThis.crypto.randomUUID().replace(/-/g, '')}`
        }
    } catch {
        // ignore
    }

    return `lfw_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

// ============================================================================
// CAMPAIGNS
// ============================================================================

export const campaignDb = {
    getAll: async (): Promise<Campaign[]> => {
        const { data, error } = await supabase
            .from('campaigns')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw error

        return (data || []).map(row => ({
            id: row.id,
            name: row.name,
            status: row.status as CampaignStatus,
            templateName: row.template_name,
            templateVariables: row.template_variables as { header: string[], headerMediaId?: string, body: string[], buttons?: Record<string, string> } | undefined,
            templateSnapshot: (row as any).template_snapshot ?? undefined,
            templateSpecHash: (row as any).template_spec_hash ?? null,
            templateParameterFormat: (row as any).template_parameter_format ?? null,
            templateFetchedAt: (row as any).template_fetched_at ?? null,
            recipients: row.total_recipients,
            sent: row.sent,
            delivered: row.delivered,
            read: row.read,
            skipped: (row as any).skipped || 0,
            failed: row.failed,
            createdAt: row.created_at,
            scheduledAt: row.scheduled_date,
            qstashScheduleMessageId: (row as any).qstash_schedule_message_id ?? null,
            qstashScheduleEnqueuedAt: (row as any).qstash_schedule_enqueued_at ?? null,
            startedAt: row.started_at,
            firstDispatchAt: (row as any).first_dispatch_at ?? null,
            lastSentAt: (row as any).last_sent_at ?? null,
            completedAt: row.completed_at,
            cancelledAt: (row as any).cancelled_at ?? null,
            flowId: (row as any).flow_id ?? null,
            flowName: (row as any).flow_name ?? null,
        }))
    },

    list: async (params: {
        limit: number
        offset: number
        search?: string | null
        status?: string | null
        folderId?: string | null  // null = todas, 'none' = sem pasta, UUID = pasta específica
        tagIds?: string[] | null  // IDs das tags para filtrar (AND)
    }): Promise<{ data: Campaign[]; total: number }> => {
        const limit = Math.max(1, Math.min(100, Math.floor(params.limit || 20)))
        const offset = Math.max(0, Math.floor(params.offset || 0))
        const search = (params.search || '').trim()
        const status = (params.status || '').trim()
        const folderId = params.folderId ?? null
        const tagIds = params.tagIds ?? null

        // Se filtrar por tags, usamos RPC para buscar em uma única query (evita N+1)
        let campaignIdsWithTags: string[] | null = null
        if (tagIds && tagIds.length > 0) {
            const { data: campaignIds, error: tagError } = await supabase.rpc(
                'get_campaigns_with_all_tags',
                { p_tag_ids: tagIds }
            )

            if (tagError) {
                console.error('Failed to get campaigns by tags:', tagError)
                throw tagError
            }

            const resolvedIds: string[] = campaignIds || []

            // Se não houver campanhas com todas as tags, retorna vazio
            if (resolvedIds.length === 0) {
                return { data: [], total: 0 }
            }

            campaignIdsWithTags = resolvedIds
        }

        let query = supabase
            .from('campaigns')
            .select(
                'id,name,status,template_name,template_variables,total_recipients,sent,delivered,read,skipped,failed,created_at,scheduled_date,started_at,first_dispatch_at,last_sent_at,completed_at,folder_id,campaign_folders(id,name,color,created_at,updated_at)',
                { count: 'exact' }
            )

        if (search) {
            const like = `%${search}%`
            query = query.or(`name.ilike.${like},template_name.ilike.${like}`)
        }

        if (status && status !== 'All') {
            query = query.eq('status', status)
        }

        // Filtro por pasta
        if (folderId === 'none') {
            query = query.is('folder_id', null)
        } else if (folderId) {
            query = query.eq('folder_id', folderId)
        }

        // Filtro por tags (campanhas que têm TODAS as tags selecionadas)
        if (campaignIdsWithTags !== null) {
            query = query.in('id', campaignIdsWithTags)
        }

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (error) throw error

        // Buscar as tags de cada campanha
        const campaignIds = (data || []).map((r: any) => r.id)
        let tagsMap = new Map<string, CampaignTag[]>()

        if (campaignIds.length > 0) {
            const { data: tagAssignments } = await supabase
                .from('campaign_tag_assignments')
                .select(`
                    campaign_id,
                    campaign_tags (
                        id,
                        name,
                        color,
                        created_at
                    )
                `)
                .in('campaign_id', campaignIds)

            ;(tagAssignments || []).forEach((row: any) => {
                const campaignId = row.campaign_id
                const tag = row.campaign_tags
                if (tag) {
                    const existing = tagsMap.get(campaignId) || []
                    existing.push({
                        id: tag.id,
                        name: tag.name,
                        color: tag.color,
                        createdAt: tag.created_at,
                    })
                    tagsMap.set(campaignId, existing)
                }
            })
        }

        return {
            data: (data || []).map(row => {
                const folderData = (row as any).campaign_folders
                return {
                    id: row.id,
                    name: row.name,
                    status: row.status as CampaignStatus,
                    templateName: row.template_name,
                    templateVariables: row.template_variables as { header: string[], headerMediaId?: string, body: string[], buttons?: Record<string, string> } | undefined,
                    recipients: row.total_recipients,
                    sent: row.sent,
                    delivered: row.delivered,
                    read: row.read,
                    skipped: (row as any).skipped || 0,
                    failed: row.failed,
                    createdAt: row.created_at,
                    scheduledAt: row.scheduled_date,
                    startedAt: row.started_at,
                    firstDispatchAt: (row as any).first_dispatch_at ?? null,
                    lastSentAt: (row as any).last_sent_at ?? null,
                    completedAt: row.completed_at,
                    flowId: (row as any).flow_id ?? null,
                    flowName: (row as any).flow_name ?? null,
                    folderId: (row as any).folder_id ?? null,
                    folder: folderData ? {
                        id: folderData.id,
                        name: folderData.name,
                        color: folderData.color,
                        createdAt: folderData.created_at,
                        updatedAt: folderData.updated_at,
                    } : null,
                    tags: tagsMap.get(row.id) || [],
                }
            }),
            total: count || 0,
        }
    },

    getById: async (id: string): Promise<Campaign | undefined> => {
        const { data, error } = await supabase
            .from('campaigns')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) return undefined

        return {
            id: data.id,
            name: data.name,
            status: data.status as CampaignStatus,
            templateName: data.template_name,
            templateVariables: data.template_variables as { header: string[], headerMediaId?: string, body: string[], buttons?: Record<string, string> } | undefined,
            templateSnapshot: (data as any).template_snapshot ?? undefined,
            templateSpecHash: (data as any).template_spec_hash ?? null,
            templateParameterFormat: (data as any).template_parameter_format ?? null,
            templateFetchedAt: (data as any).template_fetched_at ?? null,
            recipients: data.total_recipients,
            sent: data.sent,
            delivered: data.delivered,
            read: data.read,
            skipped: (data as any).skipped || 0,
            failed: data.failed,
            createdAt: data.created_at,
            scheduledAt: data.scheduled_date,
            qstashScheduleMessageId: (data as any).qstash_schedule_message_id ?? null,
            qstashScheduleEnqueuedAt: (data as any).qstash_schedule_enqueued_at ?? null,
            startedAt: data.started_at,
            firstDispatchAt: (data as any).first_dispatch_at ?? null,
            lastSentAt: (data as any).last_sent_at ?? null,
            completedAt: data.completed_at,
            cancelledAt: (data as any).cancelled_at ?? null,
            flowId: (data as any).flow_id ?? null,
            flowName: (data as any).flow_name ?? null,
        }
    },

    create: async (campaign: {
        name: string
        templateName: string
        recipients: number
        scheduledAt?: string
        templateVariables?: { header: string[], headerMediaId?: string, body: string[], buttons?: Record<string, string> }
        flowId?: string | null
        flowName?: string | null
        folderId?: string | null
    }): Promise<Campaign> => {
        const id = generateId()
        const now = new Date().toISOString()
        // IMPORTANTE:
        // Campanha NÃO deve iniciar como "Enviando" na criação.
        // O envio só começa quando o workflow é enfileirado (dispatch) e o worker inicia.
        // Caso o dispatch falhe (ex.: QSTASH_TOKEN ausente em preview), a campanha ficava
        // eternamente em "Enviando" com tudo em pending.
        const status = campaign.scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT

        const { data, error } = await supabase
            .from('campaigns')
            .insert({
                id,
                name: campaign.name,
                status,
                template_name: campaign.templateName,
                template_variables: campaign.templateVariables,
                total_recipients: campaign.recipients,
                sent: 0,
                delivered: 0,
                read: 0,
                failed: 0,
                skipped: 0,
                created_at: now,
                scheduled_date: campaign.scheduledAt,
                started_at: null,
                cancelled_at: null,
                flow_id: campaign.flowId ?? null,
                flow_name: campaign.flowName ?? null,
                folder_id: campaign.folderId ?? null,
            })
            .select()
            .single()

        if (error) throw error

        return {
            id,
            name: campaign.name,
            status,
            templateName: campaign.templateName,
            templateVariables: campaign.templateVariables,
            recipients: campaign.recipients,
            sent: 0,
            delivered: 0,
            read: 0,
            skipped: 0,
            failed: 0,
            createdAt: now,
            scheduledAt: campaign.scheduledAt,
            startedAt: undefined,
            cancelledAt: undefined,
            flowId: campaign.flowId ?? null,
            flowName: campaign.flowName ?? null,
        }
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('campaigns')
            .delete()
            .eq('id', id)

        if (error) throw error
    },

    duplicate: async (id: string): Promise<Campaign | undefined> => {
        const original = await campaignDb.getById(id)
        if (!original) return undefined

        const newId = generateId()
        const now = new Date().toISOString()

        // Copy campaign contacts first so we can set total_recipients accurately.
        // Observação: Supabase JS não oferece transação multi-step facilmente aqui;
        // então tentamos manter o estado consistente (rollback best-effort em falhas).
        //
        // BUG FIX: sem .limit() o PostgREST silenciosamente trunca em 1000 rows, fazendo
        // a cópia perder contatos. Paginamos em blocos de 1000 até buscar todos os contatos.
        const existingContacts: any[] = []
        let dupOffset = 0
        const DUP_PAGE_SIZE = 1000

        while (true) {
            const { data: page, error: existingContactsError } = await supabase
                .from('campaign_contacts')
                .select('contact_id, phone, name, email, custom_fields')
                .eq('campaign_id', id)
                .order('id', { ascending: true })
                .range(dupOffset, dupOffset + DUP_PAGE_SIZE - 1)

            if (existingContactsError) throw existingContactsError

            const rows = page || []
            existingContacts.push(...rows)

            if (rows.length < DUP_PAGE_SIZE) break
            dupOffset += DUP_PAGE_SIZE
        }

        const recipientsCount = existingContacts?.length ?? original.recipients ?? 0

        const { error } = await supabase
            .from('campaigns')
            .insert({
                id: newId,
                name: `${original.name} (Cópia)`,
                status: CampaignStatus.DRAFT,
                template_name: original.templateName,
                template_variables: original.templateVariables,
                template_snapshot: original.templateSnapshot ?? null,
                template_spec_hash: original.templateSpecHash ?? null,
                template_parameter_format: original.templateParameterFormat ?? null,
                template_fetched_at: original.templateFetchedAt ?? null,
                total_recipients: recipientsCount,
                sent: 0,
                delivered: 0,
                read: 0,
                skipped: 0,
                failed: 0,
                created_at: now,
                scheduled_date: null,
                started_at: null,
                completed_at: null,
                flow_id: original.flowId ?? null,
                flow_name: original.flowName ?? null,
            })

        if (error) throw error

        if (existingContacts && existingContacts.length > 0) {
            const newContacts = existingContacts.map(c => ({
                id: generateId(),
                campaign_id: newId,
                contact_id: c.contact_id,
                phone: c.phone,
                name: c.name,
                email: (c as any).email ?? null,
                custom_fields: (c as any).custom_fields || {},
                status: 'pending',
            }))

            const { error: insertContactsError } = await supabase
                .from('campaign_contacts')
                .insert(newContacts)

            if (insertContactsError) {
                // Rollback best-effort: não deixar uma campanha “cópia” sem público.
                await supabase.from('campaigns').delete().eq('id', newId)
                throw insertContactsError
            }
        }

        return campaignDb.getById(newId)
    },

    updateStatus: async (id: string, updates: Partial<Campaign>): Promise<Campaign | undefined> => {
        const updateData: Record<string, unknown> = {}

        if (updates.status !== undefined) updateData.status = updates.status
        if (updates.sent !== undefined) updateData.sent = updates.sent
        if (updates.delivered !== undefined) updateData.delivered = updates.delivered
        if (updates.read !== undefined) updateData.read = updates.read
        if (updates.skipped !== undefined) updateData.skipped = updates.skipped
        if (updates.failed !== undefined) updateData.failed = updates.failed
        if (updates.completedAt !== undefined) updateData.completed_at = updates.completedAt
        if (updates.cancelledAt !== undefined) updateData.cancelled_at = updates.cancelledAt
        if (updates.startedAt !== undefined) updateData.started_at = updates.startedAt
        if (updates.firstDispatchAt !== undefined) updateData.first_dispatch_at = updates.firstDispatchAt
        if (updates.lastSentAt !== undefined) updateData.last_sent_at = updates.lastSentAt
        if (updates.scheduledAt !== undefined) updateData.scheduled_date = updates.scheduledAt
        if (updates.qstashScheduleMessageId !== undefined) updateData.qstash_schedule_message_id = updates.qstashScheduleMessageId
        if (updates.qstashScheduleEnqueuedAt !== undefined) updateData.qstash_schedule_enqueued_at = updates.qstashScheduleEnqueuedAt
        if (updates.templateSnapshot !== undefined) updateData.template_snapshot = updates.templateSnapshot
        if (updates.templateSpecHash !== undefined) updateData.template_spec_hash = updates.templateSpecHash
        if (updates.templateParameterFormat !== undefined) updateData.template_parameter_format = updates.templateParameterFormat
        if (updates.templateFetchedAt !== undefined) updateData.template_fetched_at = updates.templateFetchedAt
        if (updates.folderId !== undefined) updateData.folder_id = updates.folderId

        updateData.updated_at = new Date().toISOString()

        const { error } = await supabase
            .from('campaigns')
            .update(updateData)
            .eq('id', id)

        if (error) throw error

        return campaignDb.getById(id)
    },

    pause: async (id: string): Promise<Campaign | undefined> => {
        return campaignDb.updateStatus(id, { status: CampaignStatus.PAUSED })
    },

    resume: async (id: string): Promise<Campaign | undefined> => {
        return campaignDb.updateStatus(id, {
            status: CampaignStatus.SENDING,
            startedAt: new Date().toISOString()
        })
    },

    start: async (id: string): Promise<Campaign | undefined> => {
        return campaignDb.updateStatus(id, {
            status: CampaignStatus.SENDING,
            startedAt: new Date().toISOString()
        })
    },
}

// ============================================================================
// CONTACTS
// ============================================================================

export const contactDb = {
    // Busca TODOS os contatos com paginação interna para evitar truncamento do PostgREST.
    // Usado pelo wizard de campanhas que precisa do dataset completo para calcular audiência.
    getAll: async (): Promise<Contact[]> => {
        const PAGE_SIZE = 1000
        const allRows: Record<string, unknown>[] = []
        let from = 0

        // Paginação interna: busca em lotes de PAGE_SIZE até esgotar os registros.
        // O PostgREST trunca silenciosamente em 1000 rows sem .range(), então
        // usamos .range() explícito e iteramos até receber menos que PAGE_SIZE.
        while (true) {
            const to = from + PAGE_SIZE - 1
            const { data, error } = await supabase
                .from('contacts')
                .select('*')
                .order('id', { ascending: true })
                .range(from, to)

            if (error) throw error

            const rows = data || []
            allRows.push(...rows)

            // Se recebemos menos que PAGE_SIZE, não há mais páginas
            if (rows.length < PAGE_SIZE) break

            from += PAGE_SIZE
        }

        return allRows.map(row => ({
            id: row.id as string,
            name: row.name as string,
            phone: row.phone as string,
            email: row.email as string | undefined,
            status: (row.status as ContactStatus) || ContactStatus.OPT_IN,
            tags: flattenTags(row.tags),
            lastActive: row.updated_at
                ? new Date(row.updated_at as string).toLocaleDateString()
                : (row.created_at ? new Date(row.created_at as string).toLocaleDateString() : '-'),
            createdAt: row.created_at as string,
            updatedAt: row.updated_at as string,
            custom_fields: row.custom_fields as Record<string, any> | undefined,
        }))
    },

    list: async (params: {
        limit: number
        offset: number
        search?: string | null
        status?: string | null
        tag?: string | null
    }): Promise<{ data: Contact[]; total: number }> => {
        const limit = Math.max(1, Math.min(100, Math.floor(params.limit || 10)))
        const offset = Math.max(0, Math.floor(params.offset || 0))
        const search = (params.search || '').trim()
        const status = (params.status || '').trim()
        const tag = (params.tag || '').trim()

        const buildContactSearchOr = (raw: string) => {
            const term = String(raw || '').trim()
            const like = `%${term}%`
            const digits = term.replace(/\D/g, '')

            const parts = [
                `name.ilike.${like}`,
                `email.ilike.${like}`,
                `phone.ilike.${like}`,
            ]

            if (digits && digits !== term) {
                parts.push(`phone.ilike.%${digits}%`)
            }

            return Array.from(new Set(parts.map((p) => p.trim()).filter(Boolean))).join(',')
        }

        // Helper para normalizar telefone (remove + se tiver)
        const normalizePhone = (phone: string) => {
            const p = String(phone || '').trim()
            return p.startsWith('+') ? p.slice(1) : p
        }

        // Pré-carrega supressões apenas para o filtro SUPPRESSED (precisa antes da query principal)
        // Para outros status, as supressões são carregadas depois da query para escopo por página.
        let preSuppressedPhonesNormalized = new Set<string>()
        if (status === 'SUPPRESSED') {
            // Busca todas as supressões ativas para montar o filtro IN da query principal.
            // Limitado a 5000 para evitar truncação silenciosa do PostgREST.
            const { data: preSupRows, error: preSupError } = await supabase
                .from('phone_suppressions')
                .select('phone')
                .eq('is_active', true)
                .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
                .limit(5000)

            if (preSupError) throw preSupError

            if ((preSupRows?.length ?? 0) >= 5000) {
                console.warn('contactDb.list(): limite de 5000 supressões atingido — filtro SUPPRESSED pode estar incompleto')
            }

            for (const row of preSupRows || []) {
                const phone = String(row.phone || '').trim()
                if (phone) preSuppressedPhonesNormalized.add(normalizePhone(phone))
            }
        }

        // Monta query base
        let query = supabase
            .from('contacts')
            .select('*', { count: 'exact' })

        if (search) {
            query = query.or(buildContactSearchOr(search))
        }

        if (tag && tag !== 'ALL') {
            if (tag === 'NONE' || tag === '__NO_TAGS__') {
                query = query.or('tags.is.null,tags.eq.[]')
            } else {
                query = query.filter('tags', 'cs', JSON.stringify([tag]))
            }
        }

        // Filtro de status com lógica especial para SUPPRESSED
        if (status === 'SUPPRESSED') {
            // Filtra apenas contatos que estão suprimidos
            if (preSuppressedPhonesNormalized.size === 0) {
                return { data: [], total: 0 }
            }
            // Gera variações com e sem + para o filtro IN
            const phoneVariations = Array.from(preSuppressedPhonesNormalized).flatMap(p => [p, '+' + p])
            query = query.in('phone', phoneVariations)
        } else if (status && status !== 'ALL') {
            query = query.eq('status', status)
        }

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (error) throw error

        // Busca supressões apenas para os phones da página atual.
        // Evita carregar 10.000+ supressões para exibir 10 contatos.
        const phonesOnPage = (data || []).map((c: any) => String(c.phone || '').trim()).filter(Boolean)

        const suppressionMap = new Map<string, { reason: string | null; source: string | null; expiresAt: string | null }>()

        if (phonesOnPage.length > 0) {
            // Gera variantes com/sem '+' para garantir match independente do formato armazenado
            const phoneVariants = new Set<string>()
            for (const phone of phonesOnPage) {
                const p = phone.trim()
                if (!p) continue
                phoneVariants.add(p)
                if (p.startsWith('+')) {
                    phoneVariants.add(p.slice(1))
                } else {
                    phoneVariants.add('+' + p)
                }
            }
            const phonesForSuppressionLookup = Array.from(phoneVariants)

            const { data: suppressionRows, error: suppressionError } = await supabase
                .from('phone_suppressions')
                .select('phone,is_active,expires_at,reason,source')
                .eq('is_active', true)
                .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
                .in('phone', phonesForSuppressionLookup)
                .limit(5000)

            if (suppressionError) throw suppressionError

            for (const row of suppressionRows || []) {
                const phone = String(row.phone || '').trim()
                if (phone) {
                    const normalized = normalizePhone(phone)
                    suppressionMap.set(normalized, {
                        reason: row.reason ?? null,
                        source: row.source ?? null,
                        expiresAt: row.expires_at ?? null,
                    })
                }
            }
        }

        return {
            data: (data || []).map(row => {
                const rowPhone = String(row.phone || '').trim()
                const normalizedRowPhone = normalizePhone(rowPhone)
                const suppression = suppressionMap.get(normalizedRowPhone) || null
                const isSuppressed = suppression !== null

                // Status efetivo: SUPRIMIDO tem prioridade sobre qualquer outro status
                const dbStatus = (row.status as ContactStatus) || ContactStatus.OPT_IN
                const effectiveStatus = isSuppressed ? ContactStatus.SUPPRESSED : dbStatus

                return ({
                    id: row.id,
                    name: row.name,
                    phone: row.phone,
                    email: row.email,
                    status: effectiveStatus, // Status visual calculado
                    originalStatus: dbStatus, // Status real do banco (para referência)
                    tags: flattenTags(row.tags),
                    lastActive: row.updated_at
                        ? new Date(row.updated_at).toLocaleDateString()
                        : (row.created_at ? new Date(row.created_at).toLocaleDateString() : '-'),
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                    custom_fields: row.custom_fields,
                    suppressionReason: suppression?.reason ?? null,
                    suppressionSource: suppression?.source ?? null,
                    suppressionExpiresAt: suppression?.expiresAt ?? null,
                })
            }),
            total: count || 0,
        }
    },

    getIds: async (params: {
        search?: string | null
        status?: string | null
        tag?: string | null
    }): Promise<string[]> => {
        const search = (params.search || '').trim()
        const status = (params.status || '').trim()
        const tag = (params.tag || '').trim()

        const buildContactSearchOr = (raw: string) => {
            const term = String(raw || '').trim()
            const like = `%${term}%`
            const digits = term.replace(/\D/g, '')

            const parts = [
                `name.ilike.${like}`,
                `email.ilike.${like}`,
                `phone.ilike.${like}`,
            ]

            if (digits && digits !== term) {
                parts.push(`phone.ilike.%${digits}%`)
            }

            return Array.from(new Set(parts.map((p) => p.trim()).filter(Boolean))).join(',')
        }

        // Pré-carrega supressões se necessário (antes de construir a query)
        let suppressedPhones: string[] = []
        if (status === 'SUPPRESSED') {
            const { data: suppressionRows, error: suppressionError } = await supabase
                .from('phone_suppressions')
                .select('phone')
                .eq('is_active', true)
                .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())

            if (suppressionError) throw suppressionError

            suppressedPhones = (suppressionRows || [])
                .map((row: any) => String(row.phone || '').trim().replace(/^\+/, ''))
                .filter(Boolean)

            if (!suppressedPhones.length) return []

            // Gera variantes com/sem '+' para match com contacts.phone (formato inconsistente)
            suppressedPhones = suppressedPhones.flatMap(p => [p, '+' + p])
        }

        // Função que reconstrói a query com todos os filtros + range (evita mutação do builder)
        const buildQuery = (from: number, to: number) => {
            let q = supabase.from('contacts').select('id').order('id', { ascending: true }).range(from, to)

            if (search) q = q.or(buildContactSearchOr(search))

            if (status && status !== 'ALL' && status !== 'SUPPRESSED') {
                q = q.eq('status', status)
            }

            if (tag && tag !== 'ALL') {
                if (tag === 'NONE' || tag === '__NO_TAGS__') {
                    q = q.or('tags.is.null,tags.eq.[]')
                } else {
                    q = q.filter('tags', 'cs', JSON.stringify([tag]))
                }
            }

            // SUPPRESSED é tratado no caminho separado com chunking (ver abaixo).
            // Esta função só é chamada para status != 'SUPPRESSED'.

            return q
        }

        // Para status SUPPRESSED com muitos phones suprimidos, .in('phone', suppressedPhones)
        // serializa todos na URL e estoura o limite de 8KB do Cloudflare (HTTP 414).
        // Fix: divide em chunks de 100 phones, faz queries paralelas e une os IDs únicos.
        if (status === 'SUPPRESSED' && suppressedPhones.length > 0) {
            const PHONE_CHUNK_SIZE = 100
            const phoneChunks = chunk(suppressedPhones, PHONE_CHUNK_SIZE)

            const allIds: string[] = []
            const seen = new Set<string>()

            // Processa cada chunk de phones com concorrência limitada para obter os IDs de contatos
            const CONCURRENT_LIMIT = 5
            const chunkResults: string[][] = []
            for (let i = 0; i < phoneChunks.length; i += CONCURRENT_LIMIT) {
                const batch = phoneChunks.slice(i, i + CONCURRENT_LIMIT)
                const batchResults = await Promise.all(
                    batch.map(async (phones) => {
                        const chunkIds: string[] = []
                        let chunkOffset = 0
                        const PAGE_SIZE = 1000

                        while (true) {
                            let q = supabase.from('contacts').select('id').order('id', { ascending: true }).range(chunkOffset, chunkOffset + PAGE_SIZE - 1)

                            if (search) q = q.or(buildContactSearchOr(search))

                            if (tag && tag !== 'ALL') {
                                if (tag === 'NONE' || tag === '__NO_TAGS__') {
                                    q = q.or('tags.is.null,tags.eq.[]')
                                } else {
                                    q = q.filter('tags', 'cs', JSON.stringify([tag]))
                                }
                            }

                            q = q.in('phone', phones)

                            const { data, error } = await q
                            if (error) throw error

                            const rows = data || []
                            chunkIds.push(...rows.map((row: any) => String(row.id)))

                            if (rows.length < PAGE_SIZE) break
                            chunkOffset += PAGE_SIZE
                        }

                        return chunkIds
                    })
                )
                chunkResults.push(...batchResults)
            }

            for (const ids of chunkResults) {
                for (const id of ids) {
                    if (!seen.has(id)) {
                        seen.add(id)
                        allIds.push(id)
                    }
                }
            }

            return allIds
        }

        // Pagina em blocos de 1000 para contornar o limite padrão do PostgREST
        const PAGE_SIZE = 1000
        const allIds: string[] = []
        let offset = 0

        while (true) {
            const { data, error } = await buildQuery(offset, offset + PAGE_SIZE - 1)

            if (error) throw error

            const rows = data || []
            allIds.push(...rows.map((row: any) => String(row.id)))

            if (rows.length < PAGE_SIZE) break
            offset += PAGE_SIZE
        }

        return allIds
    },

    getById: async (id: string): Promise<Contact | undefined> => {
        const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) return undefined

        return {
            id: data.id,
            name: data.name,
            phone: data.phone,
            email: data.email,
            status: (data.status as ContactStatus) || ContactStatus.OPT_IN,
            tags: flattenTags(data.tags),
            lastActive: data.updated_at
                ? new Date(data.updated_at).toLocaleDateString()
                : (data.created_at ? new Date(data.created_at).toLocaleDateString() : '-'),
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            custom_fields: data.custom_fields,
        }
    },

    getByPhone: async (phone: string): Promise<Contact | undefined> => {
        const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('phone', phone)
            .single()

        if (error || !data) return undefined

        return {
            id: data.id,
            name: data.name,
            phone: data.phone,
            email: data.email,
            status: (data.status as ContactStatus) || ContactStatus.OPT_IN,
            tags: flattenTags(data.tags),
            lastActive: data.updated_at
                ? new Date(data.updated_at).toLocaleDateString()
                : (data.created_at ? new Date(data.created_at).toLocaleDateString() : '-'),
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            custom_fields: data.custom_fields,
        }
    },

    upsertMergeTagsByPhone: async (
        contact: Omit<Contact, 'id' | 'lastActive'>,
        tagsToMerge: string[]
    ): Promise<Contact> => {
        const normalizeTag = (t: string) => t.trim()
        const uniq = (arr: string[]) => Array.from(new Set(arr.map(normalizeTag).filter(Boolean)))

        const mergeCustomFields = (base: any, patch: any) => {
            const a = (base && typeof base === 'object') ? base : {}
            const b = (patch && typeof patch === 'object') ? patch : {}
            return { ...a, ...b }
        }

        const now = new Date().toISOString()

        const { data: existing } = await supabase
            .from('contacts')
            .select('*')
            .eq('phone', contact.phone)
            .single()

        if (existing) {
            const mergedTags = uniq([...flattenTags(existing.tags), ...(contact.tags || []), ...tagsToMerge])
            const mergedCustomFields = mergeCustomFields(existing.custom_fields, contact.custom_fields)
            const updateData: any = {
                updated_at: now,
                tags: mergedTags,
                custom_fields: mergedCustomFields,
            }

            if (contact.name) updateData.name = contact.name
            if (contact.email !== undefined) updateData.email = contact.email
            if (contact.status) updateData.status = contact.status
            // custom_fields já foi mesclado acima (não sobrescreve campos antigos)

            const { error: updateError } = await supabase
                .from('contacts')
                .update(updateData)
                .eq('id', existing.id)

            if (updateError) throw updateError

            return {
                id: existing.id,
                name: contact.name || existing.name,
                phone: existing.phone,
                email: contact.email ?? existing.email,
                status: (contact.status || existing.status) as ContactStatus,
                tags: mergedTags,
                custom_fields: mergedCustomFields,
                lastActive: 'Agora mesmo',
                createdAt: existing.created_at,
                updatedAt: now,
            }
        }

        const id = generateId()
        const mergedTags = uniq([...(contact.tags || []), ...tagsToMerge])

        const { error } = await supabase
            .from('contacts')
            .insert({
                id,
                name: contact.name || '',
                phone: contact.phone,
                email: contact.email || null,
                status: contact.status || ContactStatus.OPT_IN,
                tags: mergedTags,
                custom_fields: contact.custom_fields || {},
                created_at: now,
            })

        if (error) throw error

        return {
            ...contact,
            id,
            tags: mergedTags,
            lastActive: 'Agora mesmo',
            createdAt: now,
            updatedAt: now,
        }
    },

    add: async (contact: Omit<Contact, 'id' | 'lastActive'>): Promise<Contact> => {
        // Check if contact already exists by phone
        const { data: existing } = await supabase
            .from('contacts')
            .select('*')
            .eq('phone', contact.phone)
            .single()

        const now = new Date().toISOString()

        if (existing) {
            // Update existing contact
            const updateData: any = {
                updated_at: now
            }

            if (contact.name) updateData.name = contact.name
            if (contact.email !== undefined) updateData.email = contact.email
            if (contact.status) updateData.status = contact.status
            if (contact.tags) updateData.tags = flattenTags(contact.tags)
            if (contact.custom_fields) updateData.custom_fields = contact.custom_fields

            const { error: updateError } = await supabase
                .from('contacts')
                .update(updateData)
                .eq('id', existing.id)

            if (updateError) throw updateError

            return {
                id: existing.id,
                name: contact.name || existing.name,
                phone: existing.phone,
                email: contact.email ?? existing.email,
                status: (contact.status || existing.status) as ContactStatus,
                tags: flattenTags(contact.tags || existing.tags || []),
                custom_fields: contact.custom_fields || existing.custom_fields || {},
                lastActive: 'Agora mesmo',
                createdAt: existing.created_at,
                updatedAt: now,
            }
        }

        // Create new contact
        const id = generateId()

        const { error } = await supabase
            .from('contacts')
            .insert({
                id,
                name: contact.name || '',
                phone: contact.phone,
                email: contact.email || null,
                status: contact.status || ContactStatus.OPT_IN,
                tags: flattenTags(contact.tags),
                custom_fields: contact.custom_fields || {},
                created_at: now,
            })

        if (error) throw error

        return {
            ...contact,
            id,
            lastActive: 'Agora mesmo',
            createdAt: now,
            updatedAt: now,
        }
    },

    update: async (id: string, data: Partial<Contact>): Promise<Contact | undefined> => {
        const updateData: Record<string, unknown> = {}

        if (data.name !== undefined) updateData.name = data.name
        if (data.phone !== undefined) updateData.phone = data.phone
        if (data.email !== undefined) updateData.email = data.email
        if (data.status !== undefined) updateData.status = data.status
        if (data.tags !== undefined) updateData.tags = flattenTags(data.tags)
        if (data.custom_fields !== undefined) updateData.custom_fields = data.custom_fields

        updateData.updated_at = new Date().toISOString()

        const { error } = await supabase
            .from('contacts')
            .update(updateData)
            .eq('id', id)

        if (error) throw error

        // Se o status foi alterado para OPT_IN, desativa a supressão automática
        if (data.status === ContactStatus.OPT_IN) {
            const contact = await contactDb.getById(id)
            if (contact?.phone) {
                await supabase
                    .from('phone_suppressions')
                    .update({ is_active: false })
                    .eq('phone', contact.phone)
            }
            return contact
        }

        return contactDb.getById(id)
    },

    // Aplica um campo customizado (merge) em vários contatos.
    // Estratégia: lê a linha inteira em lote e faz upsert com a linha completa,
    // apenas alterando `custom_fields`.
    //
    // Motivo: Postgres pode validar constraints (ex.: NOT NULL em `phone`) no tuple
    // do INSERT do UPSERT antes de resolver o conflito. Então um upsert “parcial”
    // (id + custom_fields) pode falhar com erro de NOT NULL.
    bulkSetCustomField: async (
        ids: string[],
        key: string,
        value: string
    ): Promise<{ updated: number; notFound: string[] }> => {
        const contactIds = Array.from(new Set((ids || []).map((v) => String(v || '').trim()).filter(Boolean)))
        const k = String(key || '').trim()
        const v = String(value ?? '').trim()
        if (contactIds.length === 0) return { updated: 0, notFound: [] }
        if (!k) return { updated: 0, notFound: contactIds }
        if (!v) return { updated: 0, notFound: [] }

        // BUG FIX: .in('id', contactIds) com centenas de IDs serializa todos na URL
        // e estoura o limite de 8KB do Cloudflare (HTTP 414).
        // Fix: divide em chunks de 150 IDs, faz queries paralelas, une os resultados.
        const ID_CHUNK_SIZE = 150
        const allData: any[] = []
        const idChunks = chunk(contactIds, ID_CHUNK_SIZE)

        const CONCURRENT_LIMIT = 5
        for (let i = 0; i < idChunks.length; i += CONCURRENT_LIMIT) {
            const batch = idChunks.slice(i, i + CONCURRENT_LIMIT)
            const batchResults = await Promise.all(
                batch.map(async (idBatch) => {
                    const { data: batchData, error: batchError } = await supabase
                        .from('contacts')
                        .select('*')
                        .in('id', idBatch)
                    if (batchError) throw batchError
                    return batchData || []
                })
            )
            for (const result of batchResults) {
                allData.push(...result)
            }
        }

        const data = allData
        const now = new Date().toISOString()
        const rows = (data || []).map((row: any) => {
            const base = (row.custom_fields && typeof row.custom_fields === 'object') ? row.custom_fields : {}
            const merged = { ...(base as any), [k]: v }

            // Mantém todos os campos existentes e atualiza apenas `custom_fields`.
            // Isso garante que o UPSERT não quebre constraints de colunas obrigatórias.
            return {
                ...row,
                custom_fields: merged,
                updated_at: now,
            }
        })

        const foundIds = new Set((data || []).map((r: any) => String(r.id)))
        const notFound = contactIds.filter((id) => !foundIds.has(id))

        if (rows.length === 0) {
            return { updated: 0, notFound }
        }

        const { error: upsertError } = await supabase
            .from('contacts')
            .upsert(rows as any, { onConflict: 'id' })

        if (upsertError) throw upsertError

        return { updated: rows.length, notFound }
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('contacts')
            .delete()
            .eq('id', id)

        if (error) throw error
    },

    // Deleta vários contatos via RPC para evitar 414 Request-URI Too Large.
    // .delete().in('id', ids) gera URL longa com todos os IDs; RPC usa POST body.
    deleteMany: async (ids: string[]): Promise<number> => {
        if (ids.length === 0) return 0

        const { data, error } = await supabase.rpc('bulk_delete_contacts', {
            p_ids: ids,
        })

        if (error) throw error
        return (data as number) || 0
    },

    // Atualiza as tags de vários contatos em lote via RPC.
    // Estratégia: (tags_atuais ∪ tagsToAdd) − tagsToRemove para cada contato.
    // Usa RPC (POST body) para evitar 414 Request-URI Too Large com .in('id', uuids[])
    // e NOT NULL constraint violation no upsert parcial.
    bulkUpdateTags: async (
        ids: string[],
        tagsToAdd: string[],
        tagsToRemove: string[]
    ): Promise<number> => {
        if (ids.length === 0) return 0

        const { data, error } = await supabase.rpc('bulk_update_contact_tags', {
            p_ids: ids,
            p_tags_to_add: tagsToAdd,
            p_tags_to_remove: tagsToRemove,
        })

        if (error) throw error
        return (data as number) || 0
    },

    // Atualiza o status de vários contatos em lote para o mesmo valor.
    // Estratégia OPT_IN: desativa phone_suppressions para os números atualizados.
    bulkUpdateStatus: async (
        ids: string[],
        status: ContactStatus
    ): Promise<number> => {
        if (ids.length === 0) return 0

        const { data, error } = await supabase
            .from('contacts')
            .update({ status, updated_at: new Date().toISOString() })
            .in('id', ids)
            .select('id, phone')

        if (error) throw error

        const updated = data?.length ?? 0

        // OPT_IN: desativar phone_suppressions para esses números (normaliza para E.164)
        if (status === ContactStatus.OPT_IN && updated > 0) {
            const phones = (data || [])
                .map((c) => c.phone)
                .filter(Boolean)
                .map((p) => normalizePhoneNumber(p))
                .filter((p) => validatePhoneNumber(p))
            if (phones.length > 0) {
                const { error: suppressionError } = await supabase
                    .from('phone_suppressions')
                    .update({ is_active: false })
                    .in('phone', phones)
                if (suppressionError) {
                    // Falha intencional não-propagada: o UPDATE de contacts já foi commitado
                    // e não pode ser revertido sem uma transação atômica (RPC). Lançar aqui
                    // retornaria 500 ao caller mas o status já estaria alterado no DB, o que
                    // seria mais confuso do que um soft-failure silencioso.
                    // TODO: mover ambos os UPDATEs para uma RPC Supabase para garantir atomicidade.
                    console.error('Erro ao desativar phone_suppressions:', suppressionError)
                }
            }
        }

        return updated
    },

    import: async (contacts: Omit<Contact, 'id' | 'lastActive'>[]): Promise<{ inserted: number; updated: number }> => {
        if (contacts.length === 0) return { inserted: 0, updated: 0 }

        // Tamanho máximo de cada lote para evitar estouro de URL/payload no Supabase
        const BATCH_SIZE = 500

        // Helper: divide array em lotes de N
        const chunk = <T>(arr: T[], size: number): T[][] =>
            Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
                arr.slice(i * size, i * size + size)
            )

        const now = new Date().toISOString()

        // Normaliza telefone para E.164 usando a mesma lógica do normalizePhoneNumber
        // Garante que números como "5524999402004" virem "+5524999402004"
        // Sempre usa só os dígitos para evitar mismatch de deduplicação
        // ex: "+55 (11) 9999-0001" e "+5511999990001" seriam tratados como contatos diferentes
        const normalizePhone = (p: string): string => {
            if (!p || typeof p !== 'string') return ''
            const digits = p.replace(/\D/g, '')
            if (!digits) return ''
            return `+${digits}`
        }

        // Normaliza e filtra contatos com telefone inválido (vazio ou só "+")
        const normalizedContacts = contacts
            .map(c => ({ ...c, phone: normalizePhone(c.phone) }))
            .filter(c => c.phone.length > 2) // mínimo "+X" válido tem pelo menos 3 chars

        if (normalizedContacts.length === 0) return { inserted: 0, updated: 0 }

        const phones = [...new Set(normalizedContacts.map(c => c.phone))]

        // Busca contatos existentes em lotes para evitar URL muito longa (limite ~8KB)
        const allExisting: any[] = []
        for (const batch of chunk(phones, BATCH_SIZE)) {
            const { data, error } = await supabase
                .from('contacts')
                .select('id, phone, name, email, tags, custom_fields')
                .in('phone', batch)
            if (error) throw error
            if (data) allExisting.push(...data)
        }

        const existingByPhone = new Map(allExisting.map(c => [c.phone, c]))

        const toInsertMap = new Map<string, any>() // chave: phone — dedup automático
        const toUpdateMap = new Map<string, any>() // chave: id   — dedup automático

        for (const contact of normalizedContacts) {
            const existing = existingByPhone.get(contact.phone)

            if (existing) {
                // Merge: combina tags e custom_fields, preserva dados existentes
                const existingTags = flattenTags(existing.tags)
                const newTags = flattenTags(contact.tags)
                const mergedTags = [...new Set([...existingTags, ...newTags])]

                const existingCustomFields =
                    existing.custom_fields && typeof existing.custom_fields === 'object' && !Array.isArray(existing.custom_fields)
                        ? existing.custom_fields
                        : {}
                const newCustomFields =
                    (contact as any).custom_fields && typeof (contact as any).custom_fields === 'object' && !Array.isArray((contact as any).custom_fields)
                        ? (contact as any).custom_fields
                        : {}

                toUpdateMap.set(existing.id, {
                    id: existing.id,
                    phone: contact.phone,
                    name: contact.name || existing.name || '',
                    email: (contact as any).email || existing.email || null,
                    tags: mergedTags,
                    custom_fields: { ...existingCustomFields, ...newCustomFields },
                    updated_at: now,
                })
            } else {
                // Novo contato — se phone já está no Map, última linha do CSV prevalece
                toInsertMap.set(contact.phone, {
                    id: generateId(),
                    name: contact.name || '',
                    phone: contact.phone,
                    email: (contact as any).email || null,
                    status: contact.status || ContactStatus.OPT_IN,
                    tags: [...new Set(flattenTags(contact.tags))], // deduplica tags
                    custom_fields: (contact as any).custom_fields || {},
                    created_at: now,
                })
            }
        }

        const deduplicatedInsert = Array.from(toInsertMap.values())
        const deduplicatedUpdate = Array.from(toUpdateMap.values())

        // Insere novos em lotes para não estourar payload do Supabase
        let insertedCount = 0
        for (const batch of chunk(deduplicatedInsert, BATCH_SIZE)) {
            const { error } = await supabase.from('contacts').insert(batch)
            if (error) throw error
            insertedCount += batch.length
        }

        // Atualiza existentes em lotes
        let updatedCount = 0
        for (const batch of chunk(deduplicatedUpdate, BATCH_SIZE)) {
            const { error } = await supabase
                .from('contacts')
                .upsert(batch, { onConflict: 'id' })
            if (error) throw error
            updatedCount += batch.length
        }

        return { inserted: insertedCount, updated: updatedCount }
    },

    getTags: async (): Promise<string[]> => {
        // Usa RPC para extrair tags únicas diretamente no SQL (evita carregar todos contatos)
        const { data, error } = await supabase.rpc('get_contact_tags')

        if (error) {
            console.error('Failed to get contact tags:', error)
            throw error
        }

        if (Array.isArray(data)) return flattenTags(data)
        // Fallback: PostgREST pode retornar JSON string em versões diferentes
        if (typeof data === 'string') {
            try {
                const parsed = JSON.parse(data)
                return Array.isArray(parsed) ? flattenTags(parsed) : []
            } catch {
                return []
            }
        }
        return []
    },

    getStats: async () => {
        // Usa RPC para contar no SQL (evita carregar todos contatos em memória)
        const { data, error } = await supabase.rpc('get_contact_stats')

        if (error) {
            console.error('Failed to get contact stats:', error)
            throw error
        }

        return {
            total: data?.total || 0,
            optIn: data?.optIn || 0,
            optOut: data?.optOut || 0,
        }
    },
}

// ============================================================================
// LEAD FORMS (Captação de contatos)
// ============================================================================

export const leadFormDb = {
    getAll: async (): Promise<LeadForm[]> => {
        const { data, error } = await supabase
            .from('lead_forms')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw error

        return (data || []).map((row: any) => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            tag: row.tag,
            isActive: !!row.is_active,
            collectEmail: row.collect_email ?? true,
            successMessage: row.success_message ?? null,
            webhookToken: row.webhook_token ?? null,
            fields: Array.isArray(row.fields) ? row.fields : [],
            createdAt: row.created_at,
            updatedAt: row.updated_at ?? null,
        }))
    },

    getById: async (id: string): Promise<LeadForm | undefined> => {
        const { data, error } = await supabase
            .from('lead_forms')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) return undefined

        return {
            id: data.id,
            name: data.name,
            slug: data.slug,
            tag: data.tag,
            isActive: !!(data as any).is_active,
            collectEmail: (data as any).collect_email ?? true,
            successMessage: (data as any).success_message ?? null,
            webhookToken: (data as any).webhook_token ?? null,
            fields: Array.isArray((data as any).fields) ? (data as any).fields : [],
            createdAt: (data as any).created_at,
            updatedAt: (data as any).updated_at ?? null,
        }
    },

    getBySlug: async (slug: string): Promise<LeadForm | undefined> => {
        const { data, error } = await supabase
            .from('lead_forms')
            .select('*')
            .eq('slug', slug)
            .single()

        if (error || !data) return undefined

        return {
            id: data.id,
            name: data.name,
            slug: data.slug,
            tag: data.tag,
            isActive: !!(data as any).is_active,
            collectEmail: (data as any).collect_email ?? true,
            successMessage: (data as any).success_message ?? null,
            webhookToken: (data as any).webhook_token ?? null,
            fields: Array.isArray((data as any).fields) ? (data as any).fields : [],
            createdAt: (data as any).created_at,
            updatedAt: (data as any).updated_at ?? null,
        }
    },

    create: async (dto: CreateLeadFormDTO): Promise<LeadForm> => {
        const now = new Date().toISOString()
        const id = `lf_${generateId().replace(/-/g, '')}`
        const webhookToken = generateWebhookToken()

        const { error } = await supabase
            .from('lead_forms')
            .insert({
                id,
                name: dto.name,
                slug: dto.slug,
                tag: dto.tag,
                is_active: dto.isActive ?? true,
                collect_email: dto.collectEmail ?? true,
                success_message: dto.successMessage ?? null,
                webhook_token: webhookToken,
                fields: dto.fields || [],
                created_at: now,
                updated_at: now,
            })

        if (error) throw error

        return {
            id,
            name: dto.name,
            slug: dto.slug,
            tag: dto.tag,
            isActive: dto.isActive ?? true,
            collectEmail: dto.collectEmail ?? true,
            successMessage: dto.successMessage ?? null,
            webhookToken,
            fields: dto.fields || [],
            createdAt: now,
            updatedAt: now,
        }
    },

    update: async (id: string, dto: UpdateLeadFormDTO): Promise<LeadForm | undefined> => {
        const updateData: Record<string, unknown> = {}

        if (dto.name !== undefined) updateData.name = dto.name
        if (dto.slug !== undefined) updateData.slug = dto.slug
        if (dto.tag !== undefined) updateData.tag = dto.tag
        if (dto.isActive !== undefined) updateData.is_active = dto.isActive
        if ((dto as any).collectEmail !== undefined) updateData.collect_email = (dto as any).collectEmail
        if (dto.successMessage !== undefined) updateData.success_message = dto.successMessage
        if ((dto as any).fields !== undefined) updateData.fields = (dto as any).fields
        updateData.updated_at = new Date().toISOString()

        const { error } = await supabase
            .from('lead_forms')
            .update(updateData)
            .eq('id', id)

        if (error) throw error

        return leadFormDb.getById(id)
    },

    rotateWebhookToken: async (id: string): Promise<LeadForm | undefined> => {
        const token = generateWebhookToken()

        const { error } = await supabase
            .from('lead_forms')
            .update({ webhook_token: token, updated_at: new Date().toISOString() })
            .eq('id', id)

        if (error) throw error
        return leadFormDb.getById(id)
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('lead_forms')
            .delete()
            .eq('id', id)

        if (error) throw error
    },
}

// ============================================================================
// CAMPAIGN CONTACTS (Junction Table)
// ============================================================================

export const campaignContactDb = {
    addContacts: async (
        campaignId: string,
        contacts: { contactId: string, phone: string, name: string, email?: string | null, custom_fields?: Record<string, unknown> }[]
    ): Promise<void> => {
        const rows = contacts.map(contact => ({
            id: generateId(),
            campaign_id: campaignId,
            contact_id: contact.contactId,
            phone: contact.phone,
            name: contact.name,
            email: contact.email || null,
            custom_fields: contact.custom_fields || {},
            status: 'pending',
        }))

        const { error } = await supabase
            .from('campaign_contacts')
            .insert(rows)

        if (error) throw error
    },

    // LEGADO: esta função carrega no máximo 1000 registros e deve ser evitada
    // para campanhas com muitos contatos. Implemente paginação no consumidor se necessário.
    getContacts: async (campaignId: string) => {
        // Limite explícito: sem .limit() o PostgREST silenciosamente trunca em 1000 rows.
        const { data, error } = await supabase
            .from('campaign_contacts')
            .select('*')
            .eq('campaign_id', campaignId)
            .order('sent_at', { ascending: false })
            .limit(1000)

        if (error) throw error

        return (data || []).map(row => ({
            id: row.id,
            campaignId: row.campaign_id,
            contactId: row.contact_id,
            phone: row.phone,
            name: row.name,
            status: row.status,
            messageId: row.message_id,
            sentAt: row.sent_at,
            deliveredAt: row.delivered_at,
            readAt: row.read_at,
            error: row.error,
            custom_fields: (row as any).custom_fields,
        }))
    },

    updateStatus: async (campaignId: string, phone: string, status: string, messageId?: string, error?: string): Promise<void> => {
        const now = new Date().toISOString()
        const updateData: Record<string, unknown> = { status }

        if (messageId) updateData.message_id = messageId
        if (error) updateData.error = error
        if (status === 'sent') updateData.sent_at = now
        if (status === 'delivered') updateData.delivered_at = now
        if (status === 'read') updateData.read_at = now

        const { error: dbError } = await supabase
            .from('campaign_contacts')
            .update(updateData)
            .eq('campaign_id', campaignId)
            .eq('phone', phone)

        if (dbError) throw dbError
    },
}

// ============================================================================
// TEMPLATES
// ============================================================================

const normalizeTemplateFormat = (format: unknown): TemplateComponent['format'] | undefined => {
    if (typeof format !== 'string') return undefined
    const normalized = format.toUpperCase()
    if (normalized === 'TEXT' || normalized === 'IMAGE' || normalized === 'VIDEO' || normalized === 'DOCUMENT' || normalized === 'GIF') {
        return normalized as TemplateComponent['format']
    }
    return undefined
}

const normalizeTemplateComponents = (input: unknown): TemplateComponent[] => {
    if (!input) return []
    if (Array.isArray(input)) return input as TemplateComponent[]
    if (typeof input === 'string') {
        try {
            const parsed = JSON.parse(input)
            return normalizeTemplateComponents(parsed)
        } catch {
            return [{ type: 'BODY', text: input }]
        }
    }
    if (typeof input !== 'object') return []

    const value = input as any
    if (Array.isArray(value.components)) {
        return value.components as TemplateComponent[]
    }

    const components: TemplateComponent[] = []
    const header = value.header
    const body = value.body
    const footer = value.footer
    const buttons = value.buttons

    if (header) {
        if (typeof header === 'string') {
            components.push({ type: 'HEADER', format: 'TEXT', text: header })
        } else if (typeof header === 'object') {
            const headerComponent: TemplateComponent = { type: 'HEADER' }
            const format = normalizeTemplateFormat(header.format)
            if (format) headerComponent.format = format
            if (typeof header.text === 'string') headerComponent.text = header.text
            if (header.example !== undefined) headerComponent.example = header.example
            components.push(headerComponent)
        }
    }

    if (body !== undefined) {
        if (typeof body === 'string') {
            components.push({ type: 'BODY', text: body })
        } else if (typeof body === 'object') {
            const bodyComponent: TemplateComponent = { type: 'BODY' }
            if (typeof body.text === 'string') bodyComponent.text = body.text
            if (body.example !== undefined) bodyComponent.example = body.example
            components.push(bodyComponent)
        }
    } else if (typeof value.content === 'string') {
        components.push({ type: 'BODY', text: value.content })
    }

    if (footer) {
        if (typeof footer === 'string') {
            components.push({ type: 'FOOTER', text: footer })
        } else if (typeof footer === 'object') {
            const footerText = typeof footer.text === 'string' ? footer.text : undefined
            if (footerText) {
                components.push({ type: 'FOOTER', text: footerText })
            }
        }
    }

    if (Array.isArray(buttons)) {
        components.push({ type: 'BUTTONS', buttons })
    }

    return components
}

const getTemplateBodyText = (components: TemplateComponent[], raw: unknown): string => {
    const bodyComponent = components.find(c => c.type === 'BODY' && typeof c.text === 'string')
    if (bodyComponent?.text) return bodyComponent.text

    if (raw && typeof raw === 'object') {
        const maybe = raw as any
        if (typeof maybe.content === 'string') return maybe.content
        if (maybe.body && typeof maybe.body.text === 'string') return maybe.body.text
    }

    return ''
}

const normalizeParameterFormat = (value: unknown): 'positional' | 'named' | undefined => {
    if (value === null || value === undefined) return undefined
    const normalized = String(value).toLowerCase()
    return normalized === 'named' ? 'named' : 'positional'
}

export const templateDb = {
    getAll: async (): Promise<Template[]> => {
        const { data, error } = await supabase
            .from('templates')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw error

        return (data || []).map(row => {
            let components = normalizeTemplateComponents(row.components)
            const bodyText = getTemplateBodyText(components, row.components)

            // Injetar header_location no component HEADER se existir
            const headerLocation = (row as any).header_location
            if (headerLocation && typeof headerLocation === 'object') {
                components = components.map(c => {
                    if (c.type === 'HEADER' && c.format === 'LOCATION') {
                        return { ...c, location: headerLocation }
                    }
                    return c
                })
            }

            return {
                id: row.id,
                name: row.name,
                category: canonicalTemplateCategory(row.category),
                language: row.language,
                status: (row.status as TemplateStatus) || 'PENDING',
                parameterFormat: normalizeParameterFormat((row as any).parameter_format),
                specHash: (row as any).spec_hash ?? null,
                fetchedAt: (row as any).fetched_at ?? null,
                headerMediaId: (row as any).header_media_id ?? null,
                headerMediaHash: (row as any).header_media_hash ?? null,
                headerMediaPreviewUrl: (row as any).header_media_preview_url ?? null,
                headerMediaPreviewExpiresAt: (row as any).header_media_preview_expires_at ?? null,
                content: bodyText,
                preview: bodyText,
                lastUpdated: row.updated_at || row.created_at,
                components,
            }
        })
    },

    getByName: async (name: string): Promise<Template | undefined> => {
        const { data, error } = await supabase
            .from('templates')
            .select('*')
            .eq('name', name)
            .single()

        if (error || !data) return undefined

        let components = normalizeTemplateComponents(data.components)
        const bodyText = getTemplateBodyText(components, data.components)

        // Injetar header_location no component HEADER se existir
        const headerLocation = (data as any).header_location
        if (headerLocation && typeof headerLocation === 'object') {
            components = components.map(c => {
                if (c.type === 'HEADER' && c.format === 'LOCATION') {
                    return { ...c, location: headerLocation }
                }
                return c
            })
        }

        return {
            id: data.id,
            name: data.name,
            category: canonicalTemplateCategory(data.category),
            language: data.language,
            status: (data.status as TemplateStatus) || 'PENDING',
            parameterFormat: normalizeParameterFormat((data as any).parameter_format),
            specHash: (data as any).spec_hash ?? null,
            fetchedAt: (data as any).fetched_at ?? null,
            headerMediaId: (data as any).header_media_id ?? null,
            headerMediaHash: (data as any).header_media_hash ?? null,
            headerMediaPreviewUrl: (data as any).header_media_preview_url ?? null,
            headerMediaPreviewExpiresAt: (data as any).header_media_preview_expires_at ?? null,
            content: bodyText,
            preview: bodyText,
            lastUpdated: data.updated_at || data.created_at,
            components,
        }
    },

    upsert: async (
        input:
            | Template
            | Array<{
                name: string
                language?: string
                category?: string
                status?: string
                components?: unknown
                parameter_format?: 'positional' | 'named' | string
                spec_hash?: string | null
                fetched_at?: string | null
              }>
    ): Promise<void> => {
        const now = new Date().toISOString()

        // Batch upsert (rows already in DB column format)
        if (Array.isArray(input)) {
            const { error } = await supabase
                .from('templates')
                .upsert(
                    input.map(r => ({
                        name: r.name,
                        category: r.category,
                        language: r.language,
                        status: r.status,
                        parameter_format: (r as any).parameter_format,
                        components: r.components,
                        spec_hash: (r as any).spec_hash ?? null,
                        fetched_at: (r as any).fetched_at ?? null,
                        updated_at: now,
                    })),
                    { onConflict: 'name,language' }
                )
            if (error) throw error
            return
        }

        // Single template upsert (App Template shape)
        const template = input

        const { error } = await supabase
            .from('templates')
            .upsert({
                id: template.id,
                name: template.name,
                category: template.category,
                language: template.language,
                status: template.status,
                parameter_format: normalizeParameterFormat((template as any).parameterFormat) || 'positional',
                components: typeof template.content === 'string'
                    ? JSON.parse(template.content)
                    : template.content,
                spec_hash: (template as any).specHash ?? null,
                fetched_at: (template as any).fetchedAt ?? null,
                created_at: now,
                updated_at: now,
            }, { onConflict: 'name,language' })

        if (error) throw error
    },
}

// ============================================================================
// CUSTOM FIELD DEFINITIONS
// ============================================================================

export const customFieldDefDb = {
    getAll: async (entityType: 'contact' | 'deal'): Promise<CustomFieldDefinition[]> => {
        const { data, error } = await supabase
            .from('custom_field_definitions')
            .select('*')
            .eq('entity_type', entityType)
            .order('created_at', { ascending: false })

        if (error) throw error

        return (data || []).map(row => ({
            id: row.id,
            key: row.key,
            label: row.label,
            type: row.type,
            options: row.options,
            entity_type: row.entity_type,
            created_at: row.created_at,
        }))
    },

    create: async (def: Omit<CustomFieldDefinition, 'id' | 'created_at'>): Promise<CustomFieldDefinition> => {
        const id = generateId()
        const now = new Date().toISOString()


        // Fetch organization_id (company_id) from settings
        const { data: orgData } = await supabase.from('settings').select('value').eq('key', 'company_id').single()
        const organization_id = orgData?.value

        const { data, error } = await supabase
            .from('custom_field_definitions')
            .insert({
                id,
                key: def.key,
                label: def.label,
                type: def.type,
                options: def.options,
                entity_type: def.entity_type,
                created_at: now,
                organization_id: organization_id
            })
            .select()
            .single()

        if (error) throw error

        return {
            id: data.id,
            key: data.key,
            label: data.label,
            type: data.type,
            options: data.options,
            entity_type: data.entity_type,
            created_at: data.created_at,
        }
    },

    delete: async (id: string): Promise<void> => {
        const { error, count } = await supabase
            .from('custom_field_definitions')
            .delete({ count: 'exact' })
            .eq('id', id)

        console.log('[DEBUG] Deleting custom field:', { id, count, error });

        if (error) throw error
    },
}

// ============================================================================
// SETTINGS
// ============================================================================

/**
 * Settings Database com Cache Redis
 *
 * OTIMIZAÇÃO V2 (2026-01-26):
 * - Cache em Redis com TTL de 60s para evitar queries repetidas
 * - Fallback transparente se Redis não estiver configurado
 * - Invalidação automática no set()
 *
 * Performance: ~100x mais rápido (Redis: ~1ms vs Supabase: ~100ms)
 */
const SETTINGS_CACHE_PREFIX = 'settings:'
const SETTINGS_CACHE_TTL = 60 // segundos

export const settingsDb = {
    get: async (key: string): Promise<string | null> => {
        const cacheKey = `${SETTINGS_CACHE_PREFIX}${key}`

        // 1. Tenta buscar do cache Redis
        if (redis) {
            try {
                const cached = await redis.get<string>(cacheKey)
                if (cached !== null) {
                    return cached
                }
            } catch (e) {
                // Redis error - fallback silencioso para DB
                console.warn('[settingsDb] Redis read error:', e)
            }
        }

        // 2. Busca do Supabase
        const { data, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', key)
            .single()

        if (error || !data) return null

        // 3. Armazena no cache para próximas requisições
        if (redis && data.value) {
            try {
                await redis.set(cacheKey, data.value, { ex: SETTINGS_CACHE_TTL })
            } catch (e) {
                // Ignore cache write errors
                console.warn('[settingsDb] Redis write error:', e)
            }
        }

        return data.value
    },

    set: async (key: string, value: string): Promise<void> => {
        const now = new Date().toISOString()

        const { error } = await supabase
            .from('settings')
            .upsert({
                key,
                value,
                updated_at: now,
            }, { onConflict: 'key' })

        if (error) throw error

        // Invalida cache após update
        if (redis) {
            try {
                const cacheKey = `${SETTINGS_CACHE_PREFIX}${key}`
                await redis.del(cacheKey)
            } catch (e) {
                // Ignore cache invalidation errors
                console.warn('[settingsDb] Redis del error:', e)
            }
        }
    },

    getAll: async (): Promise<AppSettings> => {
        const { data, error } = await supabase
            .from('settings')
            .select('key, value')

        if (error) throw error

        const settings: Record<string, string> = {}
            ; (data || []).forEach(row => {
                settings[row.key] = row.value
            })

        return {
            phoneNumberId: settings.phoneNumberId || '',
            businessAccountId: settings.businessAccountId || '',
            accessToken: settings.accessToken || '',
            isConnected: settings.isConnected === 'true',
        }
    },

    saveAll: async (settings: AppSettings): Promise<void> => {
        await settingsDb.set('phoneNumberId', settings.phoneNumberId)
        await settingsDb.set('businessAccountId', settings.businessAccountId)
        await settingsDb.set('accessToken', settings.accessToken)
        await settingsDb.set('isConnected', settings.isConnected ? 'true' : 'false')
    },
}

// ============================================================================
// DASHBOARD
// ============================================================================

export const dashboardDb = {
    getStats: async () => {
        // Get campaign stats with aggregation
        const { data, error } = await supabase
            .from('campaigns')
            .select('sent, delivered, read, failed, status, name, total_recipients')

        if (error) throw error

        let totalSent = 0
        let totalDelivered = 0
        let totalFailed = 0
        let activeCampaigns = 0

            ; (data || []).forEach(row => {
                totalSent += row.sent || 0
                totalDelivered += row.delivered || 0
                totalFailed += row.failed || 0
                if (row.status === 'Enviando' || row.status === 'Agendada') {
                    activeCampaigns++
                }
            })

        const deliveryRate = totalSent > 0
            ? ((totalDelivered / totalSent) * 100).toFixed(1)
            : '100'

        // Get recent campaigns for chart
        const chartData = (data || [])
            .slice(0, 7)
            .map(r => ({
                name: (r.name as string).substring(0, 3),
                sent: r.total_recipients as number,
                read: r.read as number,
            }))
            .reverse()

        return {
            sent24h: totalSent.toLocaleString(),
            deliveryRate: `${deliveryRate}%`,
            activeCampaigns: activeCampaigns.toString(),
            failedMessages: totalFailed.toString(),
            chartData,
        }
    },
}
// ============================================================================
// TEMPLATE PROJECTS (Factory)
// ============================================================================

export const templateProjectDb = {
    getAll: async (): Promise<TemplateProject[]> => {
        // Busca projetos com contagem dinâmica de items aprovados
        const { data, error } = await supabase
            .from('template_projects')
            .select(`
                *,
                template_project_items (
                    id,
                    meta_status
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Calcula approved_count e template_count dinamicamente
        return (data || []).map(project => {
            const items = project.template_project_items || [];
            const approvedCount = items.filter((i: { meta_status?: string }) => i.meta_status === 'APPROVED').length;
            const templateCount = items.length;

            // Remove o array de items do retorno (não precisa na lista)
            const { template_project_items, ...projectWithoutItems } = project;

            return {
                ...projectWithoutItems,
                template_count: templateCount,
                approved_count: approvedCount
            } as TemplateProject;
        });
    },

    getById: async (id: string): Promise<TemplateProject & { items: TemplateProjectItem[] }> => {
        // Fetch project
        const { data: project, error: projectError } = await supabase
            .from('template_projects')
            .select('*')
            .eq('id', id)
            .single();

        if (projectError) throw projectError;

        // Fetch items
        const { data: items, error: itemsError } = await supabase
            .from('template_project_items')
            .select('*')
            .eq('project_id', id)
            .order('created_at', { ascending: true });

        if (itemsError) throw itemsError;

        return { ...(project as TemplateProject), items: (items as TemplateProjectItem[]) || [] };
    },

    create: async (dto: CreateTemplateProjectDTO): Promise<TemplateProject> => {
        // 1. Create Project
        const { data: project, error: projectError } = await supabase
            .from('template_projects')
            .insert({
                title: dto.title,
                prompt: dto.prompt,
                status: dto.status || 'draft',
                // Discriminador para separar Manual vs IA (default seguro)
                source: (dto as any).source || 'ai',
                // Estratégia usada: marketing, utility, bypass
                strategy: dto.strategy || 'utility',
                template_count: dto.items.length,
                approved_count: 0
                // user_id is explicitly NOT set here, relying on schema default (null) or logic in API route if needed
                // In this single-tenant app, user_id null is acceptable or could be 'admin'
            })
            .select()
            .single();

        if (projectError) throw projectError;

        // 2. Create Items
        if (dto.items.length > 0) {
            const itemsToInsert = dto.items.map(item => ({
                ...item,
                project_id: project.id
            }));

            const { error: itemsError } = await supabase
                .from('template_project_items')
                .insert(itemsToInsert);

            if (itemsError) {
                console.error('Error creating items:', itemsError);
                throw itemsError;
            }
        }

        return project as TemplateProject;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('template_projects')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    updateItem: async (id: string, updates: Partial<TemplateProjectItem>): Promise<TemplateProjectItem> => {
        const { data, error } = await supabase
            .from('template_project_items')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as TemplateProjectItem;
    },

    deleteItem: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('template_project_items')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    update: async (id: string, updates: Partial<{ title: string; status: string }>): Promise<TemplateProject> => {
        const { data, error } = await supabase
            .from('template_projects')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as TemplateProject;
    }
};

// ============================================================================
// CAMPAIGN FOLDERS
// ============================================================================

export const campaignFolderDb = {
    getAll: async (): Promise<CampaignFolder[]> => {
        const { data, error } = await supabase
            .from('campaign_folders')
            .select('*')
            .order('name', { ascending: true })

        if (error) throw error

        return (data || []).map(row => ({
            id: row.id,
            name: row.name,
            color: row.color,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }))
    },

    getAllWithCounts: async (): Promise<CampaignFolder[]> => {
        // Get folders
        const { data: folders, error: foldersError } = await supabase
            .from('campaign_folders')
            .select('*')
            .order('name', { ascending: true })

        if (foldersError) throw foldersError

        // Get campaign counts per folder.
        // Limite explícito de 5000: sem .limit() o PostgREST trunca silenciosamente em 1000
        // rows, fazendo as contagens ficarem incorretas para instalações com muitas campanhas.
        const { data: campaigns, error: campaignsError } = await supabase
            .from('campaigns')
            .select('folder_id')
            .limit(5000)

        if (campaignsError) throw campaignsError

        if ((campaigns?.length ?? 0) >= 5000) {
            console.warn('campaignFolderDb.getAllWithCounts(): limite de 5000 campanhas atingido — contagens de pasta podem estar incompletas')
        }

        // Count campaigns per folder
        const countMap = new Map<string, number>()
        ;(campaigns || []).forEach((c: any) => {
            if (c.folder_id) {
                countMap.set(c.folder_id, (countMap.get(c.folder_id) || 0) + 1)
            }
        })

        return (folders || []).map(row => ({
            id: row.id,
            name: row.name,
            color: row.color,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            campaignCount: countMap.get(row.id) || 0,
        }))
    },

    getById: async (id: string): Promise<CampaignFolder | undefined> => {
        const { data, error } = await supabase
            .from('campaign_folders')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) return undefined

        return {
            id: data.id,
            name: data.name,
            color: data.color,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        }
    },

    create: async (dto: CreateCampaignFolderDTO): Promise<CampaignFolder> => {
        const { data, error } = await supabase
            .from('campaign_folders')
            .insert({
                name: dto.name,
                color: dto.color || '#6B7280',
            })
            .select()
            .single()

        if (error) throw error

        return {
            id: data.id,
            name: data.name,
            color: data.color,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        }
    },

    update: async (id: string, dto: UpdateCampaignFolderDTO): Promise<CampaignFolder | undefined> => {
        const updateData: Record<string, unknown> = {}

        if (dto.name !== undefined) updateData.name = dto.name
        if (dto.color !== undefined) updateData.color = dto.color

        const { error } = await supabase
            .from('campaign_folders')
            .update(updateData)
            .eq('id', id)

        if (error) throw error

        return campaignFolderDb.getById(id)
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('campaign_folders')
            .delete()
            .eq('id', id)

        if (error) throw error
    },

    // Contagem de campanhas sem pasta
    getUnfiledCount: async (): Promise<number> => {
        const { count, error } = await supabase
            .from('campaigns')
            .select('*', { count: 'exact', head: true })
            .is('folder_id', null)

        if (error) throw error
        return count || 0
    },

    // Total de campanhas
    getTotalCount: async (): Promise<number> => {
        const { count, error } = await supabase
            .from('campaigns')
            .select('*', { count: 'exact', head: true })

        if (error) throw error
        return count || 0
    },
}

// ============================================================================
// CAMPAIGN TAGS
// ============================================================================

export const campaignTagDb = {
    getAll: async (): Promise<CampaignTag[]> => {
        const { data, error } = await supabase
            .from('campaign_tags')
            .select('*')
            .order('name', { ascending: true })

        if (error) throw error

        return (data || []).map(row => ({
            id: row.id,
            name: row.name,
            color: row.color,
            createdAt: row.created_at,
        }))
    },

    getById: async (id: string): Promise<CampaignTag | undefined> => {
        const { data, error } = await supabase
            .from('campaign_tags')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) return undefined

        return {
            id: data.id,
            name: data.name,
            color: data.color,
            createdAt: data.created_at,
        }
    },

    create: async (dto: CreateCampaignTagDTO): Promise<CampaignTag> => {
        const { data, error } = await supabase
            .from('campaign_tags')
            .insert({
                name: dto.name,
                color: dto.color || '#6B7280',
            })
            .select()
            .single()

        if (error) throw error

        return {
            id: data.id,
            name: data.name,
            color: data.color,
            createdAt: data.created_at,
        }
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('campaign_tags')
            .delete()
            .eq('id', id)

        if (error) throw error
    },

    // Obtém as tags de uma campanha
    getForCampaign: async (campaignId: string): Promise<CampaignTag[]> => {
        const { data, error } = await supabase
            .from('campaign_tag_assignments')
            .select(`
                tag_id,
                campaign_tags (
                    id,
                    name,
                    color,
                    created_at
                )
            `)
            .eq('campaign_id', campaignId)

        if (error) throw error

        return (data || [])
            .map((row: any) => row.campaign_tags)
            .filter(Boolean)
            .map((tag: any) => ({
                id: tag.id,
                name: tag.name,
                color: tag.color,
                createdAt: tag.created_at,
            }))
    },

    // Atribui tags a uma campanha (substitui todas as tags existentes)
    assignToCampaign: async (campaignId: string, tagIds: string[]): Promise<void> => {
        // Primeiro, remove todas as tags existentes
        const { error: deleteError } = await supabase
            .from('campaign_tag_assignments')
            .delete()
            .eq('campaign_id', campaignId)

        if (deleteError) throw deleteError

        // Depois, insere as novas tags
        if (tagIds.length > 0) {
            const rows = tagIds.map(tagId => ({
                campaign_id: campaignId,
                tag_id: tagId,
            }))

            const { error: insertError } = await supabase
                .from('campaign_tag_assignments')
                .insert(rows)

            if (insertError) throw insertError
        }
    },

    // Adiciona uma tag a uma campanha
    addToCampaign: async (campaignId: string, tagId: string): Promise<void> => {
        const { error } = await supabase
            .from('campaign_tag_assignments')
            .upsert({
                campaign_id: campaignId,
                tag_id: tagId,
            }, { onConflict: 'campaign_id,tag_id' })

        if (error) throw error
    },

    // Remove uma tag de uma campanha
    removeFromCampaign: async (campaignId: string, tagId: string): Promise<void> => {
        const { error } = await supabase
            .from('campaign_tag_assignments')
            .delete()
            .eq('campaign_id', campaignId)
            .eq('tag_id', tagId)

        if (error) throw error
    },
}
