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
  list: (): Promise<FlowTemplateDTO[]> =>
    api.get<FlowTemplateDTO[]>('/api/flows/templates'),
}
