/**
 * Template Variable Parser
 *
 * Pure functions for extracting and parsing template variables
 * from WhatsApp message templates.
 */

import type { Template, TemplateComponent } from '@/types/template.types'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Represents a parsed variable with its location context.
 */
export interface ParsedVariable {
  /** Variable name (e.g., "1", "nome", "produto") */
  name: string
  /** Component where the variable was found */
  location: 'header' | 'body' | 'button'
  /** Positional index (1-based for positional, 0 for named) */
  index: number
}

/**
 * Result of parsing all variables from a template.
 */
export interface ParsedTemplateVariables {
  /** Variables found in the header component */
  header: string[]
  /** Variables found in the body component */
  body: string[]
  /** Variables found in button URLs */
  buttons: string[]
  /** All unique variables across all components */
  all: string[]
}

/**
 * Extended variable info with context for UI display.
 */
export interface VariableInfo {
  /** Positional index (1-based for positional, 0 for named) */
  index: number
  /** Variable key/name */
  key: string
  /** Original placeholder (e.g., "{{nome}}") */
  placeholder: string
  /** Human-readable context description */
  context: string
}

/**
 * Extended button variable info.
 */
export interface ButtonVariableInfo extends VariableInfo {
  /** Index of the button in the buttons array */
  buttonIndex: number
  /** Button display text */
  buttonText: string
}

/**
 * Complete variable information from a template.
 */
