/**
 * Knowledge Base API
 * Manage knowledge base files for AI agents
 * Uses pgvector for RAG (Retrieval Augmented Generation)
 *
 * Flow:
 * 1. Upload file → OCR if needed → Chunk → Embed → Store in pgvector
 * 2. Store metadata in database (ai_knowledge_files)
 * 3. Agent queries use pgvector similarity search
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { processDocumentOCR } from '@/lib/ai/ocr'
import {
  indexDocument,
  deleteFileEmbeddings,
  buildEmbeddingConfigFromAgent,
} from '@/lib/ai/rag-store'
import type { AIAgent, EmbeddingProvider } from '@/types'

// Helper to get admin client with null check
function getClient() {
  const client = getSupabaseAdmin()
  if (!client) {
    throw new Error('Supabase admin client not configured. Check SUPABASE_SECRET_KEY env var.')
  }
  return client
}

// Mapeamento de provider para chave de API na tabela settings
const EMBEDDING_API_KEY_MAP: Record<EmbeddingProvider, { settingKey: string; envVar: string; label: string }> = {
  google: { settingKey: 'gemini_api_key', envVar: 'GEMINI_API_KEY', label: 'Google Gemini' },
  openai: { settingKey: 'openai_api_key', envVar: 'OPENAI_API_KEY', label: 'OpenAI' },
  voyage: { settingKey: 'voyage_api_key', envVar: 'VOYAGE_API_KEY', label: 'Voyage AI' },
  cohere: { settingKey: 'cohere_api_key', envVar: 'COHERE_API_KEY', label: 'Cohere' },
}

/**
 * Busca a API key correta para o provider de embedding
 */
