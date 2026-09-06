/**
 * Reading a spreadsheet into columns and rows of text.
 *
 * Three shapes come in: CSV in any delimiter and either UTF-8 or a legacy
 * Windows encoding, Excel workbooks, and vCard address books exported from a
 * phone. Everything comes out the same way, as a header row and string cells,
 * so the rest of the importer never has to know where the file came from.
 */

import ExcelJS from 'exceljs'
import iconv from 'iconv-lite'
import Papa from 'papaparse'

export type ImportFileFormat = 'csv' | 'xlsx' | 'vcard'

export interface ParsedSheet {
  format: ImportFileFormat
  columns: string[]
  rows: string[][]
  /** Sheet name for workbooks, so the user can tell which tab was read. */
  sheetName?: string
  /** Detected CSV delimiter, for display. */
  delimiter?: string
  /** Detected text encoding, for display. */
  encoding?: string
}

/** Hard ceiling on rows in one file. Bigger than any shop's customer list. */
export const MAX_IMPORT_ROWS = 50_000
export const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024

export class ImportParseError extends Error {
  code: 'unsupported_format' | 'empty' | 'too_many_rows' | 'legacy_xls' | 'unreadable'
  constructor(code: ImportParseError['code'], message: string) {
    super(message)
    this.code = code
  }
}

function extensionOf(fileName: string): string {
  return fileName.toLowerCase().split('.').pop() ?? ''
}

// ── Text decoding ─────────────────────────────────────────────────────────────

/**
 * UTF-8 when it is valid UTF-8, otherwise Windows-1252, which is what an old
 * Windows shop system and Excel's plain "CSV" export both produce. A BOM is
 * stripped so it does not end up glued to the first header.
 */
export function decodeText(buffer: Buffer): { text: string; encoding: string } {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: iconv.decode(buffer, 'utf16le'), encoding: 'UTF-16' }
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { text: iconv.decode(buffer, 'utf16be'), encoding: 'UTF-16' }
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return { text: text.replace(/^﻿/, ''), encoding: 'UTF-8' }
  } catch {
    return { text: iconv.decode(buffer, 'win1252'), encoding: 'Windows-1252' }
  }
}

// ── Headers ───────────────────────────────────────────────────────────────────

/** Blank headers get a name, duplicate headers get a suffix, so a mapping can address every column. */
export function tidyColumns(raw: (string | null | undefined)[]): string[] {
  const seen = new Map<string, number>()
  return raw.map((h, i) => {
    let name = String(h ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!name) name = `Column ${i + 1}`
    const count = seen.get(name) ?? 0
    seen.set(name, count + 1)
    return count ? `${name} (${count + 1})` : name
  })
}

/** Drop trailing empty columns and rows that are entirely blank. */
function trimSheet(columns: string[], rows: string[][]): { columns: string[]; rows: string[][] } {
  let width = columns.length
  while (width > 0) {
    const col = width - 1
    const headerBlank = /^Column \d+$/.test(columns[col])
    const allBlank = rows.every((r) => !(r[col] ?? '').trim())
    if (headerBlank && allBlank) width--
    else break
  }
  const trimmedColumns = columns.slice(0, width)
  const trimmedRows = rows
    .map((r) => {
      const out = r.slice(0, width)
      while (out.length < width) out.push('')
      return out
    })
    .filter((r) => r.some((c) => c.trim()))
  return { columns: trimmedColumns, rows: trimmedRows }
}

// ── CSV ───────────────────────────────────────────────────────────────────────

export function parseCsv(buffer: Buffer): ParsedSheet {
  const { text, encoding } = decodeText(buffer)
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
    delimitersToGuess: [',', ';', '\t', '|'],
  })
  const data = result.data.filter((r) => Array.isArray(r))
  if (data.length === 0) throw new ImportParseError('empty', 'The file has no rows.')
  const columns = tidyColumns(data[0])
  const body = data.slice(1).map((r) => r.map((c) => String(c ?? '')))
  const sheet = trimSheet(columns, body)
  return {
    format: 'csv',
    ...sheet,
    delimiter: result.meta.delimiter,
    encoding,
  }
}

// ── Excel ─────────────────────────────────────────────────────────────────────

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('')
    if ('text' in value) return cellText(value.text as ExcelJS.CellValue)
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue)
    if ('error' in value) return ''
    if ('hyperlink' in value) return String((value as { hyperlink: string }).hyperlink)
    return ''
  }
  return String(value)
}

