import {
  validateCampaignForSend,
  hasAllRequiredVariables,
  validateTemplateVariablesArray,
  type CampaignSendData,
} from './send-validator'

// =============================================================================
// Helpers
// =============================================================================

function makeSendData(overrides: Partial<CampaignSendData> = {}): CampaignSendData {
  return {
    name: 'Campanha Teste',
    templateId: 'tpl_123',
    recipientCount: 10,
    accountLimit: 250,
    variableMappings: { '1': '{{nome}}', '2': '{{telefone}}' },
    requiredVariables: ['1', '2'],
    ...overrides,
  }
}

// =============================================================================
// validateCampaignForSend
// =============================================================================

describe('validateCampaignForSend', () => {
  it('returns valid for a fully valid campaign', () => {
    const result = validateCampaignForSend(makeSendData())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('returns error for empty campaign name', () => {
    const result = validateCampaignForSend(makeSendData({ name: '' }))
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'NAME_REQUIRED')).toBe(true)
  })

  it('returns error for short campaign name', () => {
    const result = validateCampaignForSend(makeSendData({ name: 'AB' }))
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'NAME_TOO_SHORT')).toBe(true)
  })

  it('returns error for missing template', () => {
    const result = validateCampaignForSend(makeSendData({ templateId: '' }))
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'TEMPLATE_REQUIRED')).toBe(true)
  })

  it('returns error for whitespace-only templateId', () => {
    const result = validateCampaignForSend(makeSendData({ templateId: '   ' }))
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'TEMPLATE_REQUIRED')).toBe(true)
  })

  it('returns error for zero recipients', () => {
    const result = validateCampaignForSend(makeSendData({ recipientCount: 0 }))
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'NO_RECIPIENTS')).toBe(true)
  })

  it('returns error for incomplete variables', () => {
    const result = validateCampaignForSend(
      makeSendData({
        variableMappings: { '1': '{{nome}}', '2': '' },
        requiredVariables: ['1', '2'],
      })
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'VARIABLES_INCOMPLETE')).toBe(true)
    expect(result.errors.find(e => e.code === 'VARIABLES_INCOMPLETE')!.message).toContain('1 pendentes')
  })

  it('returns warning when recipients exceed account limit', () => {
    const result = validateCampaignForSend(
      makeSendData({ recipientCount: 500, accountLimit: 250 })
    )
    expect(result.valid).toBe(true) // warnings don't block
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('500')
    expect(result.warnings[0]).toContain('250')
  })

  it('no warning when recipients are within account limit', () => {
    const result = validateCampaignForSend(
      makeSendData({ recipientCount: 100, accountLimit: 250 })
    )
    expect(result.warnings).toHaveLength(0)
  })

  it('no warning when recipients equal account limit', () => {
    const result = validateCampaignForSend(
      makeSendData({ recipientCount: 250, accountLimit: 250 })
    )
    expect(result.warnings).toHaveLength(0)
  })

  it('accumulates multiple errors', () => {
    const result = validateCampaignForSend(
      makeSendData({
        name: '',
        templateId: '',
        recipientCount: 0,
        variableMappings: {},
        requiredVariables: ['1'],
      })
    )
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(3) // name + template + recipients
  })

  it('returns valid when no required variables exist', () => {
    const result = validateCampaignForSend(
      makeSendData({
        variableMappings: {},
        requiredVariables: [],
      })
    )
    expect(result.valid).toBe(true)
  })
})

// =============================================================================
// hasAllRequiredVariables
// =============================================================================

