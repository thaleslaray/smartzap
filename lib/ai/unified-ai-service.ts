/**
 * Serviço de IA unificado — 100% AI Gateway.
 *
 * Usa o Vercel AI Gateway para todo roteamento de modelos, com fallbacks automáticos
 * e BYOK (Bring Your Own Key). Autenticação via VERCEL_OIDC_TOKEN (automático).
 *
 * Implementado sobre o Vercel AI SDK v6 com `gateway()` nativo.
 *
 * Exemplo:
 * - `import { ai } from '@/lib/ai'`
 * - `const result = await ai.generateText({ prompt: 'Olá' })`
 */

import { generateText as vercelGenerateText, streamText as vercelStreamText, gateway, APICallError, type ModelMessage } from 'ai';

import { getAiGatewayConfig } from './ai-center-config';

// =============================================================================
// TYPES
// =============================================================================

/** Alias para compatibilidade retroativa — internamente convertido para ModelMessage. */
export type ChatMessage = {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface GenerateTextOptions {
    /** Prompt simples (mutuamente exclusivo com `messages`). */
    prompt?: string;
    /** Mensagens da conversa (mutuamente exclusivo com `prompt`). */
    messages?: ChatMessage[];
    /** Instrução de sistema (contexto) enviada ao modelo. */
    system?: string;
    /** Sobrescreve o modelo configurado nas settings (formato "provider/model"). */
    model?: string;
    /** Máximo de tokens de saída. */
    maxOutputTokens?: number;
    /** Temperatura (geralmente entre 0 e 2). */
    temperature?: number;
}

export interface StreamTextOptions extends GenerateTextOptions {
    /** Callback chamado a cada chunk de texto recebido. */
    onChunk?: (chunk: string) => void;
    /** Callback chamado quando o streaming terminar, com o texto completo. */
    onComplete?: (text: string) => void;
}

export interface GenerateTextResult {
    text: string;
    model: string;
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * Garante que o modelId está no formato "provider/model" exigido pelo AI Gateway.
 * Falha rápido antes de chegar ao gateway, com mensagem clara de diagnóstico.
 *
 * @throws {Error} Se o formato for inválido.
 */
function assertValidGatewayModelId(modelId: string): void {
    if (!modelId || typeof modelId !== 'string') {
        throw new Error(`[AI Gateway] Model ID inválido: "${modelId}". Um model ID não-vazio é obrigatório.`);
    }
    const parts = modelId.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error(
            `[AI Gateway] Formato de modelo inválido: "${modelId}". ` +
            `Use "provider/model" — ex: "google/gemini-2.5-flash", "anthropic/claude-sonnet-4.5".`
        );
    }
}

type GatewayCallBase = {
    model: ReturnType<typeof gateway>;
    system: string | undefined;
    temperature: number;
    maxOutputTokens?: number;
    providerOptions?: Record<string, Record<string, unknown>>;
}

// Union discriminada compatível com os overloads do AI SDK
type GatewayCallArgs =
    | (GatewayCallBase & { messages: ModelMessage[] })
    | (GatewayCallBase & { prompt: string })

function buildGatewayArgs(
    options: GenerateTextOptions,
    modelId: string,
    providerOptions: Record<string, Record<string, unknown>> | undefined,
): GatewayCallArgs {
    // Sem anotação em `base`: o spread condicional de providerOptions produz um
    // tipo inferido que o TypeScript não consegue estreitar para GatewayCallBase
    // quando a anotação explícita está presente.
    const base = {
        model: gateway(modelId),
        system: options.system,
        temperature: options.temperature ?? 0.7,
        ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
        ...(providerOptions ? { providerOptions } : {}),
    };
    // ChatMessage é estruturalmente compatível com ModelMessage (role + content string)
    return (options.messages
        ? { ...base, messages: options.messages as unknown as ModelMessage[] }
        : { ...base, prompt: options.prompt || '' }) as GatewayCallArgs;
}

/**
 * Converte APICallError do Gateway em erros legíveis com contexto de ação.
 * Trata 402 (budget), 429 (rate limit) e 503 (serviço indisponível).
 */
function handleGatewayError(error: unknown, modelId: string): never {
    if (APICallError.isInstance(error)) {
        switch (error.statusCode) {
            case 402:
                throw new Error(`[AI Gateway] Budget excedido para ${modelId}. Verifique os créditos em vercel.com/dashboard.`);
            case 429:
                throw new Error(`[AI Gateway] Rate limit atingido para ${modelId}. Tente novamente em alguns segundos.`);
            case 503:
                throw new Error(`[AI Gateway] Serviço temporariamente indisponível para ${modelId}. Tente novamente em breve.`);
        }
    }
    throw error;
}

// =============================================================================
// MAIN API
// =============================================================================

/**
 * Gera texto usando o AI Gateway com o modelo configurado.
 *
 * O modelo primário e fallbacks são lidos da configuração do Gateway.
 * Autenticação via VERCEL_OIDC_TOKEN (automático com `vercel env pull`).
 *
 * @param options Opções de geração (prompt/mensagens, system, temperatura, etc.).
 * @returns Objeto com `text` e o modelo efetivamente usado.
 */
export async function generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
    const gatewayConfig = await getAiGatewayConfig();
    const modelId = options.model || gatewayConfig.primaryModel;
    assertValidGatewayModelId(modelId);
    console.log(`[AI Service] Generating with ${modelId} (via Gateway)`);

    const providerOptions = gatewayConfig.fallbackModels?.length
        ? { gateway: { models: gatewayConfig.fallbackModels } }
        : undefined;

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await vercelGenerateText(buildGatewayArgs(options, modelId, providerOptions) as any);
        return { text: result.text, model: modelId };
    } catch (error) {
        handleGatewayError(error, modelId);
    }
}

