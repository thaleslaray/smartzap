/**
 * T055: AI Agent Service - API client for AI agent operations
 * CRUD operations for AI agents configuration
 */

import type { AIAgent } from '@/types'
import type { EmbeddingProvider, RerankProvider } from '@/types'
import { api } from '@/lib/api'

// =============================================================================
// Types
// =============================================================================

export interface CreateAIAgentParams {
  name: string
  system_prompt: string
  model?: string
  temperature?: number
  max_tokens?: number
  is_active?: boolean
  is_default?: boolean
  debounce_ms?: number
  // RAG: Embedding config
  embedding_provider?: EmbeddingProvider
  embedding_model?: string
  embedding_dimensions?: number
  // RAG: Reranking config
  rerank_enabled?: boolean
  rerank_provider?: RerankProvider | null
  rerank_model?: string | null
  rerank_top_k?: number
  // RAG: Search config
  rag_similarity_threshold?: number
  rag_max_results?: number
  // Handoff config
  handoff_enabled?: boolean
  handoff_instructions?: string | null
  // Booking tool config
  booking_tool_enabled?: boolean
  // Tool permissions
  allow_reactions?: boolean
  allow_quotes?: boolean
}

export interface UpdateAIAgentParams {
  name?: string
  system_prompt?: string
  model?: string
  temperature?: number
  max_tokens?: number
  is_active?: boolean
  is_default?: boolean
  debounce_ms?: number
  // RAG: Embedding config
  embedding_provider?: EmbeddingProvider
  embedding_model?: string
  embedding_dimensions?: number
  // RAG: Reranking config
  rerank_enabled?: boolean
  rerank_provider?: RerankProvider | null
  rerank_model?: string | null
  rerank_top_k?: number
  // RAG: Search config
  rag_similarity_threshold?: number
  rag_max_results?: number
  // Handoff config
  handoff_enabled?: boolean
  handoff_instructions?: string | null
  // Booking tool config
  booking_tool_enabled?: boolean
  // Tool permissions
  allow_reactions?: boolean
  allow_quotes?: boolean
}

// =============================================================================
// Export Service
// =============================================================================

export const aiAgentService = {
  list: (): Promise<AIAgent[]> =>
    api.get<AIAgent[]>('/api/ai-agents'),

  get: (id: string): Promise<AIAgent> =>
    api.get<AIAgent>(`/api/ai-agents/${id}`),

  create: (params: CreateAIAgentParams): Promise<AIAgent> =>
    api.post<AIAgent>('/api/ai-agents', params),

  update: (id: string, params: UpdateAIAgentParams): Promise<AIAgent> =>
    api.patch<AIAgent>(`/api/ai-agents/${id}`, params),

  // DELETE endpoint retorna JSON — fetch manual necessário
  delete: async (id: string): Promise<{ success: boolean; deleted: string }> => {
    const response = await fetch(`/api/ai-agents/${id}`, { method: 'DELETE' })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to delete AI agent' }))
      throw new Error(error.error || 'Failed to delete AI agent')
    }
    return response.json()
  },

  setDefault: (id: string): Promise<AIAgent> =>
    api.patch<AIAgent>(`/api/ai-agents/${id}`, { is_default: true }),

  toggleActive: (id: string, isActive: boolean): Promise<AIAgent> =>
    api.patch<AIAgent>(`/api/ai-agents/${id}`, { is_active: isActive }),
}
