import { z } from 'zod'
import { api } from '@/lib/api'

// Dados do contato vindos do JOIN
export type SubmissionContact = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
} | null

// Dados da campanha vindos do JOIN
export type SubmissionCampaign = {
  id: string
  name: string | null
} | null

export type FlowSubmission = {
  id: string
  message_id: string
  from_phone: string
  contact_id: string | null
  campaign_id: string | null
  flow_id: string | null
  flow_name: string | null
  flow_token: string | null
  flow_local_id: string | null
  response_json_raw: string
  response_json: Record<string, unknown> | null
  mapped_data: Record<string, unknown> | null
  mapped_at: string | null
  waba_id: string | null
  phone_number_id: string | null
  message_timestamp: string | null
  created_at: string
  // Dados relacionados (JOINs)
  contact: SubmissionContact
  campaign: SubmissionCampaign
}

export interface SubmissionsListParams {
  limit?: number
  offset?: number
  search?: string
  campaignId?: string
  flowId?: string
}

export interface SubmissionsListResult {
  data: FlowSubmission[]
  total: number
  limit: number
  offset: number
}

// Schema para dados do contato (JOIN)
const SubmissionContactSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  })
  .nullable()

// Schema para dados da campanha (JOIN)
const SubmissionCampaignSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
  })
  .nullable()

const FlowSubmissionSchema = z.object({
  id: z.string(),
  message_id: z.string(),
  from_phone: z.string(),
  contact_id: z.string().nullable(),
  campaign_id: z.string().nullable(),
  flow_id: z.string().nullable(),
  flow_name: z.string().nullable(),
  flow_token: z.string().nullable(),
  flow_local_id: z.string().nullable(),
  response_json_raw: z.string(),
  response_json: z.record(z.string(), z.unknown()).nullable(),
  mapped_data: z.record(z.string(), z.unknown()).nullable(),
  mapped_at: z.string().nullable(),
  waba_id: z.string().nullable(),
  phone_number_id: z.string().nullable(),
  message_timestamp: z.string().nullable(),
  created_at: z.string(),
  // Dados relacionados (JOINs)
  contact: SubmissionContactSchema,
  campaign: SubmissionCampaignSchema,
})

function parseList(raw: unknown): FlowSubmission[] {
  if (!Array.isArray(raw)) return []
  const out: FlowSubmission[] = []
  for (const item of raw) {
    const res = FlowSubmissionSchema.safeParse(item)
    if (res.success) out.push(res.data)
  }
  return out
}

export const submissionsService = {
  async list(params: SubmissionsListParams = {}): Promise<SubmissionsListResult> {
    const searchParams = new URLSearchParams()

    if (params.limit) searchParams.set('limit', String(params.limit))
    if (params.offset) searchParams.set('offset', String(params.offset))
    if (params.search) searchParams.set('search', params.search)
    if (params.campaignId) searchParams.set('campaignId', params.campaignId)
    if (params.flowId) searchParams.set('flowId', params.flowId)

    const url = `/api/submissions?${searchParams.toString()}`
    const json = await api.get<{ data: unknown[]; total: number; limit: number; offset: number }>(url)

    return {
      data: parseList(json.data),
      total: Number(json.total) || 0,
      limit: Number(json.limit) || 20,
      offset: Number(json.offset) || 0,
    }
  },

  /**
   * Extrai os campos do formulário do response_json,
   * removendo campos técnicos como flow_token
   */
  extractFormFields(submission: FlowSubmission): Record<string, unknown> {
    const json = submission.response_json || {}
    const { flow_token, ...fields } = json as Record<string, unknown>
    return fields
  },

  /**
   * Formata telefone para exibição
   */
  formatPhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 13 && cleaned.startsWith('55')) {
      const ddd = cleaned.slice(2, 4)
      const part1 = cleaned.slice(4, 9)
      const part2 = cleaned.slice(9)
      return `+55 ${ddd} ${part1}-${part2}`
    }
    return phone
  },
}