/**
 * Gera texto em streaming usando o AI Gateway.
 *
 * Durante o streaming, chama `onChunk` para cada pedaço de texto e `onComplete`
 * ao finalizar, além de retornar o texto completo.
 *
 * @param options Opções de streaming (inclui callbacks opcionais).
 * @returns Objeto com o texto completo e o modelo efetivamente usado.
 */
export async function streamText(options: StreamTextOptions): Promise<GenerateTextResult> {
    const gatewayConfig = await getAiGatewayConfig();
    const modelId = options.model || gatewayConfig.primaryModel;
    assertValidGatewayModelId(modelId);
    console.log(`[AI Service] Streaming with ${modelId} (via Gateway)`);

    const providerOptions = gatewayConfig.fallbackModels?.length
        ? { gateway: { models: gatewayConfig.fallbackModels } }
        : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = vercelStreamText(buildGatewayArgs(options, modelId, providerOptions) as any);

    let fullText = '';
    try {
        for await (const part of result.textStream) {
            fullText += part;
            options.onChunk?.(part);
        }
    } catch (error) {
        handleGatewayError(error, modelId);
    }

    options.onComplete?.(fullText);

    return { text: fullText, model: modelId };
}

/**
 * Gera uma resposta em JSON via IA.
 *
 * @typeParam T Tipo esperado do JSON retornado.
 * @param options Opções de geração.
 * @returns Objeto JSON parseado, tipado como `T`.
 */
export async function generateJSON<T = unknown>(options: GenerateTextOptions): Promise<T> {
    const result = await generateText({
        ...options,
        system: (options.system || '') + '\n\nRespond with valid JSON only, no markdown.',
    });

    try {
        const cleanText = result.text
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        try {
            return JSON.parse(cleanText) as T;
        } catch {
            const extracted = extractFirstJsonValue(cleanText);
            if (extracted) {
                return JSON.parse(extracted) as T;
            }
            throw new Error('AI response was not valid JSON');
        }
    } catch {
        console.error('[AI Service] Failed to parse JSON response:', result.text);
        throw new Error('AI response was not valid JSON');
    }
}

/**
 * Limpa o cache de settings de IA (compatibilidade retroativa).
 */
export function clearSettingsCache() {
    // No-op: cache é gerenciado pela camada de configuração do Gateway
}

// =============================================================================
// JSON EXTRACTION (fallback)
// =============================================================================

function extractFirstJsonValue(text: string): string | null {
    const start = Math.min(
        ...['{', '[']
            .map((c) => text.indexOf(c))
            .filter((i) => i >= 0)
    );

    if (!Number.isFinite(start) || start < 0) return null;

    const open = text[start];
    const close = open === '{' ? '}' : ']';

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i += 1) {
        const ch = text[i];

        if (inString) {
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === '"') { inString = false; }
            continue;
        }

        if (ch === '"') { inString = true; continue; }
        if (ch === open) depth += 1;
        if (ch === close) depth -= 1;

        if (depth === 0) {
            return text.slice(start, i + 1).trim();
        }
    }

    return null;
}

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

export const ai = {
    generateText,
    streamText,
    generateJSON,
    clearSettingsCache,
};

export default ai;

// Re-export types and providers (compatibilidade retroativa)
export { AI_PROVIDERS, getProvider, getModel, getDefaultModel } from './providers';
export type { AIProvider, AIModel, AIProviderConfig } from './providers';
