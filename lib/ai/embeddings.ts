/**
 * AI Embeddings - Google Gemini
 *
 * Gera embeddings vetoriais para RAG usando o Vercel AI SDK.
 * Provider: Google gemini-embedding-001 (768 dimensões, $0.025/1M tokens)
 */

import { embed, embedMany } from 'ai'

// =============================================================================
// Types
// =============================================================================

export type EmbeddingProvider = 'google'

export interface EmbeddingConfig {
  provider: EmbeddingProvider
  model: string
  dimensions: number
  apiKey?: string
}

// Provider info para UI de seleção
export interface EmbeddingProviderInfo {
  id: EmbeddingProvider
  name: string
  models: Array<{
    id: string
    name: string
    dimensions: number
    pricePerMillion: number
  }>
}

// =============================================================================
// Provider Configurations (para UI)
// =============================================================================

/**
 * Providers de embedding disponíveis.
 *
 * IMPORTANTE: A coluna pgvector está configurada para 768 dimensões.
 * Google Gemini embedding-001 gera 768 dimensões nativamente.
 */
export const EMBEDDING_PROVIDERS: EmbeddingProviderInfo[] = [
  {
    id: 'google',
    name: 'Google (Recomendado)',
    models: [
      { id: 'gemini-embedding-001', name: 'Gemini Embedding 001', dimensions: 768, pricePerMillion: 0.025 },
    ],
  },
]

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_EMBEDDING_CONFIG: Omit<EmbeddingConfig, 'apiKey'> = {
  provider: 'google',
  model: 'gemini-embedding-001',
  dimensions: 768,
}

// =============================================================================
// Provider Factory
// =============================================================================

/**
 * Cria o modelo de embedding Google Gemini via @ai-sdk/google.
 */
async function getEmbeddingModel(config: EmbeddingConfig) {
  const { createGoogleGenerativeAI } = await import('@ai-sdk/google')

  const apiKey = config.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Google API key não configurada para embeddings.')
  }

  const google = createGoogleGenerativeAI({ apiKey })
  console.log(`[embeddings] Google model: ${config.model}`)
  return google.textEmbeddingModel(config.model)
}

/**
 * Retorna providerOptions para o AI SDK — Google Gemini.
 * outputDimensionality e taskType (RETRIEVAL_QUERY vs RETRIEVAL_DOCUMENT).
 *
 * IMPORTANTE: Deve ser passado como `providerOptions: { ... }` no embed/embedMany
 */
function getProviderOptions(
  config: EmbeddingConfig,
  taskType: 'query' | 'document'
): Record<string, Record<string, string | number>> {
  return {
    google: {
      outputDimensionality: config.dimensions,
      taskType: taskType === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
    },
  }
}

// =============================================================================
// Embedding Functions
// =============================================================================

/**
 * Gera embedding para um único texto
 *
 * @param text - Texto para gerar embedding
 * @param config - Configuração do provider
 * @param taskType - 'query' para buscas, 'document' para indexação
 */
export async function generateEmbedding(
  text: string,
  config: EmbeddingConfig,
  taskType: 'query' | 'document' = 'query'
): Promise<number[]> {
  const model = await getEmbeddingModel(config)

  const { embedding } = await embed({
    model,
    value: text,
    experimental_telemetry: { isEnabled: false },
    providerOptions: getProviderOptions(config, taskType),
  })

  return embedding
}

/**
 * Gera embeddings para múltiplos textos (batch)
 * Mais eficiente que chamar generateEmbedding em loop
 *
 * @param texts - Array de textos
 * @param config - Configuração do provider
 * @param taskType - 'query' para buscas, 'document' para indexação
 */
export async function generateEmbeddings(
  texts: string[],
  config: EmbeddingConfig,
  taskType: 'query' | 'document' = 'document'
): Promise<number[][]> {
  const model = await getEmbeddingModel(config)

  const { embeddings } = await embedMany({
    model,
    values: texts,
    experimental_telemetry: { isEnabled: false },
    providerOptions: getProviderOptions(config, taskType),
  })

  return embeddings
}

