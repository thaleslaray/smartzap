import { api } from '@/lib/api';

export interface FlowSubmissionsQuery {
  flowId?: string
  campaignId?: string
  phone?: string
  limit?: number
}

export interface FlowSubmissionRow {
  id: string
  message_id: string
  from_phone: string
  contact_id: string | null
  flow_id: string | null
  flow_name: string | null
  flow_token: string | null
  campaign_id?: string | null
  response_json_raw: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response_json: any | null
  waba_id: string | null
  phone_number_id: string | null
  message_timestamp: string | null
  created_at: string
}

export const flowSubmissionsService = {
  async list(query: FlowSubmissionsQuery = {}): Promise<FlowSubmissionRow[]> {
    const sp = new URLSearchParams()
    if (query.flowId) sp.set('flowId', query.flowId)
    if (query.campaignId) sp.set('campaignId', query.campaignId)
    if (query.phone) sp.set('phone', query.phone)
    if (query.limit) sp.set('limit', String(query.limit))

    const url = `/api/flows/submissions${sp.toString() ? `?${sp.toString()}` : ''}`
    return api.get<FlowSubmissionRow[]>(url, { headers: { 'Cache-Control': 'no-cache' } })
  },
}
