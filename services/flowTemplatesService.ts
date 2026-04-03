import { api } from '@/lib/api'

export type FlowTemplateDTO = {
  key: string
  name: string
  description: string
  flowJson: Record<string, unknown>
  defaultMapping: any
  isDynamic: boolean
}

export const flowTemplatesService = {
  async list(): Promise<FlowTemplateDTO[]> {
    const data = await api.get<unknown>('/api/flows/templates')
    return Array.isArray(data) ? (data as FlowTemplateDTO[]) : []
  },
}
