import { api } from '@/lib/api'

export type SettingsPerformanceSource = 'run_metrics' | 'campaigns_fallback'

export interface SettingsPerformanceTotals {
  runs: number
  throughput_mps: { median: number | null; p90: number | null; samples: number }
  meta_avg_ms: { median: number | null; samples: number }
  db_avg_ms: { median: number | null; samples: number }
  throughput_429_rate: number | null
}

export interface SettingsPerformanceByConfigRow {
  config_hash: string
  sample_size: number
  throughput_mps: { median: number | null; p90: number | null }
  meta_avg_ms: { median: number | null }
  db_avg_ms: { median: number | null }
  throughput_429_rate: number
  first_seen_at: string | null
  last_seen_at: string | null
  config: any
}

export interface SettingsPerformanceRunRow {
  campaign_id: string
  trace_id: string
  template_name: string | null
  recipients: number | null
  sent_total: number | null
  failed_total: number | null
  skipped_total: number | null
  first_dispatch_at: string | null
  last_sent_at: string | null
  dispatch_duration_ms: number | null
  throughput_mps: number | null
  meta_avg_ms: number | null
  db_avg_ms: number | null
  saw_throughput_429: boolean | null
  config_hash: string | null
  config: any
  created_at: string
}

export interface SettingsPerformanceResponse {
  source: SettingsPerformanceSource
  rangeDays: number
  since: string
  totals: SettingsPerformanceTotals
  byConfig: SettingsPerformanceByConfigRow[]
  runs: SettingsPerformanceRunRow[]
  hint?: string
}

export const performanceService = {
  getSettingsPerformance: (opts?: { rangeDays?: number; limit?: number }): Promise<SettingsPerformanceResponse> => {
    const rangeDays = opts?.rangeDays ?? 30
    const limit = opts?.limit ?? 200
    const url = `/api/settings/performance?rangeDays=${encodeURIComponent(String(rangeDays))}&limit=${encodeURIComponent(String(limit))}`
    return api.get<SettingsPerformanceResponse>(url, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
  },
}