// =============================================================================
// Chunking
// =============================================================================

const DEFAULT_CHUNK_SIZE = 1000
const DEFAULT_CHUNK_OVERLAP = 200
const MIN_CHUNK_LENGTH = 50

export interface ChunkingOptions {
  /** Tamanho máximo de cada chunk em caracteres (default: 1000) */
  chunkSize?: number
  /** Sobreposição entre chunks em caracteres (default: 200) */
  chunkOverlap?: number
  /** Tamanho mínimo de chunk para ser incluído (default: 50) */
  minChunkLength?: number
}

/**
 * Divide texto em chunks para indexação
 *
 * Usa chunking simples por caracteres com overlap.
 * Para casos mais avançados, considere semantic chunking ou RecursiveCharacterTextSplitter.
 */
export function chunkText(text: string, options: ChunkingOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE
  const chunkOverlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP
  const minChunkLength = options.minChunkLength ?? MIN_CHUNK_LENGTH

  // Normaliza whitespace
  const normalizedText = text.replace(/\s+/g, ' ').trim()

  if (normalizedText.length <= chunkSize) {
    return normalizedText.length >= minChunkLength ? [normalizedText] : []
  }

  const chunks: string[] = []
  let start = 0

  while (start < normalizedText.length) {
    let end = Math.min(start + chunkSize, normalizedText.length)

    // Tenta terminar em um limite de palavra ou frase
    if (end < normalizedText.length) {
      // Procura por quebra natural (., !, ?, \n) nos últimos 100 caracteres
      const searchStart = Math.max(end - 100, start)
      const lastSentenceEnd = Math.max(
        normalizedText.lastIndexOf('. ', end),
        normalizedText.lastIndexOf('! ', end),
        normalizedText.lastIndexOf('? ', end),
        normalizedText.lastIndexOf('\n', end)
      )

      if (lastSentenceEnd > searchStart) {
        end = lastSentenceEnd + 1
      } else {
        // Se não encontrou quebra de frase, tenta quebra de palavra
        const lastSpace = normalizedText.lastIndexOf(' ', end)
        if (lastSpace > searchStart) {
          end = lastSpace
        }
      }
    }

    const chunk = normalizedText.slice(start, end).trim()

    if (chunk.length >= minChunkLength) {
      chunks.push(chunk)
    }

    // Move start considerando overlap
    start = end - chunkOverlap
    if (start < 0) start = 0

    // Evita loop infinito
    if (start >= normalizedText.length - chunkOverlap) {
      break
    }
  }

  return chunks
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Converte embedding para formato pgvector
 *
 * IMPORTANTE: A coluna pgvector deve ter a mesma dimensão do modelo de embedding.
 * Google Gemini embedding-001 = 768 dimensões.
 * Não use padding - use a dimensão exata conforme a documentação do Supabase.
 */
export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

/**
 * Valida se config de embedding é válida
 */
export function validateEmbeddingConfig(config: Partial<EmbeddingConfig>): string | null {
  if (!config.provider) {
    return 'Provider de embedding não configurado'
  }

  if (!config.model) {
    return 'Modelo de embedding não configurado'
  }

  if (!config.dimensions || config.dimensions <= 0) {
    return 'Dimensões de embedding inválidas'
  }

  const provider = EMBEDDING_PROVIDERS.find((p) => p.id === config.provider)
  if (!provider) {
    return `Provider "${config.provider}" não suportado`
  }

  const model = provider.models.find((m) => m.id === config.model)
  if (!model) {
    return `Modelo "${config.model}" não encontrado para provider "${config.provider}"`
  }

  return null
}

/**
 * Obtém dimensões padrão para um modelo
 */
export function getModelDimensions(provider: EmbeddingProvider, model: string): number | null {
  const providerInfo = EMBEDDING_PROVIDERS.find((p) => p.id === provider)
  const modelInfo = providerInfo?.models.find((m) => m.id === model)
  return modelInfo?.dimensions ?? null
}
