import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { clearSettingsCache } from '@/lib/ai'
import { DEFAULT_AI_FALLBACK, DEFAULT_AI_GATEWAY, DEFAULT_AI_PROMPTS, DEFAULT_AI_ROUTES } from '@/lib/ai/ai-center-defaults'
import { DEFAULT_OCR_MODEL } from '@/lib/ai/ocr/providers/gemini'
import {
  clearAiCenterCache,
  getAiFallbackConfig,
  getAiGatewayConfig,
  getAiPromptsConfig,
  getAiRoutesConfig,
  prepareAiFallbackUpdate,
  prepareAiGatewayUpdate,
  prepareAiPromptsUpdate,
  prepareAiRoutesUpdate,
} from '@/lib/ai/ai-center-config'

/**
 * Valida se uma string está no formato "provider/model" do AI Gateway.
 * Exemplos válidos: "google/gemini-2.5-flash", "anthropic/claude-sonnet-4.5"
 */
function isValidGatewayModelId(modelId: unknown): boolean {
    if (!modelId || typeof modelId !== 'string') return false;
    const parts = modelId.split('/');
    return parts.length === 2 && !!parts[0] && !!parts[1];
}

/**
 * Validation result with support for warnings (valid but with issues)
 */
interface ValidationResult {
    valid: boolean
    error?: string
    warning?: string
}

/**
 * Valida uma API key chamando o endpoint /models do provider via REST.
 * Sem SDK, sem chamadas LLM — apenas verifica autenticação.
 */
/**
 * Valida a chave do Mistral chamando o endpoint /models via REST.
 * Mistral OCR usa endpoint especializado (/v1/ocr) não disponível no AI Gateway.
 */
async function validateMistralKey(apiKey: string): Promise<ValidationResult> {
    try {
        // noinspection HttpUrlsUsage
        const res = await fetch('https://api.mistral.ai/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
        })

        if (res.ok) return { valid: true }
        if (res.status === 401) return { valid: false, error: 'Chave Mistral inválida. Verifique se a chave está correta e ativa.' }
        if (res.status === 403) return { valid: false, error: 'Acesso negado. A chave pode estar desativada.' }
        if (res.status === 429) return { valid: false, error: 'Quota excedida. Verifique seu plano Mistral.' }
        return { valid: false, error: `Erro ao validar chave: HTTP ${res.status}` }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido'
        console.error('[Mistral Key Validation] Error:', message)
        return { valid: false, error: `Erro ao validar chave: ${message}` }
    }
}

function parseJsonSetting<T>(value: string | null, fallback: T): T {
    if (!value) return fallback
    try {
        return JSON.parse(value) as T
    } catch {
        return fallback
    }
}

