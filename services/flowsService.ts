import { z } from 'zod'
import { api } from '@/lib/api'

export type FlowRow = {
  id: string
  name: string
  status: string
  meta_flow_id: string | null
  meta_status?: string | null
  meta_preview_url?: string | null
  meta_validation_errors?: any
  meta_last_checked_at?: string | null
  meta_published_at?: string | null
  template_key?: string | null
  flow_json?: any
  flow_version?: string | null
  mapping?: any
  spec: any
  created_at: string
  updated_at: string | null
}

const FlowRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  meta_flow_id: z.string().nullable().optional(),
  meta_status: z.string().nullable().optional(),
  meta_preview_url: z.string().nullable().optional(),
  meta_validation_errors: z.any().optional(),
  meta_last_checked_at: z.string().nullable().optional(),
  meta_published_at: z.string().nullable().optional(),
  template_key: z.string().nullable().optional(),
  flow_json: z.any().optional(),
  flow_version: z.string().nullable().optional(),
  mapping: z.any().optional(),
  spec: z.any(),
  created_at: z.string(),
  updated_at: z.string().nullable().optional(),
})

function parseList(raw: unknown): FlowRow[] {
  if (!Array.isArray(raw)) return []
  const out: FlowRow[] = []
  for (const item of raw) {
    const res = FlowRowSchema.safeParse(item)
    if (res.success) out.push(res.data as any)
  }
  return out
}

function parseFlowRow(data: unknown, errorMsg: string): FlowRow {
  const parsed = FlowRowSchema.safeParse(data)
  if (!parsed.success) throw new Error(errorMsg)
  return parsed.data as any
}

export const flowsService = {
  async list(): Promise<FlowRow[]> {
    const data = await api.get<unknown>('/api/flows')
    return parseList(data)
  },

  async create(input: { name: string }): Promise<FlowRow> {
    const data = await api.post<unknown>('/api/flows', input)
    return parseFlowRow(data, 'Resposta inválida ao criar MiniApp')
  },

  async createFromTemplate(input: { name: string; templateKey: string }): Promise<FlowRow> {
    const data = await api.post<unknown>('/api/flows', input)
    return parseFlowRow(data, 'Resposta inválida ao criar MiniApp')
  },

  async get(id: string): Promise<FlowRow> {
    const data = await api.get<unknown>(`/api/flows/${encodeURIComponent(id)}`)
    return parseFlowRow(data, 'Resposta inválida ao buscar MiniApp')
  },

  async update(
    id: string,
    patch: {
      name?: string
      status?: string
      metaFlowId?: string
      resetMeta?: boolean
      spec?: unknown
      templateKey?: string
      flowJson?: unknown
      mapping?: unknown
    }
  ): Promise<FlowRow> {
    const data = await api.patch<unknown>(`/api/flows/${encodeURIComponent(id)}`, patch)
    return parseFlowRow(data, 'Resposta inválida ao atualizar MiniApp')
  },

  async remove(id: string): Promise<void> {
    return api.del(`/api/flows/${encodeURIComponent(id)}`)
  },

  async publishToMeta(
    id: string,
    input?: {
      publish?: boolean
      categories?: string[]
      updateIfExists?: boolean
    }
  ): Promise<FlowRow> {
    // Mantido raw: error building multi-campo (debug.graphError, issues[])
    const res = await fetch(`/api/flows/${encodeURIComponent(id)}/meta/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-debug-client': '1',
      },
      body: JSON.stringify(input || {}),
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) {
      if (data?.debug?.graphError) {
        const ge = data.debug.graphError
        const userTitle = ge.error_user_title ? String(ge.error_user_title) : ''
        const userMsg = ge.error_user_msg ? String(ge.error_user_msg) : ''
        const details = [userTitle, userMsg].filter(Boolean).join(' — ')
        const base = (data?.error && String(data.error)) || 'Falha ao publicar MiniApp na Meta'
        throw new Error(details ? `${base}: ${details}` : base)
      }
      const msg = (data?.error && String(data.error)) || 'Falha ao publicar MiniApp na Meta'
      const details = data?.issues ? `: ${Array.isArray(data.issues) ? data.issues.join(', ') : String(data.issues)}` : ''
      throw new Error(`${msg}${details}`)
    }

    return parseFlowRow(data?.row, 'Resposta inválida ao publicar MiniApp na Meta')
  },

  async send(payload: {
    to: string
    flowId: string
    flowToken: string
    body?: string
    ctaText?: string
    footer?: string
    action?: 'navigate' | 'data_exchange'
    actionPayload?: Record<string, unknown>
    flowMessageVersion?: string
  }): Promise<unknown> {
    return api.post<unknown>('/api/flows/send', payload)
  },

  async generateForm(params: {
    prompt: string
    titleHint?: string
    maxQuestions?: number
  }): Promise<unknown> {
    // Mantido raw: erro composto (msg + details)
    const res = await fetch('/api/ai/generate-flow-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: params.prompt,
        titleHint: params.titleHint,
        maxQuestions: params.maxQuestions || 10,
      }),
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const msg = (data?.error && String(data.error)) || 'Falha ao gerar formulário com IA'
      const details = data?.details ? `: ${String(data.details)}` : ''
      throw new Error(`${msg}${details}`)
    }

    const generatedForm = data?.form || null
    if (!generatedForm) throw new Error('Resposta inválida da IA (form ausente)')

    return generatedForm
  },
}
