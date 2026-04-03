import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/phone-formatter', () => ({
  normalizePhoneNumber: (val: string) => val.startsWith('+') ? val : `+55${val}`,
  validatePhoneNumber: () => ({ isValid: true }),
}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  generateTraceId: () => 'trace-test',
}))
vi.mock('@/lib/errors', () => ({
  handleParseError: (err: unknown, type: string) => new Error(`Parse error: ${type}`),
}))

import {
  detectDelimiter,
  previewFile,
  exportToCSV,
  generateImportReport,
  parseContactsFile,
  type ParsedContact,
  type ParseResult,
} from './csv-parser'

// ---------------------------------------------------------------------------
// detectDelimiter
// ---------------------------------------------------------------------------
describe('detectDelimiter', () => {
  it('detects comma', () => {
    expect(detectDelimiter('name,phone,email\nJohn,123,j@e.com')).toBe(',')
  })

  it('detects semicolon', () => {
    expect(detectDelimiter('name;phone;email\nJohn;123;j@e.com')).toBe(';')
  })

  it('detects tab', () => {
    expect(detectDelimiter('name\tphone\temail\nJohn\t123\tj@e.com')).toBe('\t')
  })

  it('detects pipe', () => {
    expect(detectDelimiter('name|phone|email\nJohn|123|j@e.com')).toBe('|')
  })

  it('defaults to comma when no delimiters found', () => {
    expect(detectDelimiter('singlevalue')).toBe(',')
  })

  it('picks the most frequent delimiter', () => {
    // 3 semicolons vs 1 comma
    expect(detectDelimiter('a;b;c;d,e')).toBe(';')
  })

  it('handles empty content', () => {
    expect(detectDelimiter('')).toBe(',')
  })
})

