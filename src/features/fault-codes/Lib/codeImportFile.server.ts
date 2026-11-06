import 'server-only'
import { ImportParseError, decodeText, parseImportFile } from '@/features/import/Lib/parse'
import type { CodeImportRow } from '@/features/integrations/Lib/types'

/**
 * A workshop's file of fault codes, read into rows the code service checks: a spreadsheet
 * (Excel or CSV, one row per code) or JSON, as the example files show. Columns are known by
 * their header whatever its case or spacing, and a few other words people use for them
 * ("DTC", "How to fix it"). Causes in a cell are one per line or split by semicolons, each
 * with its likelihood in brackets if the file says it: "Battery disconnected (high)".
 */

export const MAX_CODE_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_CODE_IMPORT_ROWS = 2000

/** Why a file could not be read as codes at all. */
export type CodeFileProblem =
  | 'unreadable'
  | 'empty'
  | 'no_code_column'
  | 'too_many'
  | 'format'
  | 'legacy_xls'

export class CodeFileError extends Error {
  constructor(readonly problem: CodeFileProblem) {
    super(problem)
  }
}

export interface CodeFile {
  rows: CodeImportRow[]
  /** What a JSON file says of itself, to fill the dialog's fields with. */
  make?: string
  language?: string
  source?: string
}

type Field = keyof Omit<CodeImportRow, 'causes'> | 'causes'

const HEADERS: Record<Field, string[]> = {
  code: ['code', 'dtc', 'fault code', 'trouble code', 'error code', 'dtc code'],
  title: ['title', 'name', 'short description', 'short text'],
  description: ['description', 'what it means', 'meaning', 'details'],
  commonIssues: ['common issues', 'common problems', 'known issues'],
  resolution: ['how to fix', 'how to fix it', 'resolution', 'fix', 'repair', 'solution'],
  advisory: ['good to know', 'advice', 'advisory', 'notes', 'note', 'tips'],
  causes: ['causes', 'possible causes', 'likely causes', 'cause'],
}

const JSON_KEYS: Record<Field, string[]> = {
  code: ['code', 'dtc'],
  title: ['title', 'name'],
  description: ['description', 'what_it_means', 'meaning'],
  commonIssues: ['common_issues', 'commonIssues'],
  resolution: ['how_to_fix', 'howToFix', 'resolution', 'fix'],
  advisory: ['good_to_know', 'goodToKnow', 'advice', 'advisory', 'notes'],
  causes: ['causes', 'possible_causes'],
}

function headerKey(header: string): string {
  return header
    .toLowerCase()
    .replace(/[_\-:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "Battery disconnected (high)" as its label and likelihood. */
export function readCause(text: string): { label: string; likelihood?: string } | null {
  const trimmed = text.trim().replace(/^[-*•]\s*/, '')
  if (!trimmed) return null
  const m = /^(.*?)\s*[([]\s*(low|medium|high)\s*[)\]]$/i.exec(trimmed)
  if (m?.[1]) return { label: m[1].trim(), likelihood: m[2].toLowerCase() }
  return { label: trimmed }
}

/** A cell of causes, one per line or split by semicolons. */
export function readCauses(cell: string): { label: string; likelihood?: string }[] {
  return cell
    .split(/\r?\n|;/)
    .map(readCause)
    .filter((c): c is { label: string; likelihood?: string } => c !== null)
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const s = String(value).trim()
  return s || undefined
}

function fromSheet(columns: string[], rows: string[][]): CodeImportRow[] {
  const at = new Map<Field, number>()
  columns.forEach((header, i) => {
    const key = headerKey(header)
    for (const [field, names] of Object.entries(HEADERS) as [Field, string[]][]) {
      if (!at.has(field) && names.includes(key)) at.set(field, i)
    }
  })
  const codeAt = at.get('code')
  if (codeAt === undefined) throw new CodeFileError('no_code_column')
  const cell = (row: string[], field: Field) => {
    const i = at.get(field)
    return i === undefined ? undefined : text(row[i])
  }
  return rows
    .filter((row) => row.some((c) => c.trim() !== ''))
    .map((row) => ({
      code: cell(row, 'code') ?? '',
      title: cell(row, 'title'),
      description: cell(row, 'description'),
      commonIssues: cell(row, 'commonIssues'),
      resolution: cell(row, 'resolution'),
      advisory: cell(row, 'advisory'),
      causes: readCauses(cell(row, 'causes') ?? ''),
    }))
}

function jsonField(item: Record<string, unknown>, field: Field): unknown {
  for (const key of JSON_KEYS[field]) if (key in item) return item[key]
  return undefined
}

function fromJson(raw: string): CodeFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.replace(/^﻿/, ''))
  } catch {
    throw new CodeFileError('unreadable')
  }
  const top = Array.isArray(parsed) ? { codes: parsed } : (parsed as Record<string, unknown>)
  const codes = top && typeof top === 'object' ? top.codes : undefined
  if (!Array.isArray(codes)) throw new CodeFileError('format')
  const rows = codes.map((entry): CodeImportRow => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    const causes = jsonField(item, 'causes')
    return {
      code: text(jsonField(item, 'code')) ?? '',
      title: text(jsonField(item, 'title')),
      description: text(jsonField(item, 'description')),
      commonIssues: text(jsonField(item, 'commonIssues')),
      resolution: text(jsonField(item, 'resolution')),
      advisory: text(jsonField(item, 'advisory')),
      causes: Array.isArray(causes)
        ? causes.flatMap((c) => {
            if (typeof c === 'string') return readCause(c) ?? []
            if (c && typeof c === 'object' && 'label' in c) {
              const label = text((c as { label: unknown }).label)
              const likelihood = text((c as { likelihood?: unknown }).likelihood)?.toLowerCase()
              return label ? [{ label, ...(likelihood ? { likelihood } : {}) }] : []
            }
            return []
          })
        : typeof causes === 'string'
          ? readCauses(causes)
          : [],
    }
  })
  const meta = top as Record<string, unknown>
  return {
    rows,
    make: text(meta.make),
    language: text(meta.language ?? meta.lang),
    source: text(meta.source),
  }
}

