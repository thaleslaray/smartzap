import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'

vi.mock('@/lib/phone-formatter', () => ({
  normalizePhoneNumber: (val: string) => {
    if (val.startsWith('+55')) return val
    if (/^\d{10,}$/.test(val)) return `+${val}`
    return null
  },
  validatePhoneNumber: () => ({ isValid: true }),
}))

import {
  validateBody,
  formatZodErrors,
  CreateContactSchema,
  CreateCampaignSchema,
  SubmitLeadFormSchema,
} from './api-validation'

// ============================================================================
// validateBody
// ============================================================================

describe('validateBody', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  })

  it('returns { success: true, data } for valid input', () => {
    const result = validateBody(schema, { name: 'Alice', age: 30 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ name: 'Alice', age: 30 })
    }
  })

  it('returns { success: false, error } for invalid input', () => {
    const result = validateBody(schema, { name: '', age: -1 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeInstanceOf(z.ZodError)
    }
  })

  it('returns failure when data is null', () => {
    const result = validateBody(schema, null)
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// formatZodErrors
// ============================================================================

describe('formatZodErrors', () => {
  it('maps issues to path → messages record', () => {
    const schema = z.object({
      name: z.string().min(1, 'required'),
      email: z.string().email('invalid'),
    })
    const result = schema.safeParse({ name: '', email: 'bad' })

    if (!result.success) {
      const formatted = formatZodErrors(result.error)
      expect(formatted).toHaveProperty('name')
      expect(formatted).toHaveProperty('email')
      expect(formatted.name).toContain('required')
      expect(formatted.email).toContain('invalid')
    }
  })

  it('uses "root" for empty path', () => {
    // A refine on the top-level object produces an issue with empty path
    const schema = z.string().refine(() => false, { message: 'root error' })
    const result = schema.safeParse('anything')

    if (!result.success) {
      const formatted = formatZodErrors(result.error)
      expect(formatted).toHaveProperty('root')
      expect(formatted.root).toContain('root error')
    }
  })

  it('joins nested paths with dots', () => {
    const schema = z.object({
      contacts: z.array(
        z.object({ phone: z.string().min(1, 'phone required') })
      ),
    })
    const result = schema.safeParse({ contacts: [{ phone: '' }] })

    if (!result.success) {
      const formatted = formatZodErrors(result.error)
      expect(formatted).toHaveProperty('contacts.0.phone')
    }
  })
})

// ============================================================================
// CreateContactSchema
// ============================================================================

describe('CreateContactSchema', () => {
  it('accepts valid contact data', () => {
    const data = {
      name: 'João Silva',
      phone: '+5511999999999',
    }
    const result = CreateContactSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('normalizes phone via transform', () => {
    const data = {
      name: 'Maria',
      phone: '+5511988887777',
    }
    const result = CreateContactSchema.safeParse(data)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.phone).toBe('+5511988887777')
    }
  })

  it('rejects missing name', () => {
    const result = CreateContactSchema.safeParse({ phone: '+5511999999999' })
    expect(result.success).toBe(false)
  })

  it('rejects missing phone', () => {
    const result = CreateContactSchema.safeParse({ name: 'Test' })
    expect(result.success).toBe(false)
  })

  it('rejects phone that cannot be normalized', () => {
    const result = CreateContactSchema.safeParse({
      name: 'Test',
      phone: 'abc',
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional email, tags, notes, custom_fields', () => {
    const data = {
      name: 'Test',
      phone: '+5511999999999',
      email: 'test@example.com',
      tags: ['lead'],
      notes: 'some note',
      custom_fields: { source: 'web' },
    }
    const result = CreateContactSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('defaults tags to empty array when omitted', () => {
    const data = { name: 'Test', phone: '+5511999999999' }
    const result = CreateContactSchema.safeParse(data)
    if (result.success) {
      expect(result.data.tags).toEqual([])
    }
  })
})

// ============================================================================
// CreateCampaignSchema
// ============================================================================

describe('CreateCampaignSchema', () => {
  it('accepts valid campaign data', () => {
    const data = {
      name: 'Black Friday',
      templateName: 'promo_bf_2024',
    }
    const result = CreateCampaignSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('rejects missing name', () => {
    const result = CreateCampaignSchema.safeParse({ templateName: 'tpl' })
    expect(result.success).toBe(false)
  })

  it('rejects missing templateName', () => {
    const result = CreateCampaignSchema.safeParse({ name: 'Camp' })
    expect(result.success).toBe(false)
  })

  it('defaults recipients to 0 when omitted', () => {
    const data = { name: 'Test', templateName: 'tpl' }
    const result = CreateCampaignSchema.safeParse(data)
    if (result.success) {
      expect(result.data.recipients).toBe(0)
    }
  })

  it('accepts optional templateVariables', () => {
    const data = {
      name: 'Test',
      templateName: 'tpl',
      templateVariables: {
        header: ['img1'],
        body: ['var1', 'var2'],
      },
    }
    const result = CreateCampaignSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('transforms flowId number to string', () => {
    const data = {
      name: 'Test',
      templateName: 'tpl',
      flowId: 12345,
    }
    const result = CreateCampaignSchema.safeParse(data)
    if (result.success) {
      expect(result.data.flowId).toBe('12345')
    }
  })
})

// ============================================================================
// SubmitLeadFormSchema — honeypot spam detection
// ============================================================================

describe('SubmitLeadFormSchema', () => {
  it('accepts valid submission with empty honeypot', () => {
    const data = {
      name: 'João',
      phone: '+5511999999999',
      website: '',
    }
    const result = SubmitLeadFormSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('rejects when honeypot field is filled (spam)', () => {
    const data = {
      name: 'Bot',
      phone: '+5511999999999',
      website: 'http://spam.com',
    }
    const result = SubmitLeadFormSchema.safeParse(data)
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message)
      expect(messages).toContain('Spam detectado')
    }
  })

  it('rejects missing name', () => {
    const result = SubmitLeadFormSchema.safeParse({
      phone: '+5511999999999',
    })
    expect(result.success).toBe(false)
  })

  it('rejects phone shorter than 10 chars', () => {
    const result = SubmitLeadFormSchema.safeParse({
      name: 'Test',
      phone: '12345',
    })
    expect(result.success).toBe(false)
  })

  it('defaults custom_fields to empty object when omitted', () => {
    const data = {
      name: 'Test',
      phone: '+5511999999999',
    }
    const result = SubmitLeadFormSchema.safeParse(data)
    if (result.success) {
      expect(result.data.custom_fields).toEqual({})
    }
  })
})