// ---------------------------------------------------------------------------
// previewFile
// ---------------------------------------------------------------------------
describe('previewFile', () => {
  it('returns headers and rows', () => {
    const csv = 'phone,name\n111,Alice\n222,Bob\n333,Charlie'
    const result = previewFile(csv)

    expect(result.headers).toEqual(['phone', 'name'])
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0]).toEqual(['111', 'Alice'])
  })

  it('respects numRows parameter', () => {
    const csv = 'phone,name\n111,Alice\n222,Bob\n333,Charlie\n444,Dave'
    const result = previewFile(csv, 2)

    expect(result.rows).toHaveLength(2)
  })

  it('handles semicolon-delimited content', () => {
    const csv = 'phone;name\n111;Alice\n222;Bob'
    const result = previewFile(csv)

    expect(result.headers).toEqual(['phone', 'name'])
    expect(result.rows[0]).toEqual(['111', 'Alice'])
  })

  it('handles empty content', () => {
    const result = previewFile('')
    expect(result.headers).toEqual([])
    expect(result.rows).toEqual([])
  })

  it('handles content with only a header line', () => {
    const result = previewFile('phone,name')
    expect(result.headers).toEqual(['phone', 'name'])
    expect(result.rows).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// exportToCSV
// ---------------------------------------------------------------------------
describe('exportToCSV', () => {
  const contacts: ParsedContact[] = [
    { phone: '+5511999999999', name: 'Alice', originalPhone: '11999999999', rowNumber: 2 },
    { phone: '+5511888888888', originalPhone: '11888888888', rowNumber: 3 },
  ]

  it('exports basic CSV with phone and name', () => {
    const csv = exportToCSV(contacts)
    // Papa Parse uses \r\n line endings
    const lines = csv.split('\r\n')

    expect(lines[0]).toBe('Telefone,Nome')
    expect(lines[1]).toContain('+5511999999999')
    expect(lines[1]).toContain('Alice')
    expect(lines[2]).toContain('+5511888888888')
  })

  it('fills empty name with empty string', () => {
    const csv = exportToCSV(contacts)
    const lines = csv.split('\n')
    // Second contact has no name
    expect(lines[2]).toBe('+5511888888888,')
  })

  it('includes variable columns when includeVariables is true', () => {
    const contactsWithVars: ParsedContact[] = [
      { phone: '+5511999999999', name: 'Alice', variables: ['var1', 'var2'], originalPhone: '11999999999', rowNumber: 2 },
      { phone: '+5511888888888', name: 'Bob', variables: ['var3'], originalPhone: '11888888888', rowNumber: 3 },
    ]
    const csv = exportToCSV(contactsWithVars, true)
    const lines = csv.split('\n')

    // Header should include Variável 1, Variável 2
    expect(lines[0]).toContain('Variável 1')
    expect(lines[0]).toContain('Variável 2')
    expect(lines[1]).toContain('var1')
    expect(lines[1]).toContain('var2')
  })

  it('handles empty contacts array', () => {
    const csv = exportToCSV([])
    expect(csv).toContain('Telefone,Nome')
  })

  it('handles empty contacts array with includeVariables', () => {
    const csv = exportToCSV([], true)
    // No variables to detect, so just base headers (Papa Parse appends \r\n)
    expect(csv.trim()).toBe('Telefone,Nome')
  })
})

// ---------------------------------------------------------------------------
// generateImportReport
// ---------------------------------------------------------------------------
describe('generateImportReport', () => {
  it('generates a report with valid rows', () => {
    const result: ParseResult = {
      success: true,
      contacts: [],
      invalidRows: [],
      duplicates: [],
      totalRows: 100,
      validRows: 95,
    }
    const report = generateImportReport(result)

    expect(report).toContain('95')
    expect(report).toContain('100')
    expect(report).toContain('0') // invalid + duplicates
  })

  it('includes invalid row details (up to 10)', () => {
    const result: ParseResult = {
      success: true,
      contacts: [],
      invalidRows: [
        { row: 2, reason: 'Telefone vazio', data: '' },
        { row: 5, reason: 'Formato inválido', data: 'abc' },
      ],
      duplicates: ['111'],
      totalRows: 10,
      validRows: 7,
    }
    const report = generateImportReport(result)

    expect(report).toContain('Linha 2')
    expect(report).toContain('Telefone vazio')
    expect(report).toContain('Linha 5')
    expect(report).toContain('Formato inválido')
    expect(report).toContain('1') // 1 duplicate
  })

  it('truncates errors beyond 10 with a summary', () => {
    const invalidRows = Array.from({ length: 15 }, (_, i) => ({
      row: i + 2,
      reason: 'Erro',
      data: `data-${i}`,
    }))
    const result: ParseResult = {
      success: true,
      contacts: [],
      invalidRows,
      duplicates: [],
      totalRows: 20,
      validRows: 5,
    }
    const report = generateImportReport(result)

    // Should show first 10 lines, then "... e mais 5 erros"
    expect(report).toContain('... e mais 5 erros')
  })
})

// ---------------------------------------------------------------------------
// parseContactsFile
// ---------------------------------------------------------------------------
describe('parseContactsFile', () => {
  it('parses a simple CSV with header', () => {
    const csv = 'phone,name\n11999999999,Alice\n11888888888,Bob'
    const result = parseContactsFile(csv, { nameColumn: 1 })

    expect(result.success).toBe(true)
    expect(result.contacts).toHaveLength(2)
    expect(result.contacts[0].phone).toBe('+5511999999999')
    expect(result.contacts[0].name).toBe('Alice')
    expect(result.contacts[0].originalPhone).toBe('11999999999')
    expect(result.validRows).toBe(2)
  })

  it('defaults to phone column 0 and header true', () => {
    const csv = '+5511999999999\n+5511888888888'
    const result = parseContactsFile(csv, { hasHeader: true })

    // First row treated as header, second row is the data
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts[0].phone).toBe('+5511888888888')
  })

  it('handles hasHeader=false', () => {
    const csv = '+5511999999999\n+5511888888888'
    const result = parseContactsFile(csv, { hasHeader: false })

    expect(result.contacts).toHaveLength(2)
  })

  it('skips empty rows', () => {
    const csv = 'phone\n11999999999\n\n\n11888888888'
    const result = parseContactsFile(csv)

    expect(result.contacts).toHaveLength(2)
  })

  it('marks rows with empty phone as invalid', () => {
    const csv = 'phone,name\n,Alice\n11888888888,Bob'
    const result = parseContactsFile(csv)

    expect(result.contacts).toHaveLength(1)
    expect(result.invalidRows).toHaveLength(1)
    expect(result.invalidRows[0].reason).toBe('Telefone vazio')
  })

  it('detects and reports duplicate phones', () => {
    const csv = 'phone\n11999999999\n11999999999\n11888888888'
    const result = parseContactsFile(csv)

    expect(result.contacts).toHaveLength(2)
    expect(result.duplicates).toHaveLength(1)
    expect(result.duplicates[0]).toBe('11999999999')
  })

  it('extracts variables from specified columns', () => {
    const csv = 'phone,name,city,age\n11999999999,Alice,SP,30'
    const result = parseContactsFile(csv, {
      nameColumn: 1,
      variableColumns: [2, 3],
    })

    expect(result.contacts[0].variables).toEqual(['SP', '30'])
  })

  it('totalRows counts only data rows (excluding header)', () => {
    const csv = 'phone\n111\n222\n333'
    const result = parseContactsFile(csv)

    expect(result.totalRows).toBe(3)
  })

  it('handles semicolon-delimited files via delimiter option', () => {
    const csv = 'phone;name\n11999999999;Alice'
    const result = parseContactsFile(csv, { delimiter: ';', nameColumn: 1 })

    expect(result.contacts).toHaveLength(1)
    expect(result.contacts[0].name).toBe('Alice')
  })

  it('assigns correct rowNumber (1-based)', () => {
    const csv = 'phone\n111\n222'
    const result = parseContactsFile(csv)

    expect(result.contacts[0].rowNumber).toBe(2) // row 1 is header
    expect(result.contacts[1].rowNumber).toBe(3)
  })
})
