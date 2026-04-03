import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateBodyOrError } from '@/lib/api-validation'
import { generateJSON } from '@/lib/ai'
import { isAiRouteEnabled } from '@/lib/ai/ai-center-config'

/**
 * POST /api/ai/extract-content
 *
 * Extrai informações estruturadas de texto bruto (página de vendas, descrição, etc).
 * Usado na primeira etapa do novo fluxo de criação de templates.
 *
 * Input: Texto bruto (até 15000 chars)
 * Output: JSON com informações extraídas (produto, data, preço, benefícios, etc)
 */

const ExtractContentSchema = z.object({
  content: z.string()
    .min(50, 'Conteúdo muito curto. Cole mais informações.')
    .max(15000, 'Conteúdo muito longo. Máximo 15000 caracteres.'),
  language: z.enum(['pt_BR', 'en_US', 'es_ES']).default('pt_BR'),
})

// Schema do resultado da extração
export interface ExtractedContent {
  // Identificação
  productName: string           // Nome do produto/evento/serviço
  productType: 'evento' | 'curso' | 'produto' | 'servico' | 'outro'
  author?: string               // Quem está oferecendo

  // Detalhes temporais
  date?: string                 // Data do evento/lançamento
  time?: string                 // Horário
  duration?: string             // Duração (ex: "2 dias", "8 semanas")
  deadline?: string             // Prazo/urgência

  // Oferta
  price?: string                // Preço atual
  originalPrice?: string        // Preço original (se tiver desconto)
  discount?: string             // Desconto (ex: "60% OFF", "R$300 de desconto")
  paymentOptions?: string       // Formas de pagamento

  // Benefícios e diferenciais
  mainBenefit: string           // Benefício principal em 1 frase
  benefits: string[]            // Lista de benefícios (max 5)
  bonuses?: string[]            // Bônus inclusos
  guarantee?: string            // Garantia oferecida

  // Call to action
  targetAudience?: string       // Público-alvo
  mainCTA: string               // Call to action principal

  // Links
  url?: string                  // URL detectada

  // Meta
  summary: string               // Resumo em 2-3 frases para usar como prompt
  confidence: number            // 0-1, confiança na extração
}

const EXTRACTION_PROMPT = `
Você é um especialista em análise de conteúdo de marketing.

Analise o texto abaixo e extraia TODAS as informações relevantes para criar templates de WhatsApp.

## TEXTO PARA ANALISAR:
"""
{{content}}
"""

## INSTRUÇÕES:
1. Extraia as informações mesmo que não estejam explícitas - use o contexto
2. Se não encontrar uma informação, deixe o campo vazio (não invente)
3. Para benefícios, liste os 5 mais importantes
4. O summary deve ser um resumo conciso que sirva como prompt para gerar templates
5. URLs: extraia qualquer link encontrado no texto

## FORMATO DE RESPOSTA (JSON):
{
  "productName": "Nome do produto/evento/serviço",
  "productType": "evento|curso|produto|servico|outro",
  "author": "Quem oferece (pessoa ou empresa)",

  "date": "Data (formato brasileiro)",
  "time": "Horário",
  "duration": "Duração",
  "deadline": "Prazo ou urgência",

  "price": "Preço atual",
  "originalPrice": "Preço original (se houver desconto)",
  "discount": "Desconto em % ou R$",
  "paymentOptions": "Formas de pagamento",

  "mainBenefit": "O benefício principal em 1 frase curta",
  "benefits": ["Benefício 1", "Benefício 2", "..."],
  "bonuses": ["Bônus 1", "Bônus 2"],
  "guarantee": "Garantia oferecida",

  "targetAudience": "Para quem é",
  "mainCTA": "Ação principal que o usuário deve tomar",

  "url": "Link encontrado no texto",

  "summary": "Resumo em 2-3 frases para usar como prompt de geração",
  "confidence": 0.95
}

IMPORTANTE: Retorne APENAS o JSON, sem markdown ou explicações.
`

export async function POST(request: NextRequest) {
  try {
    // Verificar se rota está habilitada
    const routeEnabled = await isAiRouteEnabled('generateUtilityTemplates')
    if (!routeEnabled) {
      return NextResponse.json(
        { error: 'Rota de IA desativada nas configurações.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validation = validateBodyOrError(ExtractContentSchema, body)
    if (!validation.success) return validation.response

    const { content } = validation.data

    // Montar prompt com conteúdo
    const prompt = EXTRACTION_PROMPT.replace('{{content}}', content)

    // Chamar IA para extrair
    const extracted = await generateJSON<ExtractedContent>({ prompt })

    // Validar resultado mínimo
    if (!extracted.productName || !extracted.mainBenefit) {
      return NextResponse.json({
        error: 'Não foi possível extrair informações suficientes do conteúdo.',
        hint: 'Tente colar mais detalhes sobre o produto/evento.'
      }, { status: 422 })
    }

    // Detectar URL no conteúdo original se não foi extraída
    if (!extracted.url) {
      const urlMatch = content.match(/https?:\/\/[^\s\])"']+/i)
      if (urlMatch) {
        extracted.url = urlMatch[0]
      }
    }

    // Garantir que summary existe
    if (!extracted.summary) {
      extracted.summary = `${extracted.productName}. ${extracted.mainBenefit}. ${extracted.date ? `Data: ${extracted.date}.` : ''}`
    }

    return NextResponse.json({
      success: true,
      extracted,
      // Gera um prompt sugerido baseado na extração
      suggestedPrompt: buildSuggestedPrompt(extracted)
    })

  } catch (error) {
    console.error('[extract-content] Error:', error)
    return NextResponse.json(
      { error: 'Falha ao extrair conteúdo com IA' },
      { status: 500 }
    )
  }
}

/**
 * Constrói um prompt otimizado baseado nas informações extraídas
 */
function buildSuggestedPrompt(extracted: ExtractedContent): string {
  const parts: string[] = []

  // Nome e tipo
  parts.push(extracted.productName)
  if (extracted.author) parts.push(`com ${extracted.author}`)

  // Data e horário
  if (extracted.date) {
    parts.push(`${extracted.date}${extracted.time ? ` às ${extracted.time}` : ''}`)
  }

  // Benefício principal
  parts.push(extracted.mainBenefit)

  // Preço/desconto
  if (extracted.discount && extracted.price) {
    parts.push(`${extracted.discount} - ${extracted.price}`)
  } else if (extracted.price) {
    parts.push(extracted.price)
  }

  // Bônus principais
  if (extracted.bonuses && extracted.bonuses.length > 0) {
    parts.push(`Inclui: ${extracted.bonuses.slice(0, 2).join(', ')}`)
  }

  // Garantia
  if (extracted.guarantee) {
    parts.push(extracted.guarantee)
  }

  // URL
  if (extracted.url) {
    parts.push(`Link: ${extracted.url}`)
  }

  return parts.join('. ').replace(/\.\./g, '.')
}
