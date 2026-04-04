/**
 * RAG Store - Indexação e Busca com pgvector
 *
 * Este módulo gerencia o armazenamento e recuperação de embeddings no Supabase.
 * Substitui o Google File Search para permitir uso de `messages[]` no AI SDK.
 *
 * Fluxo:
 * 1. indexDocument: Chunking → Embeddings → Armazenar no pgvector
 * 2. findRelevantContent: Embedding da query → Busca por similaridade → Rerank (opcional)
 */

import { getSupabaseAdmin } from '@/lib/supabase'
import {
  chunkText,
  generateEmbedding,
  generateEmbeddings,
  toPgVector,
  type EmbeddingConfig,
  type ChunkingOptions,
} from './embeddings'
import { rerankDocuments, isRerankEnabled, type RerankConfig } from './reranking'
import type { AIAgent } from '@/types'

// =============================================================================
// Types
// =============================================================================

export interface IndexDocumentParams {
  agentId: string
  fileId: string
  content: string
  embeddingConfig: EmbeddingConfig
  metadata?: Record<string, unknown>
  chunkingOptions?: ChunkingOptions
}

export interface IndexDocumentResult {
  success: boolean
  chunksIndexed: number
  error?: string
}

export interface SearchParams {
  agentId: string
  query: string
  embeddingConfig: EmbeddingConfig
  rerankConfig?: RerankConfig | null
  topK?: number
  threshold?: number
}

export interface SearchResult {
  content: string
  similarity: number
  metadata?: Record<string, unknown>
}

// =============================================================================
// Index Operations
// =============================================================================

/**
 * Indexa um documento no pgvector
 *
 * 1. Divide o texto em chunks
 * 2. Gera embeddings para cada chunk
 * 3. Armazena no Supabase
 */
export async function indexDocument(
  params: IndexDocumentParams
): Promise<IndexDocumentResult> {
  const { agentId, fileId, content, embeddingConfig, metadata, chunkingOptions } = params

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return { success: false, chunksIndexed: 0, error: 'Supabase not configured' }
  }

  try {
    // 1. Chunk the content
    const chunks = chunkText(content, chunkingOptions)

    if (chunks.length === 0) {
      return { success: false, chunksIndexed: 0, error: 'No valid chunks generated from content' }
    }

    console.log(`[rag-store] Indexing ${chunks.length} chunks for file ${fileId}`)

    // 2. Generate embeddings (batch)
    const embeddings = await generateEmbeddings(chunks, embeddingConfig, 'document')

    // 3. Prepare rows for insert
    const rows = chunks.map((chunkContent, i) => ({
      agent_id: agentId,
      file_id: fileId,
      content: chunkContent,
      embedding: toPgVector(embeddings[i]),
      dimensions: embeddingConfig.dimensions,
      metadata: metadata || {},
    }))

    // 4. Insert in batches (Supabase has limits)
    const BATCH_SIZE = 100
    let totalInserted = 0

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const { error } = await supabase.from('ai_embeddings').insert(batch)

      if (error) {
        console.error(`[rag-store] Insert error at batch ${i / BATCH_SIZE}:`, error)
        throw error
      }

      totalInserted += batch.length
    }

    console.log(`[rag-store] Successfully indexed ${totalInserted} chunks`)

    return { success: true, chunksIndexed: totalInserted }

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('[rag-store] indexDocument error:', errorMessage)
    return { success: false, chunksIndexed: 0, error: errorMessage }
  }
}

/**
 * Deleta todos os embeddings de um arquivo
 */
export async function deleteFileEmbeddings(fileId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    throw new Error('Supabase not configured')
  }

  const { error } = await supabase
    .from('ai_embeddings')
    .delete()
    .eq('file_id', fileId)

  if (error) {
    console.error('[rag-store] deleteFileEmbeddings error:', error)
    throw error
  }

  console.log(`[rag-store] Deleted embeddings for file ${fileId}`)
}

/**
 * Deleta todos os embeddings de um agente
 */
export async function deleteAgentEmbeddings(agentId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    throw new Error('Supabase not configured')
  }

  const { error } = await supabase
    .from('ai_embeddings')
    .delete()
    .eq('agent_id', agentId)

  if (error) {
    console.error('[rag-store] deleteAgentEmbeddings error:', error)
    throw error
  }

  console.log(`[rag-store] Deleted all embeddings for agent ${agentId}`)
}

// =============================================================================
// Search Operations
// =============================================================================

/**
 * Busca conteúdo relevante usando similaridade de cosseno + reranking opcional
 *
 * 1. Gera embedding da query
 * 2. Busca por similaridade no pgvector
 * 3. Aplica reranking se habilitado
 */
