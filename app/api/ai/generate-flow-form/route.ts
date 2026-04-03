import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const revalidate = 0

import { validateBodyOrError } from '@/lib/api-validation'
import { generateJSON } from '@/lib/ai'
import { getAiPromptsConfig, isAiRouteEnabled } from '@/lib/ai/ai-center-config'
import { buildFlowFormPrompt } from '@/lib/ai/prompts/flow-form'
import {
  generateFlowJsonFromFormSpec,
  normalizeFlowFieldName,
  normalizeFlowFormSpec,
  validateFlowFormSpec,
  type FlowFormFieldType,
  type FlowFormSpecV1,
} from '@/lib/flow-form'

const GenerateFlowFormSchema = z
  .object({
    prompt: z
      .string()
      .min(10, 'Descreva melhor o que você quer (mínimo 10 caracteres)')
      .max(4000, 'Descrição muito longa'),
    // Ajuda a IA a escolher um título coerente com o Flow atual.
    titleHint: z.string().max(140).optional(),
    maxQuestions: z.number().int().min(1).max(20).default(10),
  })
  .strict()

const AIFieldSchema = z.object({
  type: z.enum([
    'short_text',
    'long_text',
    'email',
    'phone',
    'number',
    'date',
    'dropdown',
    'single_choice',
    'multi_choice',
    'optin',
  ] as const),
  label: z.string().min(1).max(120),
  required: z.boolean().optional().default(false),
  placeholder: z.string().max(120).optional().nullable(),
  // Para opt-in
  text: z.string().max(200).optional().nullable(),
  // Para dropdown / choices
  options: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
      })
    )
    .optional()
    .nullable(),
})

const AIFlowFormOutputSchema = z
  .object({
    title: z.string().min(1).max(140),
    intro: z.string().max(400).optional().nullable(),
    submitLabel: z.string().min(1).max(40).optional().nullable(),
    fields: z.array(AIFieldSchema).min(1).max(20),
  })
  .strict()

function uniqueName(base: string, used: Set<string>) {
  const normalizedBase = normalizeFlowFieldName(base) || 'campo'
  let out = normalizedBase
  let i = 2
  while (used.has(out)) {
    out = `${normalizedBase}_${i}`
    i += 1
  }
  used.add(out)
  return out
}

function buildPrompt(
  userPrompt: string,
  titleHint: string | null,
  maxQuestions: number,
  template: string
) {
  return buildFlowFormPrompt({
    prompt: userPrompt,
    maxQuestions,
    titleHint,
    template,
  })
}

export async function POST(request: NextRequest) {
  try {
    const routeEnabled = await isAiRouteEnabled('generateFlowForm')
    if (!routeEnabled) {
      return NextResponse.json(
        { error: 'Rota desativada nas configurações de IA.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validation = validateBodyOrError(GenerateFlowFormSchema, body)
    if (!validation.success) return validation.response

    const { prompt: userPrompt, titleHint, maxQuestions } = validation.data

    const promptsConfig = await getAiPromptsConfig()
    const aiRaw = await generateJSON<unknown>({
      system:
        'Você é um gerador de JSON estrito. Responda SOMENTE com um JSON válido que respeite o contrato solicitado. Não inclua explicações.',
      prompt: buildPrompt(userPrompt, titleHint || null, maxQuestions, promptsConfig.flowFormTemplate),
      temperature: 0.2,
      maxOutputTokens: 1400,
    })

    const parsed = AIFlowFormOutputSchema.safeParse(aiRaw)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'A IA retornou um formato inesperado',
          details: parsed.error.issues.map((i) => i.message).join('; '),
        },
        { status: 422 }
      )
    }

    const usedNames = new Set<string>()

    const fields: FlowFormSpecV1['fields'] = parsed.data.fields.slice(0, maxQuestions).map((f, idx) => {
      const label = String(f.label || `Pergunta ${idx + 1}`).trim() || `Pergunta ${idx + 1}`
      const type = f.type as FlowFormFieldType

      const name = uniqueName(label, usedNames)

      const base: any = {
        id: `q_${idx + 1}_${Math.random().toString(36).slice(2, 8)}`,
        name,
        label,
        type,
        required: !!f.required,
      }

      if (f.placeholder && String(f.placeholder).trim()) {
        base.placeholder = String(f.placeholder).trim()
      }

      if (type === 'optin') {
        base.required = false
        base.text = (f.text && String(f.text).trim()) || 'Quero receber mensagens sobre novidades e promoções.'
      }

      if (type === 'dropdown' || type === 'single_choice' || type === 'multi_choice') {
        const rawOptions = Array.isArray(f.options) ? f.options : []
        base.required = !!f.required
        base.options = rawOptions.slice(0, 15).map((o: any, oidx: number) => {
          const title = String(o?.title || `Opção ${oidx + 1}`).trim() || `Opção ${oidx + 1}`
          return {
            id: normalizeFlowFieldName(title) || `opcao_${oidx + 1}`,
            title,
          }
        })
      }

      return base
    })

    const form = normalizeFlowFormSpec(
      {
        version: 1,
        screenId: 'FORM',
        title: parsed.data.title,
        intro: parsed.data.intro || undefined,
        submitLabel: parsed.data.submitLabel || 'Enviar',
        fields,
      },
      titleHint || undefined
    )

    const issues = validateFlowFormSpec(form)
    const flowJson = generateFlowJsonFromFormSpec(form)

    return NextResponse.json({ form, flowJson, issues })
  } catch (error) {
    console.error('[AI] generate-flow-form error:', error)
    const message = error instanceof Error ? error.message : 'Falha ao gerar flow com IA'
    if (message === 'AI response was not valid JSON') {
      return NextResponse.json(
        {
          error: 'A IA não retornou JSON válido (formato fora do contrato). Tente novamente.',
          details:
            'Dica: escreva um prompt mais objetivo, evite múltiplos pedidos ao mesmo tempo e tente novamente. Se persistir, troque o provedor/modelo nas Configurações de IA.',
        },
        { status: 502 }
      )
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
