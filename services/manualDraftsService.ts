import { z } from 'zod'
import { api } from '@/lib/api'

export type ManualDraftTemplate = {
  id: string
  name: string
  language: string
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' | string
  status: 'DRAFT' | 'APPROVED' | 'PENDING' | 'REJECTED' | string
  updatedAt: string
  parameterFormat?: 'positional' | 'named'
  spec?: unknown
  content?: string
}

const DraftRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  language: z.string().default('pt_BR'),
  category: z.string().default('UTILITY'),
  status: z.string().default('DRAFT'),
  updatedAt: z.string().default(''),
  parameterFormat: z.union([z.literal('positional'), z.literal('named')]).optional(),
  spec: z.unknown().optional(),
  content: z.string().optional(),
})

function parseDraft(data: unknown, errorMsg: string): ManualDraftTemplate {
  const parsed = DraftRowSchema.safeParse(data)
  if (!parsed.success) throw new Error(errorMsg)
  return parsed.data
}

function parseListResponse(raw: unknown): ManualDraftTemplate[] {
  if (!Array.isArray(raw)) return []
  const parsed: ManualDraftTemplate[] = []
  for (const item of raw) {
    const res = DraftRowSchema.safeParse(item)
    if (!res.success) continue
    parsed.push(res.data)
  }
  return parsed
}

export const manualDraftsService = {
  async get(id: string): Promise<ManualDraftTemplate> {
    const data = await api.get<unknown>(`/api/templates/drafts/${encodeURIComponent(id)}`)
    return parseDraft(data, 'Resposta inválida ao buscar rascunho')
  },

  async list(): Promise<ManualDraftTemplate[]> {
    const data = await api.get<unknown>('/api/templates/drafts')
    return parseListResponse(data)
  },

  async create(input: { name: string; language?: string; category?: string; parameterFormat?: 'positional' | 'named' }): Promise<ManualDraftTemplate> {
    const data = await api.post<unknown>('/api/templates/drafts', input)
    return parseDraft(data, 'Resposta inválida ao criar rascunho')
  },

  async remove(id: string): Promise<void> {
    return api.del(`/api/templates/drafts/${encodeURIComponent(id)}`)
  },

  async update(
    id: string,
    patch: { name?: string; language?: string; category?: string; parameterFormat?: 'positional' | 'named'; spec?: unknown }
  ): Promise<ManualDraftTemplate> {
    const data = await api.patch<unknown>(`/api/templates/drafts/${encodeURIComponent(id)}`, patch)
    return parseDraft(data, 'Resposta inválida ao atualizar rascunho')
  },

  async submit(id: string): Promise<{ success: boolean; status?: string; id?: string; name?: string }> {
    return api.post(`/api/templates/drafts/${encodeURIComponent(id)}/submit`)
  },

  async clone(templateName: string): Promise<{ id: string; name: string; originalName: string }> {
    return api.post(`/api/templates/${encodeURIComponent(templateName)}/clone`)
  },
}
