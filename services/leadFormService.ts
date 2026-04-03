import type { CreateLeadFormDTO, LeadForm, UpdateLeadFormDTO } from '../types'
import { api } from '../lib/api'

/**
 * Lead Form Service
 * CRUD via API routes do Next.js
 */
export const leadFormService = {
  getAll: (): Promise<LeadForm[]> =>
    api.get<LeadForm[]>('/api/lead-forms', { cache: 'no-store' }),

  create: (dto: CreateLeadFormDTO): Promise<LeadForm> =>
    api.post<LeadForm>('/api/lead-forms', dto),

  update: (id: string, dto: UpdateLeadFormDTO): Promise<LeadForm> =>
    api.patch<LeadForm>(`/api/lead-forms/${encodeURIComponent(id)}`, dto),

  delete: (id: string): Promise<void> =>
    api.del(`/api/lead-forms/${encodeURIComponent(id)}`),
}
