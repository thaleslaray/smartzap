/**
 * T053: AI Agents API - List and Create
 * GET /api/ai-agents - List all AI agents
 * POST /api/ai-agents - Create new AI agent
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase'
import { DEFAULT_MODEL_ID } from '@/lib/ai/model'

// Helper to get admin client with null check
function getClient() {
  const client = getSupabaseAdmin()
  if (!client) {
    throw new Error('Supabase admin client not configured. Check SUPABASE_SECRET_KEY env var.')
  }
  return client
}

// Create agent schema
const createAgentSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  system_prompt: z.string().min(10, 'System prompt deve ter pelo menos 10 caracteres'),
  model: z.string().default(DEFAULT_MODEL_ID),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().int().min(100).max(8192).default(1024),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
  debounce_ms: z.number().int().min(0).max(30000).default(5000),
  // RAG: Embedding config
  embedding_provider: z.enum(['google', 'openai', 'voyage', 'cohere']).default('google'),
  embedding_model: z.string().default('gemini-embedding-001'),
  embedding_dimensions: z.number().int().min(256).max(2000).default(768),
  // RAG: Reranking config
  rerank_enabled: z.boolean().default(false),
  rerank_provider: z.enum(['cohere', 'together']).nullable().optional(),
  rerank_model: z.string().nullable().optional(),
  rerank_top_k: z.number().int().min(1).max(20).default(5),
  // RAG: Search config
  rag_similarity_threshold: z.number().min(0).max(1).default(0.5),
  rag_max_results: z.number().int().min(1).max(20).default(5),
  // Handoff config
  handoff_enabled: z.boolean().default(true),
  handoff_instructions: z.string().nullable().optional(),
  // Booking tool config
  booking_tool_enabled: z.boolean().default(false),
  // Tool permissions
  allow_reactions: z.boolean().default(true),
  allow_quotes: z.boolean().default(true),
})

/**
 * GET /api/ai-agents
 * List all AI agents
 */
export async function GET() {
  try {
    const supabase = getClient()

    const { data: agents, error } = await supabase
      .from('ai_agents')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[AI Agents] Failed to list agents:', error)
      return NextResponse.json(
        { error: 'Failed to fetch AI agents' },
        { status: 500 }
      )
    }

    return NextResponse.json(agents)
  } catch (error) {
    console.error('[AI Agents] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/ai-agents
 * Create a new AI agent
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getClient()

    // Parse request body
    const body = await request.json()
    const parsed = createAgentSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const data = parsed.data

    // Verifica se é o primeiro agente - se sim, marca como padrão automaticamente
    const { count } = await supabase
      .from('ai_agents')
      .select('*', { count: 'exact', head: true })

    // count pode ser null quando não há registros
    const isFirstAgent = !count || count === 0
    if (isFirstAgent) {
      data.is_default = true
    }

    // If setting as default, unset other defaults first
    if (data.is_default) {
      await supabase
        .from('ai_agents')
        .update({ is_default: false })
        .eq('is_default', true)
    }

    // Create agent
    const { data: agent, error } = await supabase
      .from('ai_agents')
      .insert({
        name: data.name,
        system_prompt: data.system_prompt,
        model: data.model,
        temperature: data.temperature,
        max_tokens: data.max_tokens,
        is_active: data.is_active,
        is_default: data.is_default,
        debounce_ms: data.debounce_ms,
        // RAG config
        embedding_provider: data.embedding_provider,
        embedding_model: data.embedding_model,
        embedding_dimensions: data.embedding_dimensions,
        rerank_enabled: data.rerank_enabled,
        rerank_provider: data.rerank_provider || null,
        rerank_model: data.rerank_model || null,
        rerank_top_k: data.rerank_top_k,
        rag_similarity_threshold: data.rag_similarity_threshold,
        rag_max_results: data.rag_max_results,
        // Handoff config
        handoff_enabled: data.handoff_enabled,
        handoff_instructions: data.handoff_instructions || null,
        // Booking tool config
        booking_tool_enabled: data.booking_tool_enabled,
        // Tool permissions
        allow_reactions: data.allow_reactions,
        allow_quotes: data.allow_quotes,
      })
      .select()
      .single()

    if (error) {
      console.error('[AI Agents] Failed to create agent:', error)
      return NextResponse.json(
        { error: 'Failed to create AI agent' },
        { status: 500 }
      )
    }

    return NextResponse.json(agent, { status: 201 })
  } catch (error) {
    console.error('[AI Agents] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