/** The codes in a file, by its name and content; throws CodeFileError when it has none. */
export async function readCodeFile(buffer: Buffer, fileName: string): Promise<CodeFile> {
  if (buffer.length > MAX_CODE_IMPORT_BYTES) throw new CodeFileError('too_many')
  let file: CodeFile
  if (fileName.toLowerCase().endsWith('.json')) {
    file = fromJson(decodeText(buffer).text)
  } else {
    try {
      const sheet = await parseImportFile(buffer, fileName)
      file = { rows: fromSheet(sheet.columns, sheet.rows) }
    } catch (error) {
      if (error instanceof CodeFileError) throw error
      if (error instanceof ImportParseError) {
        if (error.code === 'empty') throw new CodeFileError('empty')
        if (error.code === 'legacy_xls') throw new CodeFileError('legacy_xls')
        if (error.code === 'too_many_rows') throw new CodeFileError('too_many')
        if (error.code === 'unsupported_format') throw new CodeFileError('format')
      }
      throw new CodeFileError('unreadable')
    }
  }
  if (file.rows.length === 0) throw new CodeFileError('empty')
  if (file.rows.length > MAX_CODE_IMPORT_ROWS) throw new CodeFileError('too_many')
  return file
}

/** The example rows, the same in the spreadsheet and the JSON the dialog offers. */
export const EXAMPLE_ROWS: CodeImportRow[] = [
  {
    code: 'P1000',
    title: 'OBD readiness tests not complete',
    description:
      'The engine computer has not finished its self tests since the fault memory was cleared or the battery was disconnected.',
    commonIssues:
      'Shows after a battery change or a cleared fault memory. It is not a fault in itself.',
    resolution:
      'Drive a full drive cycle: a cold start, idle, town driving and a steady motorway run. Read the codes again.',
    advisory: 'An inspection station may refuse the car until the readiness tests are complete.',
    causes: [
      { label: 'Battery disconnected or fault memory cleared', likelihood: 'high' },
      { label: 'A drive cycle not completed', likelihood: 'medium' },
    ],
  },
  {
    code: 'B1342',
    title: 'Engine computer reports an internal fault',
    causes: [{ label: 'Water in the engine computer', likelihood: 'low' }],
  },
]

/** The spreadsheet's headers, in the order of its columns. */
export const EXAMPLE_HEADERS = [
  'Code',
  'Title',
  'Description',
  'Common issues',
  'How to fix',
  'Good to know',
  'Causes',
] as const

export function exampleSheetRows(): string[][] {
  return EXAMPLE_ROWS.map((r) => [
    r.code,
    r.title ?? '',
    r.description ?? '',
    r.commonIssues ?? '',
    r.resolution ?? '',
    r.advisory ?? '',
    r.causes.map((c) => (c.likelihood ? `${c.label} (${c.likelihood})` : c.label)).join('\n'),
  ])
}

/** The example as JSON, every field named as people read it. */
export function exampleJson(): string {
  return `${JSON.stringify(
    {
      make: 'Ford',
      language: 'en',
      source: 'Where the codes come from: a link, or the name of a book or manual',
      codes: EXAMPLE_ROWS.map((r) => ({
        code: r.code,
        title: r.title,
        ...(r.description ? { description: r.description } : {}),
        ...(r.commonIssues ? { common_issues: r.commonIssues } : {}),
        ...(r.resolution ? { how_to_fix: r.resolution } : {}),
        ...(r.advisory ? { good_to_know: r.advisory } : {}),
        causes: r.causes,
      })),
    },
    null,
    2
  )}\n`
}
