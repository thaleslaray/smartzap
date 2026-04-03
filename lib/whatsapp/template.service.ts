import { CreateTemplateSchema } from './validators/template.schema'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { templateProjectDb } from '@/lib/supabase-db'
import { CreateTemplateInput, TemplateCreationResult } from './types'
import { MetaButton, MetaHeaderComponent, MetaHeaderFormat, MetaBodyComponent, MetaFooterComponent, MetaCarouselComponent, MetaCarouselCard, MetaComponent, MetaTemplatePayload } from './types'
import { MetaAPIError } from './errors'
import { GeneratedTemplate } from '@/lib/ai/services/template-agent'

export class TemplateService {
    /**
     * Creates a WhatsApp Template (orchestrates Validation, Transformation, Sending, and DB Update)
     */
    async create(data: CreateTemplateInput): Promise<TemplateCreationResult> {
        // 1. Authenticate / Get Credentials
        const credentials = await getWhatsAppCredentials()
        if (!credentials) {
            throw new Error('WhatsApp credentials not found')
        }

        // 2. Build the Strict Meta Payload
        const metaPayload = this.buildMetaPayload(data)

        // 3. Send to Meta API
        // URL da API (Versão atualizada v24.0)
        const url = `https://graph.facebook.com/v24.0/${credentials.businessAccountId}/message_templates`

        try {
            const response = await fetch(
                url,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${credentials.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(metaPayload),
                }
            )

            const result = await response.json()

            if (!response.ok) {
                console.error('[TemplateService] ====== META API ERROR ======')
                console.error('[TemplateService] Template name:', data.name)
                console.error('[TemplateService] Status:', response.status)
                console.error('[TemplateService] Full error:', JSON.stringify(result, null, 2))
                console.error('[TemplateService] Payload sent:', JSON.stringify(metaPayload, null, 2))
                console.error('[TemplateService] ============================')
                // Throw typed Error
                throw new MetaAPIError(result.error)
            }

            // 4. Update Database (if projectId/itemId provided)
            // This makes the service "State Aware" which is useful for our SaaS
            if (data.itemId) {
                try {
                    await templateProjectDb.updateItem(data.itemId, {
                        meta_id: result.id,
                        meta_status: result.status || 'PENDING'
                    })
                } catch (dbErr) {
                    console.error(`[TemplateService] Failed to update DB for item ${data.itemId}`, dbErr)
                    // We do NOT throw here, as the template was successfully created on Meta
                }
            }

            return {
                success: true,
                name: metaPayload.name,
                id: result.id,
                status: result.status || 'PENDING',
                category: metaPayload.category
            }

        } catch (error: unknown) {
            // If it's already our typed error, rethrow
            if (error instanceof MetaAPIError) {
                throw error
            }
            // If network error or other generic error
            console.error('[TemplateService] Network/Unknown Error:', error)
            throw new Error(error instanceof Error ? error.message : 'Falha na comunicação com a Meta')
        }
    }

    /**
     * Calls the AI API to generate utility templates
     */
    async generateUtilityTemplates(params: {
        prompt: string;
        quantity: number;
        language: 'pt_BR' | 'en_US' | 'es_ES';
        strategy: 'marketing' | 'utility' | 'bypass';
    }): Promise<{ templates: GeneratedTemplate[] }> {
        console.log('[TemplateService] generateUtilityTemplates called with params:', JSON.stringify(params, null, 2));

        const response = await fetch('/api/ai/generate-utility-templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        })

        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || 'Falha ao gerar templates')
        }

