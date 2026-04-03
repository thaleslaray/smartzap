import {
  Campaign,
  CampaignStatus,
  Message,
  MessageStatus,
  CampaignFolder,
  CampaignTag,
  CreateCampaignFolderDTO,
  UpdateCampaignFolderDTO,
  CreateCampaignTagDTO,
} from '../types';
import type { MissingParamDetail } from '../lib/whatsapp/template-contract';
import { api } from '@/lib/api';

interface CreateCampaignInput {
  name: string;
  templateName: string;
  recipients: number;
  selectedContacts?: {
    id?: string;
    contactId?: string;
    contact_id?: string;
    name: string;
    phone: string;
    email?: string | null;
    custom_fields?: Record<string, unknown>;
  }[];
  selectedContactIds?: string[];  // For resume functionality
  scheduledAt?: string;           // ISO timestamp for scheduling
  templateVariables?: { header: string[], body: string[], buttons?: Record<string, string> };   // Meta API structure
  // Flow/MiniApp fields
  flowId?: string | null;
  flowName?: string | null;
  // Organização
  folderId?: string | null;
  // Se true, salva como rascunho sem disparar
  isDraft?: boolean;
}

export interface CampaignListParams {
  limit: number;
  offset: number;
  search?: string;
  status?: string;
  folderId?: string | null;  // null = todas, 'none' = sem pasta
  tagIds?: string[];         // IDs das tags para filtrar
}

export interface CampaignListResult {
  data: Campaign[];
  total: number;
  limit: number;
  offset: number;
}

interface RealMessageStatus {
  phone: string;
  status: 'sent' | 'failed';
  messageId?: string;
  error?: string;
  timestamp?: string;
  sentAt?: string; // Alternativo ao timestamp
  webhookStatus?: 'delivered' | 'read' | 'failed'; // From Meta webhook
  webhookTimestamp?: string;
}

// Helper para extrair timestamp de forma segura
function getTimestamp(msg: RealMessageStatus): string {
  const ts = msg.timestamp || msg.sentAt;
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleString('pt-BR');
  } catch {
    return '-';
  }
}

interface CampaignStatusResponse {
  campaignId: string;
  stats: {
    sent: number;
    delivered: number;
    read: number;
    skipped?: number;
    failed: number;
    total: number;
  };
  messages: RealMessageStatus[];
}

interface PrecheckContactInput {
  id?: string;
  contactId?: string;
  contact_id?: string;
  name?: string;
  phone: string;
  email?: string | null;
  custom_fields?: Record<string, unknown>;
}

export interface CampaignPrecheckResult {
  ok: true;
  templateName: string;
  totals: { total: number; valid: number; skipped: number };
  results: Array<
    | { ok: true; contactId?: string; name: string; phone: string; normalizedPhone: string }
    | {
        ok: false;
        contactId?: string;
        name: string;
        phone: string;
        normalizedPhone?: string;
        skipCode: string;
        reason: string;
        missing?: MissingParamDetail[];
      }
  >;
}

