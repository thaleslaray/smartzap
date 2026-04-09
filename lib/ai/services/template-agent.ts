import { generateText } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { DEFAULT_MODEL_ID } from '../model'
import { getAiDirectConfig } from '../ai-center-config'

// ============================================================================
// TEMPLATE CATEGORIES
// ============================================================================

export const TEMPLATE_CATEGORIES = {
    conta: {
        name: 'Atualizações da Conta',
        keywords: ['conta', 'perfil', 'cadastro', 'endereço', 'configuração'],
        examples: [
            { name: 'account_creation_confirmation_3', body: 'Oi, {{1}}, Sua nova conta foi criada com sucesso. Verifique {{2}} para concluir seu perfil.', button: 'Verificar a conta' },
            { name: 'address_update', body: 'Olá, {{1}}, seu endereço de entrega foi atualizado com sucesso para {{2}}. Contacte {{3}} para quaisquer dúvidas.', button: null }
        ]
    },
    agendamentos: {
        name: 'Agendamentos e Compromissos',
        keywords: ['agendamento', 'compromisso', 'consulta', 'visita', 'técnico', 'horário', 'reagendar'],
        examples: [
            { name: 'appointment_confirmation_1', body: 'Olá, {{1}}. Obrigado por reservar com {{2}}. Sua consulta para {{3}} em {{4}} às {{5}} está confirmada.', button: 'Ver detalhes' },
            { name: 'appointment_reminder_2', body: 'Olá, {{1}}. Este é um lembrete sobre o seu próximo compromisso com a {{2}} em {{3}} às {{4}}. Estamos ansiosos por te ver!', button: 'Ver detalhes' },
            { name: 'appointment_reschedule_1', body: 'Olá, {{1}}. Seu próximo compromisso com {{2}} foi reagendado para {{3}} às {{4}}. Estamos ansiosos por te ver!', button: 'Ver detalhes' }
        ]
    },
    pagamentos: {
        name: 'Pagamentos e Cobranças',
        keywords: ['pagamento', 'cobrança', 'cartão', 'saldo', 'fatura', 'boleto', 'débito', 'crédito'],
        examples: [
            { name: 'auto_pay_reminder_1', body: 'Oi, {{1}}, Seu pagamento automático para a {{2}} está programado para o dia {{3}} no valor de {{4}}. Confira se o seu saldo é suficiente.', button: 'Ver conta' },
            { name: 'low_balance_warning_1', body: 'O saldo na sua conta {{1}} com final {{2}} está abaixo do limite de {{3}}. Clique abaixo para adicionar fundos.', button: 'Fazer um depósito' }
        ]
    },
    entregas: {
        name: 'Entregas e Pedidos',
        keywords: ['entrega', 'pedido', 'encomenda', 'rastreio', 'envio', 'pacote', 'chegou'],
        examples: [
            { name: 'delivery_confirmation_1', body: 'Olá, {{1}}, seu pedido {{2}} foi entregue com sucesso. Podes gerir a tua encomenda abaixo.', button: 'Gerir encomenda' },
            { name: 'delivery_update_1', body: 'Olá, {{1}}, seu pedido {{2}} está a caminho e deve chegar em breve. Entrega estimada: {{3}}', button: 'Rastrear pedido' }
        ]
    },
    cancelamentos: {
        name: 'Cancelamentos e Reembolsos',
        keywords: ['cancelamento', 'cancelar', 'reembolso', 'estorno', 'devolução'],
        examples: [
            { name: 'order_cancelled_1', body: '{{1}}, seu pedido {{2}} foi cancelado com sucesso. O reembolso será processado em {{3}} dias úteis. Atenciosamente,', button: 'Ver detalhes do pedido' }
        ]
    },
    feedback: {
        name: 'Feedback e Pesquisa',
        keywords: ['feedback', 'pesquisa', 'avaliação', 'opinião', 'satisfação', 'experiência'],
        examples: [
            { name: 'feedback_survey_2', body: 'Agradecemos por nos visitar em {{1}} no dia {{2}}. Seu feedback é importante para nós. Responda a esta pesquisa breve.', button: 'Preencher pesquisa' }
        ]
    },
    eventos: {
        name: 'Eventos',
        keywords: ['evento', 'presença', 'convite', 'participação', 'inscrição', 'vagas', 'turma', 'curso'],
        examples: [
            { name: 'event_details_reminder_1', body: 'Você tem um evento futuro. Lembrete: você confirmou presença para o evento {{1}}. O evento começa em {{2}} às {{3}}.', button: null },
            { name: 'event_rsvp_confirmation_2', body: 'Sua presença no evento {{1}} de {{2}} está confirmada. Obrigado.', button: null }
        ]
    },
    suporte: {
        name: 'Instalação e Suporte Técnico',
        keywords: ['instalação', 'suporte', 'técnico', 'problema', 'ajuda', 'configuração'],
        examples: [
            { name: 'installation_complete', body: 'Olá, {{1}}, a sua instalação está concluída! O nosso técnico configurou tudo. Se tiver algum problema, contacte {{2}} para obter ajuda.', button: null }
        ]
    },
    grupos: {
        name: 'Grupos e Comunidade',
        keywords: ['grupo', 'comunidade', 'whatsapp', 'link', 'convite'],
        examples: [
            { name: 'group_invite', body: 'Olá, {{1}}, o teu pedido para {{2}} da {{3}} foi recebido com sucesso! Você pode começar clicando e juntando-se ao grupo. Obrigado!', button: null }
        ]
    }
} as const