        return await response.json()
    }

    // Criar template diretamente na Meta via API
    async createInMeta(template: { name: string; content: string; language?: string; category?: string }): Promise<{ success: boolean; message: string }> {
        const response = await fetch('/api/templates/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: template.name,
                content: template.content,
                language: template.language || 'pt_BR',
                category: template.category || 'UTILITY'
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Falha ao criar template na Meta');
        }

        return await response.json();
    }

    /**
     * Transforms the User Input (friendly) into Meta Payload (strict)
     */
    private buildMetaPayload(data: CreateTemplateInput): MetaTemplatePayload {
        const parsed = CreateTemplateSchema.safeParse(data)
        if (!parsed.success) {
            const message = parsed.error.issues
                .map((i) => `${i.path.join('.') || 'template'}: ${i.message}`)
                .join('\n')
            throw new Error(message || 'Template inválido')
        }

        const input = parsed.data as unknown as CreateTemplateInput

        const components: MetaComponent[] = []
        const parameterFormat = input.parameter_format === 'named' ? 'named' : 'positional'
        const metaParameterFormat = parameterFormat === 'named' ? 'NAMED' : 'POSITIONAL'
        const isNamed = parameterFormat === 'named'

        // A. Header
        if (input.header) {
            const headerComponent: MetaHeaderComponent = {
                type: 'HEADER',
                format: input.header.format as MetaHeaderFormat
            }

            if (input.header.format === 'TEXT') {
                const rawHeaderText = String(input.header.text || '').trim()
                if (!rawHeaderText) {
                    throw new Error('Cabeçalho de texto exige um valor.')
                }

                // Sanitiza header removendo emojis, asteriscos, newlines, formatação
                const headerText = this.sanitizeHeaderText(rawHeaderText)

                if (headerText !== rawHeaderText) {
                    console.log(`[TemplateService] Header sanitizado: "${rawHeaderText}" → "${headerText}"`)
                }

                headerComponent.text = isNamed ? headerText : this.renumberVariables(headerText)

                if (isNamed) {
                    const names = this.extractNamedVariables(headerComponent.text)
                    if (names.length > 0) {
                        const provided = input.header.example?.header_text_named_params
                        headerComponent.example = {
                            header_text_named_params: this.buildNamedParamsExamples(names, provided, undefined, 'Exemplo')
                        }
                    }
                } else {
                    const varCount = this.extractVariables(headerComponent.text)
                    if (varCount > 0) {
                        // Use provided example vars or generate generic ones
                        const examples = input.header.example?.header_text || Array(varCount).fill('Exemplo')
                        headerComponent.example = { header_text: examples }
                    }
                }
            } else if (['IMAGE', 'VIDEO', 'GIF', 'DOCUMENT'].includes(input.header.format)) {
                // Media headers require an example handle
                if (input.header.example?.header_handle && input.header.example.header_handle.length > 0) {
                    headerComponent.example = { header_handle: input.header.example.header_handle }
                }
            } else if (input.header.format === 'LOCATION') {
                // LOCATION headers na criação do template NÃO incluem dados de localização.
                // Os dados (latitude, longitude, etc.) são passados apenas no momento do ENVIO da mensagem.
                // A Meta exige apenas { type: "HEADER", format: "LOCATION" } na criação.
                // Os dados de localização são salvos localmente na coluna header_location
                // e usados no buildMetaTemplatePayload (template-contract.ts) ao enviar.
            }
            components.push(headerComponent)
        }

        // B. Limited Time Offer
        if (input.limited_time_offer) {
            components.push({
                type: 'LIMITED_TIME_OFFER',
                limited_time_offer: input.limited_time_offer
            })
        }

        // C. Body (or Content)
        let bodyText = input.body?.text || input.content || ''
        if (bodyText) {
            bodyText = isNamed ? bodyText : this.renumberVariables(bodyText)
            const bodyComponent: MetaBodyComponent = {
                type: 'BODY',
                text: bodyText
            }

            if (typeof input.add_security_recommendation === 'boolean') {
                bodyComponent.add_security_recommendation = input.add_security_recommendation
            }

            if (isNamed) {
                const names = this.extractNamedVariables(bodyText)
                if (names.length > 0) {
                    const provided = input.body?.example?.body_text_named_params
                    bodyComponent.example = {
                        body_text_named_params: this.buildNamedParamsExamples(
                            names,
                            provided,
                            input.exampleVariables,
                            'Valor'
                        )
                    }
                }
            } else {
                const varCount = this.extractVariables(bodyText)
                if (varCount > 0) {
                    let exampleValues: string[] = []
                    if (input.exampleVariables && input.exampleVariables.length > 0) {
                        // Ensure we provide exactly as many examples as variables
                        exampleValues = input.exampleVariables.slice(0, varCount)
                        // If we still don't have enough, pad with placeholders
                        while (exampleValues.length < varCount) {
                            exampleValues.push(`Valor${exampleValues.length + 1}`)
                        }
                    } else {
                        exampleValues = Array.from({ length: varCount }, (_, i) => `Valor${i + 1}`)
                    }

                    const finalBodyExamples = input.body?.example?.body_text || [exampleValues]
                    bodyComponent.example = { body_text: finalBodyExamples }
                }
            }
            components.push(bodyComponent)
        }

        const hasCarousel = !!(input.carousel && input.carousel.cards && input.carousel.cards.length > 0)
        if (!bodyText && !hasCarousel) {
            throw new Error('Template precisa de BODY (content/body.text) ou CAROUSEL (cards).')
        }

        if (bodyText && hasCarousel) {
            throw new Error('Use apenas BODY ou CAROUSEL (não ambos) para o mesmo template.')
        }

        // D. Footer
        if (input.footer && input.footer.text) {
            const footerComponent: MetaFooterComponent = {
                type: 'FOOTER',
                text: input.footer.text,
                ...(typeof input.code_expiration_minutes === 'number'
                    ? { code_expiration_minutes: input.code_expiration_minutes }
                    : {}),
            }

            components.push(footerComponent)
        }

        // E. Buttons
        if (input.buttons && input.buttons.length > 0) {
            const validButtons: MetaButton[] = []

            // Defensive: validate counts by type (schema already does, but keep service safe)
            const counts: Record<string, number> = {}
            for (const b of input.buttons) counts[b.type] = (counts[b.type] || 0) + 1
            if ((counts.URL || 0) > 2) throw new Error('Máximo de 2 botões do tipo URL.')
            if ((counts.PHONE_NUMBER || 0) > 1) throw new Error('Máximo de 1 botão do tipo PHONE_NUMBER.')
            if ((counts.COPY_CODE || 0) > 1) throw new Error('Máximo de 1 botão do tipo COPY_CODE.')

            // Quick replies must be contiguous
            let sawQuick = false
            let sawNonQuickAfterQuick = false
            for (const b of input.buttons) {
                if (b.type === 'QUICK_REPLY') {
                    sawQuick = true
                    if (sawNonQuickAfterQuick) {
                        throw new Error('Botões QUICK_REPLY devem ficar agrupados (contíguos), sem intercalar com outros tipos.')
                    }
                } else {
                    if (sawQuick) sawNonQuickAfterQuick = true
                }
            }

            for (const btn of input.buttons) {
                validButtons.push(this.buildMetaButton(btn, parameterFormat))
            }

            if (validButtons.length > 0) {
                components.push({
                    type: 'BUTTONS',
                    buttons: validButtons
                })
            }
        }

        // F. Carousel
        if (hasCarousel) {
            const carouselComponent: MetaCarouselComponent = {
                type: 'CAROUSEL',
                cards: this.buildCarouselCards(input.carousel!.cards, parameterFormat)
            }
            components.push(carouselComponent)
        }

        const payload: MetaTemplatePayload = {
            name: input.name,
            language: input.language,
            category: input.category,
            // Meta expects this field when using named placeholders; harmless for positional when omitted, but we send for explicitness.
            parameter_format: metaParameterFormat,
            components: components,
            ...(typeof input.message_send_ttl_seconds === 'number'
                ? { message_send_ttl_seconds: input.message_send_ttl_seconds }
                : {}),
        }

        return payload
    }

    private buildMetaButton(btn: Record<string, unknown>, parameterFormat: 'positional' | 'named'): MetaButton {
        const text = btn.text as string | undefined
        const url = btn.url as string | undefined
        const example = btn.example as string | string[] | undefined

        if (btn.type === 'URL') {
            const normalizedUrl = this.normalizeUrl(url || '')
            // Check for invalid Naked Variables
            const nakedVarMatch = normalizedUrl.match(/^\{\{\d+\}\}$/)
            if (nakedVarMatch) {
                throw new Error(`URL inválida no botão "${text}". Domínio obrigatório (ex: https://site.com/{{1}}).`)
            }

            if (parameterFormat === 'named' && normalizedUrl.includes('{{')) {
                throw new Error('parameter_format=named não suporta URL dinâmica em botões. Use positional ou URL fixa.')
            }

            const metaBtn: MetaButton = {
                type: 'URL',
                text,
                url: normalizedUrl
            }

            if (normalizedUrl.includes('{{1}}')) {
                const exampleArr = Array.isArray(example)
                    ? example
                    : (typeof example === 'string' && example.trim() ? [example.trim()] : null)

                metaBtn.example = exampleArr || ['exemplo']
            }

            return metaBtn
        }

        if (btn.type === 'PHONE_NUMBER') {
            return {
                type: 'PHONE_NUMBER',
                text,
                phone_number: btn.phone_number as string
            }
        }

        if (btn.type === 'QUICK_REPLY') {
            return {
                type: 'QUICK_REPLY',
                text
            }
        }

        if (btn.type === 'COPY_CODE') {
            const exampleValue = example
                ? (Array.isArray(example) ? example : [example as string])
                : ['CODE123']
            return {
                type: 'COPY_CODE',
                example: exampleValue
            }
        }

        if (btn.type === 'OTP') {
            const otpType = String(btn.otp_type || '')
            if (!otpType) throw new Error('Botão OTP requer otp_type.')
            if (otpType === 'ONE_TAP') {
                if (!btn.package_name || !btn.signature_hash) {
                    throw new Error('Botão OTP ONE_TAP requer package_name e signature_hash.')
                }
            }
            return {
                type: 'OTP',
                otp_type: otpType,
                ...(text ? { text } : {}),
                ...(btn.autofill_text ? { autofill_text: btn.autofill_text as string } : {}),
                ...(btn.package_name ? { package_name: btn.package_name as string } : {}),
                ...(btn.signature_hash ? { signature_hash: btn.signature_hash as string } : {}),
            }
        }

        if (btn.type === 'FLOW') {
            if (!btn.flow_id) throw new Error('Botão FLOW requer flow_id.')
            return {
                type: 'FLOW',
                text,
                flow_id: btn.flow_id as string,
                ...(btn.flow_action ? { flow_action: btn.flow_action as string } : {}),
                ...(btn.navigate_screen ? { navigate_screen: btn.navigate_screen as string } : {}),
            }
        }

        // Qualquer outro tipo não é suportado pela Meta API para templates
        throw new Error(`Tipo de botão "${String(btn.type)}" não é suportado pela Meta para templates. Use: Resposta Rápida, URL, Ligar, Copiar Código, OTP ou MiniApp (Flow).`)
    }

    private buildCarouselCards(cards: unknown[], parameterFormat: 'positional' | 'named'): MetaCarouselCard[] {
        return (cards || []).map((rawCard: unknown) => {
            const card = rawCard as Record<string, unknown> | null
            // Já está no formato Meta (cards[].components)
            if (card && Array.isArray(card.components)) return card as unknown as MetaCarouselCard

            // Formato "amigável" (schema): { header, body, buttons }
            const components: MetaComponent[] = []

            const header = card?.header as Record<string, unknown> | undefined
            if (header) {
                components.push({
                    type: 'HEADER',
                    format: header.format as MetaHeaderFormat,
                    example: header.example as MetaHeaderComponent['example'],
                })
            }

            const body = card?.body as Record<string, unknown> | undefined
            if (body?.text) {
                const text = parameterFormat === 'named' ? body.text as string : this.renumberVariables(body.text as string)
                const bodyComponent: MetaBodyComponent = {
                    type: 'BODY',
                    text,
                }
                const bodyExample = body.example as Record<string, unknown> | undefined
                if (bodyExample?.body_text) bodyComponent.example = { body_text: bodyExample.body_text as string[][] }
                components.push(bodyComponent)
            }

            const buttons = card?.buttons as Record<string, unknown>[] | undefined
            if (Array.isArray(buttons) && buttons.length) {
                components.push({
                    type: 'BUTTONS',
                    buttons: buttons.map((b: Record<string, unknown>) => this.buildMetaButton(b, parameterFormat)).slice(0, 2)
                })
            }

            return { components } as MetaCarouselCard
        })
    }

    private normalizeUrl(url: string): string {
        if (!url) return ''
        let processed = url.trim()
        if (!processed.startsWith('http://') && !processed.startsWith('https://')) {
            processed = 'https://' + processed
        }
        processed = processed.replace(/\{\{\d+\}\}/g, '{{1}}')
        return processed
    }

    private extractVariables(text: string): number {
        // Conta placeholders posicionais {{1}} e também placeholders nomeados {{first_name}}
        const positional = text.match(/\{\{(\d+)\}\}/g) || []
        const named = text.match(/\{\{([a-z0-9_]+)\}\}/g) || []
        const all = [...positional, ...named]
        if (all.length === 0) return 0

        const unique = new Set(all.map(m => m.replace(/\{\{|\}\}/g, '')))
        return unique.size
    }

    private extractNamedVariables(text: string): string[] {
        const matches = text.match(/\{\{([^}]+)\}\}/g) || []
        const seen = new Set<string>()
        const names: string[] = []
        for (const match of matches) {
            const token = match.replace(/\{\{|\}\}/g, '').trim()
            if (!/^[a-z][a-z0-9_]*$/.test(token)) continue
            if (!seen.has(token)) {
                seen.add(token)
                names.push(token)
            }
        }
        return names
    }

    private buildNamedParamsExamples(
        names: string[],
        provided?: Array<{ param_name: string; example: string }>,
        fallbackValues?: Array<string | undefined>,
        fallbackPrefix = 'Valor'
    ): Array<{ param_name: string; example: string }> {
        const providedMap = new Map<string, string>()
        for (const item of provided || []) {
            if (!item?.param_name) continue
            providedMap.set(String(item.param_name), String(item.example || '').trim())
        }

        return names.map((name, idx) => {
            const providedExample = providedMap.get(name)
            const fallback = fallbackValues?.[idx]
            const example = providedExample || String(fallback || '').trim() || `${fallbackPrefix}${idx + 1}`
            return { param_name: name, example }
        })
    }

    /**
     * Sanitiza texto de header removendo caracteres proibidos pela Meta:
     * - Emojis
     * - Asteriscos (*)
     * - Newlines (\n)
     * - Caracteres de formatação (_, ~, `)
     */
    private sanitizeHeaderText(text: string): string {
        return text
            // Remove emojis (ranges Unicode)
            .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')  // Misc Symbols, Emoticons, etc
            .replace(/[\u{2600}-\u{26FF}]/gu, '')    // Misc Symbols
            .replace(/[\u{2700}-\u{27BF}]/gu, '')    // Dingbats
            .replace(/[\u{FE00}-\u{FE0F}]/gu, '')    // Variation Selectors
            .replace(/[\u{1F000}-\u{1F02F}]/gu, '')  // Mahjong, Domino
            .replace(/[\u{1F0A0}-\u{1F0FF}]/gu, '')  // Playing Cards
            // Remove asteriscos
            .replace(/\*/g, '')
            // Remove newlines (substitui por espaço)
            .replace(/[\n\r]/g, ' ')
            // Remove caracteres de formatação WhatsApp
            .replace(/[_~`]/g, '')
            // Limpa espaços múltiplos
            .replace(/\s+/g, ' ')
            .trim()
    }

    private renumberVariables(text: string): string {
        const allMatches = text.match(/\{\{([^}]+)\}\}/g) || []
        if (allMatches.length === 0) return text

        const seen = new Set<string>()
        const uniqueVars: string[] = []
        for (const match of allMatches) {
            const varName = match.replace(/\{\{|\}\}/g, '')
            if (!seen.has(varName)) {
                seen.add(varName)
                uniqueVars.push(varName)
            }
        }

        const mapping: Record<string, number> = {}
        uniqueVars.forEach((varName, idx) => {
            mapping[varName] = idx + 1
        })

        let result = text
        const sortedVars = Object.keys(mapping).sort((a, b) => b.length - a.length)
        for (const oldVar of sortedVars) {
            const newNum = mapping[oldVar]
            result = result.replaceAll(`{{${oldVar}}}`, `{{${newNum}}}`)
        }
        return result
    }
}

export const templateService = new TemplateService()