describe('hasAllRequiredVariables', () => {
  it('returns valid when all required variables are filled', () => {
    const result = hasAllRequiredVariables(
      { '1': '{{nome}}', '2': '{{telefone}}' },
      ['1', '2']
    )
    expect(result).toEqual({ valid: true, missing: [] })
  })

  it('returns valid when no required variables', () => {
    const result = hasAllRequiredVariables({}, [])
    expect(result).toEqual({ valid: true, missing: [] })
  })

  it('returns invalid with missing keys listed', () => {
    const result = hasAllRequiredVariables(
      { '1': '{{nome}}', '2': '', '3': '{{telefone}}' },
      ['1', '2', '3']
    )
    expect(result.valid).toBe(false)
    expect(result.missing).toEqual(['2'])
  })

  it('treats whitespace-only values as missing', () => {
    const result = hasAllRequiredVariables(
      { '1': '   ' },
      ['1']
    )
    expect(result.valid).toBe(false)
    expect(result.missing).toEqual(['1'])
  })

  it('treats absent keys as missing', () => {
    const result = hasAllRequiredVariables(
      { '1': 'value' },
      ['1', '2']
    )
    expect(result.valid).toBe(false)
    expect(result.missing).toEqual(['2'])
  })

  it('treats non-string values as missing', () => {
    const result = hasAllRequiredVariables(
      { '1': undefined as unknown as string },
      ['1']
    )
    expect(result.valid).toBe(false)
    expect(result.missing).toEqual(['1'])
  })

  it('lists all missing keys in order', () => {
    const result = hasAllRequiredVariables(
      {},
      ['a', 'b', 'c']
    )
    expect(result.missing).toEqual(['a', 'b', 'c'])
  })
})

// =============================================================================
// validateTemplateVariablesArray
// =============================================================================

describe('validateTemplateVariablesArray', () => {
  it('returns valid when all variables are filled', () => {
    const result = validateTemplateVariablesArray(
      { header: ['value1'], body: ['value2', 'value3'] },
      { header: 1, body: 2, buttons: 0 }
    )
    expect(result).toEqual({ valid: true, missingCount: 0 })
  })

  it('returns invalid with correct missing count', () => {
    const result = validateTemplateVariablesArray(
      { header: ['value1'], body: ['', 'value3'] },
      { header: 1, body: 2, buttons: 0 }
    )
    expect(result).toEqual({ valid: false, missingCount: 1 })
  })

  it('counts missing header variables', () => {
    const result = validateTemplateVariablesArray(
      { header: [''], body: ['value1'] },
      { header: 1, body: 1, buttons: 0 }
    )
    expect(result.missingCount).toBe(1)
  })

  it('counts missing button variables', () => {
    const result = validateTemplateVariablesArray(
      { header: [], body: ['value1'], buttons: { btn_1: '', btn_2: 'filled' } },
      { header: 0, body: 1, buttons: 2 }
    )
    expect(result.missingCount).toBe(1)
  })

  it('handles empty arrays and no buttons', () => {
    const result = validateTemplateVariablesArray(
      { header: [], body: [] },
      { header: 0, body: 0, buttons: 0 }
    )
    expect(result).toEqual({ valid: true, missingCount: 0 })
  })

  it('handles undefined buttons gracefully', () => {
    const result = validateTemplateVariablesArray(
      { header: [], body: ['val'] },
      { header: 0, body: 1, buttons: 0 }
    )
    expect(result).toEqual({ valid: true, missingCount: 0 })
  })

  it('treats whitespace-only values as not filled', () => {
    const result = validateTemplateVariablesArray(
      { header: ['  '], body: [' \t '] },
      { header: 1, body: 1, buttons: 0 }
    )
    expect(result).toEqual({ valid: false, missingCount: 2 })
  })

  it('counts correctly when all variables are missing', () => {
    const result = validateTemplateVariablesArray(
      { header: ['', ''], body: ['', '', ''], buttons: { a: '', b: '' } },
      { header: 2, body: 3, buttons: 2 }
    )
    expect(result).toEqual({ valid: false, missingCount: 7 })
  })

  it('counts correctly when more filled than expected (overfill)', () => {
    // 3 filled in body, but only 2 expected -> missingCount = max(0, 2 - 3) = 0
    // Actually: totalRequired = 0+2+0 = 2, filledCount = 3 -> missingCount = max(0, -1) = 0
    const result = validateTemplateVariablesArray(
      { header: [], body: ['a', 'b', 'c'] },
      { header: 0, body: 2, buttons: 0 }
    )
    expect(result).toEqual({ valid: true, missingCount: 0 })
  })
})