export type TemplateCategory = keyof typeof TEMPLATE_CATEGORIES

// ============================================================================
// INTERFACES
// ============================================================================

export interface GeneratedTemplate {
    id: string
    name: string
    content: string
    header?: { format: 'TEXT'; text: string }
    footer?: { text: string }
    buttons?: Array<{ type: 'URL'; text: string; url: string }>
    category?: string
    language?: string
    judgment?: {
        approved: boolean
        issues: Array<{ type: string; reason: string }>
    }
    wasFixed?: boolean
    // Variáveis genéricas (usado em MARKETING/UTILITY)
    variables?: Record<string, string>
    // Variáveis comportadas para enviar à Meta na criação (usado em BYPASS)
    sample_variables?: Record<string, string>
    // Variáveis agressivas de marketing para envio real (usado em BYPASS)
    marketing_variables?: Record<string, string>
}

export interface AgentGenerationResult {
    templates: GeneratedTemplate[]
    metadata: {
        detectedCategory: string
        usedExamples: number
        processingTimeMs: number
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function detectCategory(prompt: string): { category: TemplateCategory; confidence: number } {
    const promptLower = prompt.toLowerCase()
    let bestMatch: TemplateCategory = 'conta' // Default
    let maxScore = 0

    for (const [key, category] of Object.entries(TEMPLATE_CATEGORIES)) {
        let score = 0
        for (const keyword of category.keywords) {
            if (promptLower.includes(keyword)) {
                score += 1
            }
        }
        if (score > maxScore) {
            maxScore = score
            bestMatch = key as TemplateCategory
        }
    }

    return { category: bestMatch, confidence: maxScore > 0 ? 0.8 : 0.3 }
}

function getValidationRules() {
    return {
        prohibitedWords: [
            'desconto', 'oferta', 'promoção', 'grátis', 'compre agora',
            'clique aqui', 'garanta já', 'última chance', 'imperdível',
            'melhor preço', 'black friday', '% off', 'cupom', 'bônus'
        ],
        approvedOpenings: [
            'Olá, {{1}}', 'Prezado(a) {{1}}', 'Oi {{1}}',
            'Informamos que', 'Este é um lembrete', 'Sua conta'
        ],
        approvedButtons: [
            'Ver detalhes', 'Confirmar presença', 'Rastrear pedido',
            'Minha conta', 'Falar com suporte', 'Acessar boletos'
        ]
    }
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

import { PromptFactory, AIStrategy } from '../prompts/factory'

export interface AgentOptions {
    /** @deprecated Não mais necessário — Gateway usa env vars do Vercel automaticamente */
    apiKey?: string
    model?: string
    strategy?: AIStrategy // DEFAULT: 'bypass'
}

export async function generateTemplatesWithAgent(
    userPrompt: string,
    quantity: number,
    options: AgentOptions
): Promise<AgentGenerationResult> {
    const startTime = Date.now()
    const config = await getAiDirectConfig()
    const targetModelId = options.model || config.model || DEFAULT_MODEL_ID
    if (!config.googleApiKey) throw new Error('Chave Google não configurada. Acesse Configurações → IA.')
    const google = createGoogleGenerativeAI({ apiKey: config.googleApiKey })
    const model = google(targetModelId)

    console.log(`[TEMPLATE_AGENT] Using model: ${targetModelId} (provider: ${config.provider})`)

    // Default to 'bypass' if not provided
    const strategy = options.strategy || 'bypass'

    console.log('[TEMPLATE_AGENT] Starting generation...')
    console.log(`[TEMPLATE_AGENT] Strategy: ${strategy}`)
    console.log(`[TEMPLATE_AGENT] Prompt: "${userPrompt.substring(0, 100)}..."`)

    // Step 1: Detect the best category
    const categoryResult = detectCategory(userPrompt)
    const detectedCategory = categoryResult.category

    // Hint category based on Strategy
    const categoryHint = PromptFactory.getCategoryHint(strategy)

    console.log(`[TEMPLATE_AGENT] Detected category: ${detectedCategory} (confidence: ${categoryResult.confidence})`)

    // Step 2: Get examples from that category
    const examples = TEMPLATE_CATEGORIES[detectedCategory].examples
    console.log(`[TEMPLATE_AGENT] Loaded ${examples.length} example templates`)

    // Step 3: Get validation rules
    const rules = getValidationRules()

    // Step 4: Build prompt with examples
    const examplesText = examples.map((ex, i) =>
        `Exemplo ${i + 1}:\n  Nome: ${ex.name}\n  Body: "${ex.body}"\n  Botão: ${ex.button || 'nenhum'}`
    ).join('\n\n')

    // DYNAMIC SYSTEM PROMPT
    const systemPrompt = PromptFactory.getSystemPrompt(strategy)

    const generationPrompt = `${systemPrompt}

## CATEGORIA DETECTADA: ${TEMPLATE_CATEGORIES[detectedCategory].name} (Meta: ${categoryHint})

## EXEMPLOS OFICIAIS DA META (SIGA ESTE PADRÃO):
${examplesText}

## PALAVRAS PROIBIDAS (Se aplicar à estratégia):
${rules.prohibitedWords.join(', ')}

## FRASES APROVADAS PARA ABRIR:
${rules.approvedOpenings.join(', ')}

## BOTÕES APROVADOS:
${rules.approvedButtons.join(', ')}

## PEDIDO DO USUÁRIO:
"${userPrompt}"

## GERE ${quantity} TEMPLATES
Siga EXATAMENTE o padrão dos exemplos oficiais.
Use muitas variáveis para flexibilidade.
Retorne APENAS JSON válido: [{ "name": "...", "content": "...", "header": {...}, "footer": {...}, "buttons": [...] }]`

    const { text } = await generateText({
        model,
        prompt: generationPrompt
    })

    console.log('[TEMPLATE_AGENT] Generation complete, parsing response...')

    // Parse the response
    let templates: GeneratedTemplate[] = []
    try {
        const jsonMatch = text.match(/\[[\s\S]*\]/)?.[0]
        if (jsonMatch) {
            templates = JSON.parse(jsonMatch)
        }
    } catch (parseError) {
        console.error('[TEMPLATE_AGENT] Failed to parse response:', parseError)
    }

    // ENFORCE CATEGORY BASED ON STRATEGY (Deterministic)
    // Strategy 'marketing' -> MARKETING
    // Strategy 'utility' | 'bypass' -> UTILITY
    const targetCategory = strategy === 'marketing' ? 'MARKETING' : 'UTILITY';

    templates = templates.map(t => ({
        ...t,
        category: targetCategory
    }));

    const processingTimeMs = Date.now() - startTime
    console.log(`[TEMPLATE_AGENT] Generated ${templates.length} templates in ${processingTimeMs}ms`)

    return {
        templates,
        metadata: {
            detectedCategory: TEMPLATE_CATEGORIES[detectedCategory].name,
            usedExamples: examples.length,
            processingTimeMs
        }
    }
}
