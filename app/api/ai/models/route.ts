import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export interface AIModelInfo {
  id: string
  name: string
  provider: 'google'
  /** true = alias auto-atualizado (ex: gemini-flash-latest) */
  isAlias: boolean
}

// Padrões de modelos a excluir do fetch do Google
const GOOGLE_EXCLUDED_PATTERNS = [
  'tts', 'image', 'robotics', 'computer-use', 'deep-research',
  'lyria', 'gemma', 'nano-banana', 'embedding', 'aqa',
]

function isGoogleExcluded(id: string): boolean {
  return GOOGLE_EXCLUDED_PATTERNS.some((p) => id.includes(p))
}

async function getSettingValue(key: string): Promise<string | null> {
  const { data, error } = await supabase.admin
    ?.from('settings')
    .select('value')
    .eq('key', key)
    .single() || { data: null, error: null }
  if (error || !data) return null
  return data.value
}

async function fetchGoogleModels(apiKey: string): Promise<AIModelInfo[]> {
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
    { headers: { 'x-goog-api-key': apiKey } }
  )
  if (!res.ok) throw new Error(`Google API error: HTTP ${res.status}`)

  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: AIModelInfo[] = (data.models ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((m: any) => {
      const id: string = m.name.replace('models/', '')
      return (
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent') &&
        !isGoogleExcluded(id)
      )
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => {
      const id: string = m.name.replace('models/', '')
      return {
        id,
        name: m.displayName || id,
        provider: 'google' as const,
        isAlias: id.endsWith('-latest'),
      }
    })

  // Aliases primeiro (sempre atualizados), depois versões fixas mais recente → mais antigo
  const aliases = all.filter((m) => m.isAlias)
  const pinned = all
    .filter((m) => !m.isAlias)
    .sort((a, b) => b.id.localeCompare(a.id))

  return [...aliases, ...pinned]
}

/**
 * GET /api/ai/models
 *
 * Retorna lista de modelos Google Gemini disponíveis,
 * buscando diretamente da API do Google com a chave configurada no banco.
 */
export async function GET() {
  const apiKey = await getSettingValue('google_api_key')

  if (!apiKey) {
    return NextResponse.json({ models: [] })
  }

  try {
    const models = await fetchGoogleModels(apiKey)
    return NextResponse.json({ models })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error(`[api/ai/models] ${message}`)
    return NextResponse.json(
      { error: `Falha ao buscar modelos: ${message}` },
      { status: 502 }
    )
  }
}