export async function findRelevantContent(
  params: SearchParams
): Promise<SearchResult[]> {
  const {
    agentId,
    query,
    embeddingConfig,
    rerankConfig,
    topK = 5,
    threshold = 0.5,
  } = params

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    throw new Error('Supabase not configured')
  }

  try {
    // 1. Generate query embedding
    const queryEmbedding = await generateEmbedding(query, embeddingConfig, 'query')

    // 2. Search using pgvector function
    // Se reranking está habilitado, busca mais candidatos
    const searchTopK = rerankConfig ? Math.max(topK * 3, 15) : topK

    const { data, error } = await supabase.rpc('search_embeddings', {
      query_embedding: toPgVector(queryEmbedding),
      agent_id_filter: agentId,
      expected_dimensions: embeddingConfig.dimensions,
      match_threshold: threshold,
      match_count: searchTopK,
    })

    if (error) {
      console.error('[rag-store] search_embeddings error:', error)
      throw error
    }

    if (!data || data.length === 0) {
      console.log('[rag-store] No relevant content found')
      return []
    }

    console.log(`[rag-store] Found ${data.length} candidates with threshold ${threshold}`)

    // 3. Apply reranking if configured
    if (rerankConfig) {
      console.log(`[rag-store] Applying reranking with ${rerankConfig.provider}/${rerankConfig.model}`)

      const rerankedResults = await rerankDocuments(
        query,
        data.map((d: { content: string; metadata: Record<string, unknown> }) => ({
          content: d.content,
          metadata: d.metadata,
        })),
        { ...rerankConfig, topK }
      )

      return rerankedResults.map((r) => ({
        content: r.content,
        similarity: r.score,
        metadata: r.metadata,
      }))
    }

    // Return top K results without reranking
    return data.slice(0, topK).map((d: { content: string; similarity: number; metadata: Record<string, unknown> }) => ({
      content: d.content,
      similarity: d.similarity,
      metadata: d.metadata,
    }))

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('[rag-store] findRelevantContent error:', errorMessage)
    throw err
  }
}

// =============================================================================
// Helper: Build Config from Agent
// =============================================================================

/**
 * Constrói EmbeddingConfig a partir de um AIAgent
 */
export function buildEmbeddingConfigFromAgent(agent: AIAgent): EmbeddingConfig {
  return {
    provider: (agent.embedding_provider || 'google') as EmbeddingConfig['provider'],
    model: agent.embedding_model || 'gemini-embedding-001',
    dimensions: agent.embedding_dimensions || 768,
  }
}

/**
 * Constrói RerankConfig a partir de um AIAgent (se habilitado)
 */
export async function buildRerankConfigFromAgent(
  agent: AIAgent
): Promise<RerankConfig | null> {
  if (!isRerankEnabled(agent)) {
    return null
  }

  // Busca API key do provider de reranking na tabela settings
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    console.warn('[rag-store] Supabase not available for rerank config')
    return null
  }

  const rerankProvider = agent.rerank_provider as RerankConfig['provider']

  // Mapeia provider para chave de configuração
  const apiKeyMap: Record<string, string> = {
    cohere: 'cohere_api_key',
    together: 'together_api_key',
  }

  const settingKey = apiKeyMap[rerankProvider]
  if (!settingKey) {
    console.warn(`[rag-store] Unknown rerank provider: ${rerankProvider}`)
    return null
  }

  const { data: setting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', settingKey)
    .maybeSingle()

  if (!setting?.value) {
    console.warn(`[rag-store] API key not configured for rerank provider: ${rerankProvider}`)
    return null
  }

  return {
    provider: rerankProvider,
    model: agent.rerank_model!,
    apiKey: setting.value,
    topK: agent.rerank_top_k || 5,
  }
}

// =============================================================================
// Stats
// =============================================================================

/**
 * Obtém estatísticas de embeddings de um agente
 */
export async function getAgentEmbeddingStats(agentId: string): Promise<{
  totalChunks: number
  totalFiles: number
  dimensions: number | null
}> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    throw new Error('Supabase not configured')
  }

  const { data, error } = await supabase
    .from('ai_embeddings')
    .select('file_id, dimensions')
    .eq('agent_id', agentId)

  if (error) {
    throw error
  }

  if (!data || data.length === 0) {
    return { totalChunks: 0, totalFiles: 0, dimensions: null }
  }

  const uniqueFiles = new Set(data.map((d) => d.file_id))

  return {
    totalChunks: data.length,
    totalFiles: uniqueFiles.size,
    dimensions: data[0]?.dimensions ?? null,
  }
}

/**
 * Verifica se um agente tem embeddings indexados
 */
export async function hasIndexedContent(agentId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return false
  }

  const { count, error } = await supabase
    .from('ai_embeddings')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', agentId)

  if (error) {
    console.error('[rag-store] hasIndexedContent error:', error)
    return false
  }

  return (count ?? 0) > 0
}
