/**
 * Campaign Wizard — tipos, constantes e utilitários puros.
 *
 * Extraído de hooks/useCampaignNew.ts para permitir importação sem carregar
 * o hook inteiro. Não contém estado React nem efeitos colaterais.
 */

import type { Template } from '@/types'
import { api } from '@/lib/api'

// ── Types ──────────────────────────────────────────────────────────────

export type Contact = {
  id: string
  name: string
  phone: string
  email?: string | null
  tags?: string[]
  custom_fields?: Record<string, unknown>
}

export type CustomField = {
  key: string
  label: string
  type: string
}

export type TemplateVar = {
  key: string
  placeholder: string
  value: string
  required: boolean
}

// ── Constants ──────────────────────────────────────────────────────────

export const steps = [
  { id: 1, label: 'Configuração' },
  { id: 2, label: 'Público' },
  { id: 3, label: 'Validação' },
  { id: 4, label: 'Agendamento' },
]

// ── Pure utilities ─────────────────────────────────────────────────────

export const getDefaultScheduleTime = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() + 60)
  const minutes = d.getMinutes()
  if (minutes <= 30) {
    d.setMinutes(30, 0, 0)
  } else {
    d.setHours(d.getHours() + 1)
    d.setMinutes(0, 0, 0)
  }
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

export const formatDateLabel = (value: string) => {
  if (!value) return 'dd/mm/aaaa'
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return 'dd/mm/aaaa'
  return `${d}/${m}/${y}`
}

export const parsePickerDate = (value: string) => {
  if (!value) return undefined
  const [y, m, d] = value.split('-').map((v) => Number(v))
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d, 12, 0, 0)
}

export const buildScheduledAt = (date: string, time: string) => {
  if (!date || !time) return undefined
  const [year, month, day] = date.split('-').map((v) => Number(v))
  const [hour, minute] = time.split(':').map((v) => Number(v))
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) return undefined
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString()
}

/**
 * Extrai informações do Flow de um template, se houver um botão do tipo FLOW
 */
export const extractFlowFromTemplate = (template: Template | null): { flowId: string | null; flowName: string | null } => {
  if (!template?.components) return { flowId: null, flowName: null }

  for (const component of template.components) {
    if (component.type === 'BUTTONS' && component.buttons) {
      for (const button of component.buttons) {
        if (button.type === 'FLOW' && button.flow_id) {
          return {
            flowId: button.flow_id,
            flowName: button.text || null,
          }
        }
      }
    }
  }

  return { flowId: null, flowName: null }
}

export const fetchJson = <T,>(url: string): Promise<T> =>
  api.get<T>(url, { cache: 'no-store' })
