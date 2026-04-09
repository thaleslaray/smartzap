/**
 * LLM Providers API
 * Retorna quais providers de LLM estão disponíveis (têm API key configurada)
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { AI_PROVIDERS, type AIProvider } from '@/lib/ai/providers'

// Mapeamento de provider para chave de API na tabela settings
const LLM_API_KEY_MAP: Record<AIProvider, { settingKey: string; envVar: string }> = {
  google: { settingKey: 'google_api_key', envVar: 'GOOGLE_GENERATIVE_AI_API_KEY' },
}

/**
 * GET /api/ai-agents/llm-providers
 * Retorna lista de providers com status de disponibilidade
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 500 }
      )
    }

    // Busca todas as API keys de LLM de uma vez
    const settingKeys = Object.values(LLM_API_KEY_MAP).map(c => c.settingKey)

    const { data: settings } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', settingKeys)

    // Cria mapa de quais keys existem
    const configuredKeys = new Set(
      settings
        ?.filter(s => s.value && s.value.trim() !== '')
        .map(s => s.key) || []
    )

    // Verifica também env vars
    const availableProviders = AI_PROVIDERS.map(provider => {
      const config = LLM_API_KEY_MAP[provider.id]
      const hasApiKey =
        configuredKeys.has(config.settingKey) ||
        Boolean(process.env[config.envVar])

      return {
        ...provider,
        available: hasApiKey,
        reason: hasApiKey ? null : `API key não configurada`,
      }
    })

    return NextResponse.json({
      providers: availableProviders,
    })
  } catch (error) {
    console.error('[llm-providers] Error:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar providers' },
      { status: 500 }
    )
  }
}
