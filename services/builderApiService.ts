/**
 * Builder API Service
 * Handles workflow execution and API key management for the builder
 */

import { api } from '@/lib/api'

export type ApiKey = {
  id: string
  name: string | null
  keyPrefix: string
  createdAt: string
  lastUsedAt: string | null
  key?: string
}

export const builderApiService = {
  // =============================================================================
  // API KEYS
  // =============================================================================

  listApiKeys: (): Promise<ApiKey[]> =>
    api.get<ApiKey[]>('/api/builder/api-keys'),

  createApiKey: (name?: string | null): Promise<ApiKey> =>
    api.post<ApiKey>('/api/builder/api-keys', { name: name || null }),

  deleteApiKey: (keyId: string): Promise<void> =>
    api.del(`/api/builder/api-keys/${keyId}`),

  // =============================================================================
  // WORKFLOW EXECUTION
  // =============================================================================

  executeWorkflow: (
    workflowId: string,
    input?: Record<string, unknown>
  ): Promise<{ executionId: string }> =>
    api.post<{ executionId: string }>(`/api/builder/workflow/${workflowId}/execute`, {
      input: input || {},
    }),
}
