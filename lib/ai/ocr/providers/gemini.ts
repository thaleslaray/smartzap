/**
 * Gemini OCR Provider
 *
 * Usa modelos Gemini para extrair texto de documentos e imagens.
 * O modelo é configurável via setting `ocr_gemini_model`.
 *
 * Modelos disponíveis (preço por 1M tokens input):
 * - gemini-2.5-flash-lite: $0.02 - OCR básico, mais barato
 * - gemini-2.5-flash: $0.10 - Bom custo/benefício (default)
 * - gemini-2.5-pro: $1.25 - Melhor qualidade
 * - gemini-3-flash-preview: Última geração (preview)
 */

import { generateText, gateway } from 'ai'
import type { OCRProvider, OCRProcessParams, OCRResult } from '../types'

/** Modelo padrão para OCR - bom custo/benefício */
export const DEFAULT_OCR_MODEL = 'gemini-2.5-flash'

/** Prompt otimizado para extração de texto */
const OCR_PROMPT = `Extract ALL text content from this document/image.
Output as clean, well-structured Markdown.

Rules:
- Preserve headings, lists, and formatting structure
- Convert tables to Markdown tables with proper alignment
- Include ALL visible text, nothing should be omitted
- Maintain the original hierarchy and organization
- Do NOT add commentary, explanations, or summaries
- Do NOT wrap the output in code blocks
- Output ONLY the extracted content in Markdown format`

/**
 * Gemini OCR Provider
 *
 * Usa a API de visão do Gemini para processar documentos e imagens,
 * extraindo texto estruturado em formato Markdown.
 */
export class GeminiOCRProvider implements OCRProvider {
  name = 'gemini'

  constructor(
    private modelId: string = DEFAULT_OCR_MODEL
  ) {}

  async process({ content, mimeType, fileName }: OCRProcessParams): Promise<OCRResult> {
    const model = gateway(`google/${this.modelId}`)

    // AI SDK espera Buffer, NÃO string base64 (o SDK converte internamente)
    let fileData: Buffer

    if (typeof content === 'string') {
      // Se for data URL (data:application/pdf;base64,XXXX), extrair a parte base64
      if (content.includes(',')) {
        const base64Part = content.split(',')[1]
        fileData = Buffer.from(base64Part, 'base64')
      } else {
        // Assume que é base64 puro
        fileData = Buffer.from(content, 'base64')
      }
    } else {
      // ArrayBuffer - converter para Buffer
      fileData = Buffer.from(content)
    }

    const { text } = await generateText({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: fileData,
              mediaType: mimeType,
            },
            { type: 'text', text: OCR_PROMPT },
          ],
        },
      ],
    })

    console.log(`[ocr:gemini] Processed ${fileName} with ${this.modelId}`)

    return {
      markdown: text,
      provider: this.name,
      model: this.modelId,
    }
  }

  async isConfigured(): Promise<boolean> {
    // Autenticação é responsabilidade do AI Gateway (OIDC) — sempre disponível
    return true
  }
}