export async function parseXlsx(buffer: Buffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  } catch {
    throw new ImportParseError('unreadable', 'The workbook could not be read.')
  }
  const sheet = workbook.worksheets.find((ws) => ws.rowCount > 0) ?? workbook.worksheets[0]
  if (!sheet) throw new ImportParseError('empty', 'The workbook has no sheets.')

  const grid: string[][] = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as ExcelJS.CellValue[]
    // ExcelJS row values are 1-based; index 0 is always empty.
    const cells: string[] = []
    for (let i = 1; i < values.length; i++) cells.push(cellText(values[i]).trim())
    grid.push(cells)
  })
  if (grid.length === 0) throw new ImportParseError('empty', 'The sheet has no rows.')

  const width = Math.max(...grid.map((r) => r.length))
  const columns = tidyColumns(grid[0].concat(Array(width - grid[0].length).fill('')))
  const body = grid.slice(1)
  const trimmed = trimSheet(columns, body)
  return { format: 'xlsx', ...trimmed, sheetName: sheet.name }
}

// ── vCard ─────────────────────────────────────────────────────────────────────

const VCARD_COLUMNS = [
  'Name',
  'First name',
  'Last name',
  'Email',
  'Phone',
  'Company',
  'Address',
  'Notes',
]

function unfoldVcard(text: string): string[] {
  // RFC 6350 folds long lines with a leading space; join them back.
  return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
}

function vcardValue(line: string): string {
  const value = line.slice(line.indexOf(':') + 1).trim()
  return value.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ')
}

export function parseVcard(buffer: Buffer): ParsedSheet {
  const { text } = decodeText(buffer)
  const cards = text.split(/BEGIN:VCARD/i).filter((c) => /END:VCARD/i.test(c))
  const rows: string[][] = []
  for (const card of cards) {
    let name = ''
    let first = ''
    let last = ''
    let email = ''
    let phone = ''
    let company = ''
    let address = ''
    let notes = ''
    for (const line of unfoldVcard(card)) {
      const upper = line.toUpperCase()
      const key = upper.split(/[;:]/)[0]
      switch (key) {
        case 'FN':
          name = vcardValue(line)
          break
        case 'N': {
          const parts = vcardValue(line).split(';')
          last = parts[0]?.trim() ?? ''
          first = parts[1]?.trim() ?? ''
          break
        }
        case 'EMAIL':
          if (!email) email = vcardValue(line)
          break
        case 'TEL':
          if (!phone || upper.includes('TYPE=CELL') || upper.includes('TYPE=MOBILE')) {
            const v = vcardValue(line).replace(/^tel:/i, '')
            if (!phone || upper.includes('TYPE=CELL') || upper.includes('TYPE=MOBILE')) phone = v
          }
          break
        case 'ORG':
          company = vcardValue(line).split(';')[0].trim()
          break
        case 'ADR':
          if (!address) {
            // post office box; extended; street; locality; region; postal code; country
            const p = vcardValue(line).split(';')
            address = [p[2], [p[5], p[3]].filter(Boolean).join(' '), p[4], p[6]]
              .map((s) => (s ?? '').trim())
              .filter(Boolean)
              .join(', ')
          }
          break
        case 'NOTE':
          notes = vcardValue(line)
          break
      }
    }
    if (!name) name = [first, last].filter(Boolean).join(' ')
    if (!name && !company) continue
    rows.push([name || company, first, last, email, phone, company, address, notes])
  }
  if (rows.length === 0) throw new ImportParseError('empty', 'No contacts were found in the file.')
  return { format: 'vcard', columns: [...VCARD_COLUMNS], rows }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function parseImportFile(buffer: Buffer, fileName: string): Promise<ParsedSheet> {
  const ext = extensionOf(fileName)
  let sheet: ParsedSheet
  if (ext === 'xlsx' || ext === 'xlsm') {
    sheet = await parseXlsx(buffer)
  } else if (ext === 'xls') {
    throw new ImportParseError(
      'legacy_xls',
      'Old Excel .xls files are not supported. Open the file in Excel and save it as .xlsx or .csv.'
    )
  } else if (ext === 'vcf' || ext === 'vcard') {
    sheet = parseVcard(buffer)
  } else if (['csv', 'tsv', 'txt', ''].includes(ext)) {
    // A file renamed .csv that is really a workbook starts with the zip magic.
    if (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
      sheet = await parseXlsx(buffer)
    } else {
      sheet = parseCsv(buffer)
    }
  } else {
    throw new ImportParseError(
      'unsupported_format',
      'Unsupported file type. Upload a .csv, .xlsx or .vcf file.'
    )
  }

  if (sheet.rows.length === 0) throw new ImportParseError('empty', 'The file has no data rows.')
  if (sheet.rows.length > MAX_IMPORT_ROWS) {
    throw new ImportParseError(
      'too_many_rows',
      `The file has ${sheet.rows.length} rows; the limit is ${MAX_IMPORT_ROWS}. Split it and import in parts.`
    )
  }
  return sheet
}