export async function GET() {
    try {
        // Get all AI settings from Supabase (including OCR settings)
        const { data, error } = await supabase.admin
            ?.from('settings')
            .select('key, value')
            .in('key', [
                'mistral_api_key',
                'ai_provider',
                'ai_model',
                'ai_routes',
                'ai_fallback',
                'ai_gateway',
                'ai_prompts',
                'ocr_provider',
                'ocr_gemini_model',
                // Prompts de estratégia (chaves individuais - fonte única: banco)
                'strategyMarketing',
                'strategyUtility',
                'strategyBypass',
            ]) || { data: null, error: null }

        if (error) {
            console.error('Supabase error:', error)
        }

        const settingsMap = new Map(data?.map(s => [s.key, s.value]) || [])

        // Get the current/saved provider
        const savedProvider = settingsMap.get('ai_provider') as string || 'google'
        const savedModel = settingsMap.get('ai_model') as string || ''

        const routes = prepareAiRoutesUpdate(
            parseJsonSetting(settingsMap.get('ai_routes') as string | null, DEFAULT_AI_ROUTES)
        )
        const fallback = prepareAiFallbackUpdate(
            parseJsonSetting(settingsMap.get('ai_fallback') as string | null, DEFAULT_AI_FALLBACK)
        )
        const gateway = prepareAiGatewayUpdate(
            parseJsonSetting(settingsMap.get('ai_gateway') as string | null, DEFAULT_AI_GATEWAY)
        )

        // Prompts base do JSON ai_prompts
        const basePrompts = parseJsonSetting(settingsMap.get('ai_prompts') as string | null, {})

        // Prompts de estratégia das chaves individuais (fonte única: banco, SEM fallback de código)
        const prompts = prepareAiPromptsUpdate({
            ...basePrompts,
            strategyMarketing: settingsMap.get('strategyMarketing') as string || '',
            strategyUtility: settingsMap.get('strategyUtility') as string || '',
            strategyBypass: settingsMap.get('strategyBypass') as string || '',
        })

        // OCR Settings
        const mistralKey = settingsMap.get('mistral_api_key') || process.env.MISTRAL_API_KEY || ''
        const mistralSource = settingsMap.get('mistral_api_key') ? 'database' : (mistralKey ? 'env' : 'none')
        const ocrProvider = (settingsMap.get('ocr_provider') as 'gemini' | 'mistral') || 'gemini'
        const ocrGeminiModel = settingsMap.get('ocr_gemini_model') || DEFAULT_OCR_MODEL

        const getPreview = (key: string) => key ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : null

        return NextResponse.json({
            provider: savedProvider,
            model: savedModel,
            routes,
            fallback,
            gateway,
            prompts,
            // OCR configuration
            ocr: {
                provider: ocrProvider,
                geminiModel: ocrGeminiModel,
                mistralStatus: {
                    isConfigured: !!mistralKey,
                    source: mistralSource,
                    tokenPreview: mistralKey ? getPreview(mistralKey) : null,
                },
            },
        })
    } catch (error) {
        console.error('Error fetching AI settings:', error)
        return NextResponse.json(
            { error: 'Failed to fetch AI settings' },
            { status: 500 }
        )
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const {
            provider,
            model,
            routes,
            fallback,
            gateway,
            prompts,
            // OCR fields
            ocr_provider,
            ocr_gemini_model,
            mistral_api_key,
        } = body

        // At least one field must be provided
        if (!provider && !model && !routes && !fallback && !gateway && !prompts && !ocr_provider && !ocr_gemini_model && !mistral_api_key) {
            return NextResponse.json(
                { error: 'At least one field is required' },
                { status: 400 }
            )
        }

        const updates: Array<{ key: string; value: string; updated_at: string }> = []
        const now = new Date().toISOString()

        // Save provider selection
        if (provider) {
            updates.push({ key: 'ai_provider', value: provider, updated_at: now })
        }

        // Save model selection
        if (model) {
            updates.push({ key: 'ai_model', value: model, updated_at: now })
        }

        if (routes) {
            const currentRoutes = await getAiRoutesConfig()
            const normalizedRoutes = prepareAiRoutesUpdate({ ...currentRoutes, ...routes })
            updates.push({
                key: 'ai_routes',
                value: JSON.stringify(normalizedRoutes),
                updated_at: now,
            })
        }

        if (fallback) {
            const currentFallback = await getAiFallbackConfig()
            const normalizedFallback = prepareAiFallbackUpdate({ ...currentFallback, ...fallback })
            updates.push({
                key: 'ai_fallback',
                value: JSON.stringify(normalizedFallback),
                updated_at: now,
            })
        }

        if (gateway) {
            // Valida formato "provider/model" do primaryModel antes de persistir
            if (gateway.primaryModel !== undefined && !isValidGatewayModelId(gateway.primaryModel)) {
                return NextResponse.json(
                    {
                        error: `Formato de modelo inválido: "${gateway.primaryModel}". Use "provider/model" — ex: "google/gemini-2.5-flash", "anthropic/claude-sonnet-4.5".`,
                    },
                    { status: 400 }
                )
            }

            // Valida formato de cada modelo no fallbackModels
            if (Array.isArray(gateway.fallbackModels)) {
                for (const fallbackModel of gateway.fallbackModels) {
                    if (!isValidGatewayModelId(fallbackModel)) {
                        return NextResponse.json(
                            {
                                error: `Formato inválido no fallbackModels: "${fallbackModel}". Use "provider/model" — ex: "openai/gpt-5.4".`,
                            },
                            { status: 400 }
                        )
                    }
                }
            }

            const currentGateway = await getAiGatewayConfig()
            const normalizedGateway = prepareAiGatewayUpdate({ ...currentGateway, ...gateway })
            updates.push({
                key: 'ai_gateway',
                value: JSON.stringify(normalizedGateway),
                updated_at: now,
            })
        }

        if (prompts) {
            const currentPrompts = await getAiPromptsConfig()

            // Separa prompts de estratégia (chaves individuais) dos prompts base (JSON)
            const { strategyMarketing, strategyUtility, strategyBypass, ...basePrompts } = {
                ...currentPrompts,
                ...prompts,
            }

            // Salva prompts base no JSON ai_prompts
            const normalizedBasePrompts = {
                utilityGenerationTemplate: basePrompts.utilityGenerationTemplate || '',
                utilityJudgeTemplate: basePrompts.utilityJudgeTemplate || '',
                flowFormTemplate: basePrompts.flowFormTemplate || '',
            }
            updates.push({
                key: 'ai_prompts',
                value: JSON.stringify(normalizedBasePrompts),
                updated_at: now,
            })

            // Salva prompts de estratégia em chaves individuais (fonte única: banco)
            if (prompts.strategyMarketing !== undefined) {
                updates.push({
                    key: 'strategyMarketing',
                    value: strategyMarketing || '',
                    updated_at: now,
                })
            }
            if (prompts.strategyUtility !== undefined) {
                updates.push({
                    key: 'strategyUtility',
                    value: strategyUtility || '',
                    updated_at: now,
                })
            }
            if (prompts.strategyBypass !== undefined) {
                updates.push({
                    key: 'strategyBypass',
                    value: strategyBypass || '',
                    updated_at: now,
                })
            }
        }

        // OCR: Save provider selection
        if (ocr_provider && ['gemini', 'mistral'].includes(ocr_provider)) {
            updates.push({ key: 'ocr_provider', value: ocr_provider, updated_at: now })
        }

        // OCR: Save Gemini model for OCR
        if (ocr_gemini_model) {
            updates.push({ key: 'ocr_gemini_model', value: ocr_gemini_model, updated_at: now })
        }

        // OCR: Validate and save Mistral API key
        if (mistral_api_key) {
            const validationResult = await validateMistralKey(mistral_api_key)
            if (!validationResult.valid) {
                return NextResponse.json(
                    { error: `Chave Mistral inválida: ${validationResult.error}` },
                    { status: 400 }
                )
            }
            updates.push({ key: 'mistral_api_key', value: mistral_api_key, updated_at: now })
        }

        // Upsert all updates
        if (updates.length > 0) {
            const { error } = await supabase.admin
                ?.from('settings')
                .upsert(updates) || { error: new Error('Supabase not configured') }

            if (error) {
                console.error('Supabase error:', error)
                throw new Error('Failed to save to database')
            }
        }

        clearSettingsCache()
        clearAiCenterCache()

        return NextResponse.json({
            success: true,
            message: 'AI configuration saved successfully',
            saved: updates.map(u => u.key),
        })
    } catch (error) {
        console.error('Error saving AI settings:', error)
        return NextResponse.json(
            { error: 'Failed to save AI settings' },
            { status: 500 }
        )
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const provider = searchParams.get('provider')

        // Only Mistral key removal is supported — other providers use AI Gateway OIDC
        if (provider !== 'mistral') {
            return NextResponse.json(
                { error: 'Only mistral provider key can be removed. Other providers use AI Gateway OIDC.' },
                { status: 400 }
            )
        }

        const keyName = 'mistral_api_key'

        // Delete the key from database
        const { error } = await supabase.admin
            ?.from('settings')
            .delete()
            .eq('key', keyName) || { error: new Error('Supabase not configured') }

        if (error) {
            console.error('Supabase error:', error)
            throw new Error('Failed to delete from database')
        }

        clearSettingsCache()
        clearAiCenterCache()

        return NextResponse.json({
            success: true,
            message: `${provider} API key removed successfully`,
            deleted: keyName,
        })
    } catch (error) {
        console.error('Error removing AI settings:', error)
        return NextResponse.json(
            { error: 'Failed to remove AI settings' },
            { status: 500 }
        )
    }
}