export const campaignService = {
  list: (params: CampaignListParams): Promise<CampaignListResult> => {
    const searchParams = new URLSearchParams();
    searchParams.set('limit', String(params.limit));
    searchParams.set('offset', String(params.offset));
    if (params.search) searchParams.set('search', params.search);
    if (params.status && params.status !== 'All') searchParams.set('status', params.status);
    if (params.folderId) searchParams.set('folderId', params.folderId);
    if (params.tagIds && params.tagIds.length > 0) searchParams.set('tagIds', params.tagIds.join(','));
    return api.safeGet<CampaignListResult>(
      `/api/campaigns?${searchParams.toString()}`,
      { data: [], total: 0, limit: params.limit, offset: params.offset }
    );
  },

  getAll: (): Promise<Campaign[]> =>
    api.safeGet<Campaign[]>('/api/campaigns', []),

  getById: (id: string): Promise<Campaign | undefined> =>
    api.safeGet<Campaign | undefined>(`/api/campaigns/${id}`, undefined),

  getMetrics: (id: string): Promise<any | null> =>
    api.safeGet<any>(`/api/campaigns/${id}/metrics`, null, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    }),

  // INSTANT: Get pending messages - returns empty array (real data comes from getMessages)
  getPendingMessages: (_id: string): Message[] => {
    // During creation, messages are pending. After dispatch, use getMessages() for real status.
    return [];
  },

  // ASYNC: Get real message status from campaign_contacts table (paginated)
  getMessages: (
    id: string,
    options?: { limit?: number; offset?: number; status?: string; includeRead?: boolean }
  ): Promise<{
    messages: Message[];
    stats: { total: number; pending: number; sent: number; delivered: number; read: number; skipped: number; failed: number };
    pagination: { limit: number; offset: number; total: number; hasMore: boolean };
  }> => {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.status) params.set('status', options.status);
    if (options?.includeRead) params.set('includeRead', '1');
    const url = `/api/campaigns/${id}/messages${params.toString() ? `?${params}` : ''}`;
    return api.safeGet(url, {
      messages: [],
      stats: { total: 0, pending: 0, sent: 0, delivered: 0, read: 0, skipped: 0, failed: 0 },
      pagination: { limit: 50, offset: 0, total: 0, hasMore: false },
    });
  },

  // Busca status em tempo real
  getRealStatus: (id: string): Promise<CampaignStatusResponse | null> =>
    api.safeGet<CampaignStatusResponse | null>(`/api/campaign/${id}/status`, null, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    }),

  create: async (input: CreateCampaignInput): Promise<Campaign> => {
    const { name, templateName, recipients, selectedContacts, selectedContactIds, scheduledAt, templateVariables, flowId, flowName, folderId, isDraft } = input;

    // 1. Create campaign in Database (source of truth) with contacts
    const newCampaign = await api.post<Campaign>('/api/campaigns', {
      name,
      templateName,
      recipients,
      scheduledAt,
      selectedContactIds,
      contacts: selectedContacts, // Pass contacts to be saved in campaign_contacts
      templateVariables, // Pass template variables to be saved in database
      status: scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.SENDING,
      flowId,   // Flow/MiniApp ID (se template usar Flow)
      flowName, // Flow name para exibição
      folderId, // Organização por pasta
    });

    // 2. If saving as draft, don't dispatch - keep as DRAFT status
    if (isDraft) {
      console.log(`Campaign ${newCampaign.id} saved as draft`);
      return newCampaign;
    }

    // 3. If scheduled for later, don't dispatch now
    if (scheduledAt) {
      console.log(`Campaign ${newCampaign.id} scheduled for ${scheduledAt}`);
      return newCampaign;
    }

    // 4. Dispatch to Backend immediately (Execution)
    // Se o dispatch falhar (ex.: QSTASH_TOKEN ausente), precisamos falhar visivelmente
    // para o usuário não ficar com campanha "Enviando" sem nada sair.
    if (selectedContacts && selectedContacts.length > 0) {
      await campaignService.dispatchToBackend(newCampaign.id, templateName, selectedContacts, templateVariables)
    }

    return newCampaign;
  },

  // Dry-run: valida contatos/variáveis SEM criar campanha e SEM persistir.
  // Mantido raw: fallback de mensagem PT-BR quando o JSON de erro não é parseable.
  precheck: async (input: { templateName: string; contacts: PrecheckContactInput[]; templateVariables?: { header: string[], body: string[], buttons?: Record<string, string> } }): Promise<CampaignPrecheckResult> => {
    const response = await fetch('/api/campaign/precheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateName: input.templateName,
        contacts: input.contacts,
        templateVariables: input.templateVariables,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || 'Falha ao validar destinatários');
    }
    return response.json();
  },

  // Internal: dispatch campaign to backend queue
  // Mantido raw: parsing multi-formato de erro (JSON + text fallback + base:details)
  dispatchToBackend: async (campaignId: string, templateName: string, contacts?: { id?: string; contactId?: string; name: string; phone: string; email?: string | null; custom_fields?: Record<string, unknown> }[], templateVariables?: { header: string[], body: string[], buttons?: Record<string, string> }): Promise<void> => {
    try {
      const response = await fetch('/api/campaign/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          templateName,
          ...(contacts && contacts.length > 0 ? { contacts } : {}),
          templateVariables, // Pass template variables to workflow
          // whatsappCredentials buscadas no servidor (Supabase/env)
        })
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        let details = text
        try {
          const parsed = JSON.parse(text)
          const base = parsed?.error || 'Falha ao iniciar envio'
          const extra = parsed?.details ? String(parsed.details) : ''
          details = extra ? `${base}: ${extra}` : base
        } catch {
          // keep raw text
        }
        console.error('Dispatch failed:', details)
        throw new Error(details || 'Falha ao iniciar envio')
      }
      return;
    } catch (error) {
      console.error('Failed to dispatch campaign to backend:', error);
      throw error;
    }
  },

  // Re-enqueue only skipped contacts after revalidation
  // Mantido raw: erro composto base:details
  resendSkipped: async (campaignId: string): Promise<{ status: string; resent: number; stillSkipped: number; message?: string }> => {
    const response = await fetch(`/api/campaigns/${campaignId}/resend-skipped`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const base = payload?.error || 'Falha ao reenviar ignorados'
      const details = payload?.details ? String(payload.details) : ''
      throw new Error(details ? `${base}: ${details}` : base)
    }
    return payload
  },

  delete: (id: string): Promise<void> =>
    api.del(`/api/campaigns/${id}`),

  duplicate: (id: string): Promise<Campaign> =>
    api.post<Campaign>(`/api/campaigns/${id}/clone`),

  // Pause a running campaign
  pause: async (id: string): Promise<Campaign | undefined> => {
    try {
      const campaign = await api.patch<Campaign>(`/api/campaigns/${id}`, {
        status: CampaignStatus.PAUSED,
        pausedAt: new Date().toISOString(),
      });
      // Fire-and-forget: notify backend to pause queue processing
      fetch(`/api/campaign/${id}/pause`, { method: 'POST' })
        .catch((error) => console.error('Failed to pause campaign on backend:', error));
      return campaign;
    } catch {
      console.error('Failed to pause campaign in Database');
      return undefined;
    }
  },

  // Resume a paused campaign
  resume: async (id: string): Promise<Campaign | undefined> => {
    // Get campaign from Database
    const campaign = await campaignService.getById(id);
    if (!campaign) return undefined;

    try {
      const updatedCampaign = await api.patch<Campaign>(`/api/campaigns/${id}`, {
        status: CampaignStatus.SENDING,
        pausedAt: null,
      });
      // Fire-and-forget: notify backend to resume processing
      fetch(`/api/campaign/${id}/resume`, { method: 'POST' })
        .catch((error) => console.error('Failed to resume campaign on backend:', error));
      return updatedCampaign;
    } catch {
      console.error('Failed to resume campaign in Database');
      return undefined;
    }
  },

  // Cancel a sending campaign (terminal)
  // Mantido raw: retorna payload?.campaign (campo aninhado) + erro base:details
  cancel: async (id: string): Promise<Campaign | undefined> => {
    const response = await fetch(`/api/campaign/${id}/cancel`, { method: 'POST' })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      const base = payload?.error || 'Falha ao cancelar envio'
      const details = payload?.details ? String(payload.details) : ''
      throw new Error(details ? `${base}: ${details}` : base)
    }

    return payload?.campaign as Campaign | undefined
  },

  // Start a scheduled or draft campaign immediately
  // Mantido raw: orquestração multi-passo com estado intermediário
  start: async (id: string): Promise<Campaign | undefined> => {
    console.log('🚀 Starting campaign:', { id });

    // Get campaign from Database first to get templateVariables and templateName
    const campaignData = await campaignService.getById(id);
    if (!campaignData) {
      console.error('❌ Campaign not found!');
      return undefined;
    }

    // Prefer backend to load recipients snapshot from campaign_contacts.
    // This avoids losing custom_fields when starting scheduled/duplicated campaigns.
    try {
      await campaignService.dispatchToBackend(
        id,
        campaignData.templateName,
        undefined,
        campaignData.templateVariables as { header: string[], body: string[], buttons?: Record<string, string> } | undefined
      )
    } catch (e) {
      console.error('❌ Failed to dispatch campaign to backend:', e)
      return undefined
    }

    // Atualiza estado imediatamente no DB para a UI não ficar "Iniciar Agora" enquanto já está enviando.
    // O workflow também setará status/startedAt, mas isso pode demorar alguns segundos.
    const nowIso = new Date().toISOString()

    // Clear scheduledAt once dispatch is queued.
    const updateResponse = await fetch(`/api/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: CampaignStatus.SENDING,
        startedAt: (campaignData as any).startedAt || nowIso,
        scheduledAt: null,
        qstashScheduleMessageId: null,
        qstashScheduleEnqueuedAt: null,
      }),
    });

    if (!updateResponse.ok) {
      console.warn('Failed to clear scheduled fields after dispatch');
      // Retorna dados originais com status atualizado otimisticamente
      return { ...campaignData, status: CampaignStatus.SENDING };
    }

    // Retorna diretamente o resultado do PATCH (evita getById extra)
    return updateResponse.json();
  },

  // Cancel a scheduled campaign (QStash one-shot)
  // Mantido raw: retorna { ok, error } em vez de lançar exceção
  cancelSchedule: async (id: string): Promise<{ ok: boolean; campaign?: Campaign | null; error?: string }> => {
    const response = await fetch(`/api/campaigns/${id}/cancel-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      return { ok: false, error: payload?.error || 'Falha ao cancelar agendamento' }
    }

    return { ok: true, campaign: payload?.campaign ?? null }
  },

  // Update campaign stats from real-time polling
  // Mantido raw: orquestração multi-passo com lógica condicional
  updateStats: async (id: string): Promise<Campaign | undefined> => {
    // Parallel fetch - both requests start at the same time
    const [realStatus, campaign] = await Promise.all([
      campaignService.getRealStatus(id),
      campaignService.getById(id),
    ]);

    // If no campaign, return early
    if (!campaign) return undefined;

    // If realStatus has data, update the campaign
    if (realStatus && realStatus.stats.total > 0) {
      const isComplete = realStatus.stats.sent + realStatus.stats.failed >= campaign.recipients;

      // Update in Database
      const response = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sent: realStatus.stats.sent,
          delivered: realStatus.stats.delivered,
          read: realStatus.stats.read,
          failed: realStatus.stats.failed,
          status: isComplete ? CampaignStatus.COMPLETED : campaign.status,
          completedAt: isComplete ? new Date().toISOString() : undefined,
        }),
      });

      if (!response.ok) {
        console.error('Failed to update campaign stats');
        return campaign;
      }

      return response.json();
    }

    // No realStatus data, return campaign as-is
    return campaign;
  },

  // Get traces for a campaign (debug/executions)
  getTraces: async (id: string, limit?: number): Promise<{
    traces: Array<{
      traceId: string
      source: 'run_metrics' | 'campaign_contacts'
      createdAt?: string | null
      lastSeenAt?: string | null
      recipients?: number | null
      sentTotal?: number | null
      failedTotal?: number | null
      skippedTotal?: number | null
    }>
  }> => {
    const payload = await api.get<{ traces?: unknown[] }>(
      `/api/campaigns/${encodeURIComponent(id)}/trace?limit=${limit || 50}`,
      { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }
    );
    return { traces: Array.isArray(payload?.traces) ? payload.traces as any[] : [] };
  },

  // Get trace events (timeline) for a specific trace
  getTraceEvents: async (
    id: string,
    params: {
      traceId: string
      limit?: number
      offset?: number
      phase?: string
      ok?: 'all' | 'ok' | 'fail'
    }
  ): Promise<{
    events: Array<{
      id: string
      trace_id: string
      ts: string
      step: string | null
      phase: string
      ok: boolean | null
      ms: number | null
      batch_index: number | null
      contact_id: string | null
      phone_masked: string | null
      extra: Record<string, unknown> | null
    }>
    pagination: { total: number }
  }> => {
    const searchParams = new URLSearchParams()
    searchParams.set('traceId', params.traceId)
    searchParams.set('limit', String(params.limit || 200))
    searchParams.set('offset', String(params.offset || 0))
    if (params.phase?.trim()) searchParams.set('phase', params.phase.trim())
    if (params.ok === 'ok') searchParams.set('ok', '1')
    if (params.ok === 'fail') searchParams.set('ok', '0')

    const payload = await api.get<{ events?: unknown[]; pagination?: { total?: number } }>(
      `/api/campaigns/${encodeURIComponent(id)}/trace-events?${searchParams}`,
      { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }
    );
    return {
      events: Array.isArray(payload?.events) ? payload.events as any[] : [],
      pagination: { total: typeof payload?.pagination?.total === 'number' ? payload.pagination.total : 0 },
    };
  },

  // ============================================================================
  // FOLDERS
  // ============================================================================

  listFolders: (): Promise<{
    folders: CampaignFolder[];
    totalCount: number;
    unfiledCount: number;
  }> =>
    api.safeGet('/api/campaigns/folders', { folders: [], totalCount: 0, unfiledCount: 0 }),

  createFolder: (dto: CreateCampaignFolderDTO): Promise<CampaignFolder> =>
    api.post<CampaignFolder>('/api/campaigns/folders', dto),

  updateFolder: (id: string, dto: UpdateCampaignFolderDTO): Promise<CampaignFolder> =>
    api.patch<CampaignFolder>(`/api/campaigns/folders/${id}`, dto),

  deleteFolder: (id: string): Promise<void> =>
    api.del(`/api/campaigns/folders/${id}`),

  // ============================================================================
  // TAGS
  // ============================================================================

  listTags: (): Promise<CampaignTag[]> =>
    api.safeGet<CampaignTag[]>('/api/campaigns/tags', []),

  createTag: (dto: CreateCampaignTagDTO): Promise<CampaignTag> =>
    api.post<CampaignTag>('/api/campaigns/tags', dto),

  deleteTag: (id: string): Promise<void> =>
    api.del(`/api/campaigns/tags/${id}`),

  // ============================================================================
  // CAMPAIGN ORGANIZATION
  // ============================================================================

  updateCampaignFolder: (campaignId: string, folderId: string | null): Promise<Campaign> =>
    api.patch<Campaign>(`/api/campaigns/${campaignId}`, { folderId }),

  updateCampaignTags: (campaignId: string, tagIds: string[]): Promise<Campaign> =>
    api.patch<Campaign>(`/api/campaigns/${campaignId}`, { tagIds }),
};