export interface TemplateVariableInfo {
  /** Header variables with context */
  header: VariableInfo[]
  /** Body variables with context */
  body: VariableInfo[]
  /** Button variables with context */
  buttons: ButtonVariableInfo[]
  /** Total count of all variables */
  totalCount: number
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Regex pattern to match template variables.
 * Matches both positional ({{1}}) and named ({{variable_name}}) formats.
 */
export const VARIABLE_REGEX = /\{\{([\w\d_]+)\}\}/g

// =============================================================================
// FUNCTIONS
// =============================================================================

/**
 * Extracts all variable names from a text string.
 *
 * @param text - The text to extract variables from
 * @returns Array of unique variable names in order of first occurrence
 *
 * @example
 * extractVariablesFromText("Olá {{nome}}, seu pedido {{pedido}} está pronto!")
 * // Returns: ["nome", "pedido"]
 *
 * @example
 * extractVariablesFromText("{{1}} e {{2}} e {{1}} de novo")
 * // Returns: ["1", "2"]
 */
export function extractVariablesFromText(text: string): string[] {
  if (!text) return []

  const matches = text.match(VARIABLE_REGEX) || []
  const seen = new Set<string>()
  const result: string[] = []

  for (const match of matches) {
    const varName = match.replace(/[{}]/g, '')
    if (!seen.has(varName)) {
      seen.add(varName)
      result.push(varName)
    }
  }

  return result
}

/**
 * Parses a variable match to determine if it's positional or named.
 *
 * @param match - The variable match string (e.g., "{{1}}" or "{{nome}}")
 * @returns Object with isNumeric flag and the clean value
 *
 * @example
 * parseVariableId("{{1}}")
 * // Returns: { isNumeric: true, value: "1" }
 *
 * @example
 * parseVariableId("{{nome}}")
 * // Returns: { isNumeric: false, value: "nome" }
 */
export function parseVariableId(match: string): { isNumeric: boolean; value: string } {
  const clean = match.replace(/[{}]/g, '')
  const num = parseInt(clean, 10)
  return {
    isNumeric: !isNaN(num),
    value: clean,
  }
}

/**
 * Extracts all variables from a WhatsApp template.
 *
 * @param template - The template to parse
 * @returns Object containing variables by location and all unique variables
 *
 * @example
 * const template = {
 *   components: [
 *     { type: 'HEADER', format: 'TEXT', text: 'Olá {{nome}}!' },
 *     { type: 'BODY', text: 'Seu pedido {{pedido}} chegará em {{data}}.' },
 *     { type: 'BUTTONS', buttons: [{ type: 'URL', url: 'https://track.com/{{codigo}}' }] }
 *   ]
 * }
 * parseTemplateVariables(template)
 * // Returns: {
 * //   header: ["nome"],
 * //   body: ["pedido", "data"],
 * //   buttons: ["codigo"],
 * //   all: ["nome", "pedido", "data", "codigo"]
 * // }
 */
export function parseTemplateVariables(template: Template): ParsedTemplateVariables {
  const result: ParsedTemplateVariables = {
    header: [],
    body: [],
    buttons: [],
    all: [],
  }

  if (!template?.components) {
    return result
  }

  const components = template.components

  // Parse header variables (TEXT format only)
  const headerComponent = components.find(
    (c): c is TemplateComponent & { format: 'TEXT'; text: string } =>
      c.type === 'HEADER' && c.format === 'TEXT' && typeof c.text === 'string'
  )
  if (headerComponent) {
    result.header = extractVariablesFromText(headerComponent.text)
  }

  // Parse body variables
  const bodyComponent = components.find(
    (c): c is TemplateComponent & { text: string } =>
      c.type === 'BODY' && typeof c.text === 'string'
  )
  if (bodyComponent) {
    result.body = extractVariablesFromText(bodyComponent.text)
  }

  // Parse button URL variables
  const buttonsComponent = components.find((c) => c.type === 'BUTTONS')
  if (buttonsComponent?.buttons) {
    const buttonVars: string[] = []
    const seen = new Set<string>()

    for (const btn of buttonsComponent.buttons) {
      if (btn.type === 'URL' && btn.url) {
        const vars = extractVariablesFromText(btn.url)
        for (const v of vars) {
          if (!seen.has(v)) {
            seen.add(v)
            buttonVars.push(v)
          }
        }
      }
    }
    result.buttons = buttonVars
  }

  // Compute all unique variables
  const allSeen = new Set<string>()
  const allVars: string[] = []

  for (const v of [...result.header, ...result.body, ...result.buttons]) {
    if (!allSeen.has(v)) {
      allSeen.add(v)
      allVars.push(v)
    }
  }
  result.all = allVars

  return result
}

/**
 * Extracts detailed variable information from a template for UI rendering.
 *
 * @param template - The template to parse
 * @returns Detailed variable info with context for each location
 *
 * @example
 * const template = {
 *   components: [
 *     { type: 'BODY', text: 'Olá {{nome}}, pedido {{1}}' },
 *   ]
 * }
 * getTemplateVariableInfo(template)
 * // Returns: {
 * //   header: [],
 * //   body: [
 * //     { index: 0, key: "nome", placeholder: "{{nome}}", context: "Variável do corpo ({{nome}})" },
 * //     { index: 1, key: "1", placeholder: "{{1}}", context: "Variável do corpo ({{1}})" }
 * //   ],
 * //   buttons: [],
 * //   totalCount: 2
 * // }
 */
export function getTemplateVariableInfo(template: Template | null | undefined): TemplateVariableInfo {
  const result: TemplateVariableInfo = {
    header: [],
    body: [],
    buttons: [],
    totalCount: 0,
  }

  if (!template?.components) {
    return result
  }

  const components = template.components

  // Parse header variables
  const headerComponent = components.find(
    (c) => c.type === 'HEADER' && c.format === 'TEXT' && typeof c.text === 'string'
  )
  if (headerComponent?.text) {
    const matches = headerComponent.text.match(VARIABLE_REGEX) || []
    const seenKeys = new Set<string>()

    for (const match of matches) {
      const { isNumeric, value } = parseVariableId(match)
      if (seenKeys.has(value)) continue
      seenKeys.add(value)

      result.header.push({
        index: isNumeric ? parseInt(value, 10) : 0,
        key: value,
        placeholder: match,
        context: `Variável do cabeçalho (${match})`,
      })
    }
  }

  // Parse body variables
  const bodyComponent = components.find((c) => c.type === 'BODY' && typeof c.text === 'string')
  if (bodyComponent?.text) {
    const matches = bodyComponent.text.match(VARIABLE_REGEX) || []
    const seenKeys = new Set<string>()

    for (const match of matches) {
      const { isNumeric, value } = parseVariableId(match)
      if (seenKeys.has(value)) continue
      seenKeys.add(value)

      result.body.push({
        index: isNumeric ? parseInt(value, 10) : 0,
        key: value,
        placeholder: match,
        context: `Variável do corpo (${match})`,
      })
    }
  }

  // Parse button URL variables
  const buttonsComponent = components.find((c) => c.type === 'BUTTONS')
  if (buttonsComponent?.buttons) {
    buttonsComponent.buttons.forEach((btn, btnIndex) => {
      if (btn.type === 'URL' && btn.url) {
        const matches = btn.url.match(VARIABLE_REGEX) || []

        for (const match of matches) {
          const { isNumeric, value } = parseVariableId(match)

          result.buttons.push({
            index: isNumeric ? parseInt(value, 10) : 0,
            key: value,
            placeholder: match,
            context: `Variável da URL (${match})`,
            buttonIndex: btnIndex,
            buttonText: btn.text || `Botão ${btnIndex + 1}`,
          })
        }
      }
    })
  }

  result.totalCount = result.header.length + result.body.length + result.buttons.length

  // Fallback: se nenhuma variável de corpo foi encontrada via components
  // mas template.content tem variáveis, parsear direto do content.
  // Ocorre quando row.components é null no banco (templates antigos/sem sync completo).
  if (result.body.length === 0 && typeof template.content === 'string' && template.content) {
    const matches = template.content.match(new RegExp(VARIABLE_REGEX.source, 'g')) || []
    const seenKeys = new Set<string>()

    for (const match of matches) {
      const { isNumeric, value } = parseVariableId(match)
      if (seenKeys.has(value)) continue
      seenKeys.add(value)

      result.body.push({
        index: isNumeric ? parseInt(value, 10) : 0,
        key: value,
        placeholder: match,
        context: `Variável do corpo (${match})`,
      })
    }

    // Recalcular totalCount após fallback
    result.totalCount = result.header.length + result.body.length + result.buttons.length
  }

  return result
}

/**
 * Counts the total number of unique variables in a template.
 *
 * @param template - The template to count variables from
 * @returns Total count of unique variables
 */
export function countTemplateVariables(template: Template): number {
  const parsed = parseTemplateVariables(template)
  return parsed.all.length
}