async function getEmbeddingApiKey(
  supabase: SupabaseClient,
  provider: EmbeddingProvider
): Promise<{ apiKey: string | null; providerLabel: string }> {
  const config = EMBEDDING_API_KEY_MAP[provider] || EMBEDDING_API_KEY_MAP.google

  const { data: setting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', config.settingKey)
    .maybeSingle()

  const apiKey = setting?.value || process.env[config.envVar] || null

  return { apiKey, providerLabel: config.label }
}

const uploadFileSchema = z.object({
  agent_id: z.string().uuid('ID do agente inválido'),
  name: z.string().min(1, 'Nome é obrigatório').max(255),
  content: z.string().min(1, 'Conteúdo é obrigatório'),
  mime_type: z.string().default('text/plain'),
})

/**
 * Sanitize content for PostgreSQL TEXT fields
 * Removes null bytes (\u0000) which PostgreSQL doesn't support
 */
function sanitizeContent(content: string): string {
  // Remove null bytes that PostgreSQL can't store in TEXT fields
  // eslint-disable-next-line no-control-regex
  return content.replace(/\u0000/g, '')
}

// GET - List knowledge base files for an agent
export async function GET(request: NextRequest) {
  try {
    const supabase = getClient()
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')

    if (!agentId) {
      return NextResponse.json(
        { error: 'agent_id é obrigatório' },
        { status: 400 }
      )
    }

    // Validate agent exists
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('id', agentId)
      .single()

    if (agentError || !agent) {
      return NextResponse.json(
        { error: 'Agente não encontrado' },
        { status: 404 }
      )
    }

    // Get knowledge base files
    const { data: files, error } = await supabase
      .from('ai_knowledge_files')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[knowledge] Error fetching files:', error)
      return NextResponse.json(
        { error: 'Erro ao buscar arquivos' },
        { status: 500 }
      )
    }

    return NextResponse.json({ files: files || [] })
  } catch (error) {
    console.error('[knowledge] GET Error:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

// POST - Upload a new knowledge base file
export async function POST(request: NextRequest) {
  try {
    const supabase = getClient()
    const body = await request.json()

    // Validate body
    const parsed = uploadFileSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { agent_id, name, content, mime_type } = parsed.data

    // Validate agent exists and get RAG config
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', agent_id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json(
        { error: 'Agente não encontrado' },
        { status: 404 }
      )
    }

    // Get API key for the configured embedding provider
    const embeddingProvider = (agent.embedding_provider || 'google') as EmbeddingProvider
    const { apiKey, providerLabel } = await getEmbeddingApiKey(supabase, embeddingProvider)

    if (!apiKey) {
      return NextResponse.json(
        { error: `API key do ${providerLabel} não configurada. Configure em Configurações > IA.` },
        { status: 400 }
      )
    }

    // Sanitize content for PostgreSQL (remove null bytes)
    const sanitizedContent = sanitizeContent(content)

    // Create file record first (with processing status)
    const { data: file, error: insertError } = await supabase
      .from('ai_knowledge_files')
      .insert({
        agent_id,
        name,
        mime_type,
        size_bytes: new TextEncoder().encode(sanitizedContent).length,
        content: sanitizedContent,
        indexing_status: 'processing',
        chunks_count: 0,
      })
      .select()
      .single()

    if (insertError || !file) {
      console.error('[knowledge] Error creating file:', insertError)
      return NextResponse.json(
        { error: 'Erro ao criar arquivo' },
        { status: 500 }
      )
    }

    // Index file in pgvector (async but we wait for it)
    let indexingStatus: 'completed' | 'failed' = 'failed'
    let chunksCount = 0

    try {
      // Process with OCR if needed (PDFs, images, Office docs → Markdown)
      const {
        content: processedContent,
        ocrResult,
      } = await processDocumentOCR(sanitizedContent, mime_type, name)

      if (ocrResult) {
        console.log(
          `[knowledge] OCR by ${ocrResult.provider}${ocrResult.model ? ` (${ocrResult.model})` : ''}: ${ocrResult.pagesProcessed ?? '?'} pages, ${processedContent.length} chars`
        )
      }

      console.log(`[knowledge] Indexing ${name} in pgvector for agent ${agent_id}`)

      // Build embedding config from agent settings
      const embeddingConfig = buildEmbeddingConfigFromAgent(agent as AIAgent)

      // Index document (chunk → embed → store)
      const result = await indexDocument({
        agentId: agent_id,
        fileId: file.id,
        content: processedContent,
        embeddingConfig,
        metadata: {
          filename: name,
          mimeType: mime_type,
        },
      })

      if (result.success) {
        indexingStatus = 'completed'
        chunksCount = result.chunksIndexed
        console.log(`[knowledge] Indexed ${chunksCount} chunks for ${name}`)
      } else {
        console.error(`[knowledge] Indexing failed: ${result.error}`)
      }
    } catch (indexError) {
      console.error('[knowledge] Indexing error:', indexError)
      // Continue - file is saved, just not indexed
    }

    // Update file with indexing status
    const { error: updateError } = await supabase
      .from('ai_knowledge_files')
      .update({
        indexing_status: indexingStatus,
        chunks_count: chunksCount,
      })
      .eq('id', file.id)

    if (updateError) {
      console.error('[knowledge] Error updating file status:', updateError)
    }

    // Return updated file data
    const { data: updatedFile } = await supabase
      .from('ai_knowledge_files')
      .select('*')
      .eq('id', file.id)
      .single()

    return NextResponse.json({
      file: updatedFile || file,
      indexing_status: indexingStatus,
      chunks_indexed: chunksCount,
    }, { status: 201 })
  } catch (error) {
    console.error('[knowledge] POST Error:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

// DELETE - Remove a knowledge base file
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getClient()
    const { searchParams } = new URL(request.url)
    const fileId = searchParams.get('id')

    if (!fileId) {
      return NextResponse.json(
        { error: 'id é obrigatório' },
        { status: 400 }
      )
    }

    // Get file to verify it exists
    const { data: file, error: fileError } = await supabase
      .from('ai_knowledge_files')
      .select('*')
      .eq('id', fileId)
      .single()

    if (fileError || !file) {
      return NextResponse.json(
        { error: 'Arquivo não encontrado' },
        { status: 404 }
      )
    }

    // Delete embeddings from pgvector
    try {
      await deleteFileEmbeddings(fileId)
      console.log(`[knowledge] Deleted embeddings for file ${fileId}`)
    } catch (deleteError) {
      console.error('[knowledge] Error deleting embeddings:', deleteError)
      // Continue with file deletion even if embeddings deletion fails
    }

    // Delete from database (this will cascade delete embeddings due to FK)
    const { error } = await supabase
      .from('ai_knowledge_files')
      .delete()
      .eq('id', fileId)

    if (error) {
      console.error('[knowledge] Error deleting file:', error)
      return NextResponse.json(
        { error: 'Erro ao excluir arquivo' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, deleted: fileId })
  } catch (error) {
    console.error('[knowledge] DELETE Error:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
