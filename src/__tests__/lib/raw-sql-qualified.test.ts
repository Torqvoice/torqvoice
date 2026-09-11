import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The AI sandbox creates temporary views named after real tables, and
 * pg_temp is searched before public. Should such a view ever outlive its
 * transaction on a pooled connection, an unqualified `FROM "vehicles"`
 * elsewhere in the app would read the previous workshop's view, and an
 * unqualified UPDATE would quietly touch zero rows. Every raw query therefore
 * names its schema: "public"."table".
 *
 * This walks the source for raw SQL templates and fails on the first table
 * reference that does not.
 */

const SRC = 'src'
const SKIP_DIRS = new Set(['__tests__', 'generated'])

// Where a raw SQL template literal starts. The opening backtick is the last
// character of the match.
const TEMPLATE_START =
  /\$(?:queryRaw|executeRaw)(?:Unsafe)?(?:<[^`]*?>)?\s*(?:`|\(\s*`|\(\s*Prisma\.sql`)|Prisma\.sql`/g

// A table reference: FROM, JOIN, UPDATE or INTO followed by a name. Group 1
// is the keyword, group 2 the raw name as written (quoted or bare).
const TABLE_REF = /\b(FROM|JOIN|UPDATE|INTO)\s+("[^"]+"|[A-Za-z_][A-Za-z0-9_]*)/gi

// Names that are not tables: a schema qualifier, a placeholder for an
// interpolated fragment, or the keywords that can follow the clause word.
const NOT_A_TABLE = new Set(['public', 'pg_temp', 'only', 'lateral', 'select', 'values'])

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

/**
 * Returns the body of the template literal whose opening backtick sits at
 * `open`, with every `${...}` expression replaced by a placeholder. Nested
 * template literals inside expressions are skipped over correctly.
 */
function templateBody(source: string, open: number): string {
  let i = open + 1
  let body = ''
  while (i < source.length) {
    const ch = source[i]
    if (ch === '\\') {
      body += source.slice(i, i + 2)
      i += 2
      continue
    }
    if (ch === '`') return body
    if (ch === '$' && source[i + 1] === '{') {
      i = skipExpression(source, i + 2)
      body += ' __EXPR__ '
      continue
    }
    body += ch
    i++
  }
  throw new Error('Unterminated template literal')
}

/** Index just past the `}` that closes an expression starting at `from`. */
function skipExpression(source: string, from: number): number {
  let depth = 1
  let i = from
  while (i < source.length) {
    const ch = source[i]
    if (ch === '`') {
      // Nested template: walk it the same way to find its end.
      i = templateEnd(source, i)
      continue
    }
    if (ch === "'" || ch === '"') {
      i = source.indexOf(ch, i + 1) + 1
      if (i === 0) throw new Error('Unterminated string in template expression')
      continue
    }
    if (ch === '{') depth++
    if (ch === '}' && --depth === 0) return i + 1
    i++
  }
  throw new Error('Unterminated template expression')
}

function templateEnd(source: string, open: number): number {
  let i = open + 1
  while (i < source.length) {
    const ch = source[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '`') return i + 1
    if (ch === '$' && source[i + 1] === '{') {
      i = skipExpression(source, i + 2)
      continue
    }
    i++
  }
  throw new Error('Unterminated nested template literal')
}

/** Names declared as CTEs (or windows) in this template: `name AS (`. */
function localNames(sql: string): Set<string> {
  const names = new Set<string>()
  for (const m of sql.matchAll(/("[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\s*(?:\([^)]*\))?\s+AS\s*\(/gi)) {
    names.add(m[1].replace(/"/g, '').toLowerCase())
  }
  return names
}

/** FROM inside EXTRACT(... FROM x), SUBSTRING, TRIM, or IS DISTINCT FROM. */
function isExpressionFrom(sql: string, index: number): boolean {
  const before = sql.slice(0, index)
  return (
    /\b(EXTRACT|SUBSTRING|TRIM|OVERLAY)\s*\([^()]*$/i.test(before) || /\bDISTINCT\s*$/i.test(before)
  )
}

function unqualifiedReferences(sql: string): string[] {
  const local = localNames(sql)
  const found: string[] = []
  for (const m of sql.matchAll(TABLE_REF)) {
    const name = m[2].replace(/"/g, '')
    const lower = name.toLowerCase()
    if (NOT_A_TABLE.has(lower) || lower === '__expr__' || local.has(lower)) continue
    if (m[1].toUpperCase() === 'FROM' && isExpressionFrom(sql, m.index ?? 0)) continue
    found.push(m[0].replace(/\s+/g, ' '))
  }
  return found
}

describe('raw SQL', () => {
  it('names the schema on every table it touches', () => {
    const failures: string[] = []

    for (const file of sourceFiles(SRC)) {
      const source = fs.readFileSync(file, 'utf-8')
      if (!/\$(?:queryRaw|executeRaw)|Prisma\.sql`/.test(source)) continue
      for (const start of source.matchAll(TEMPLATE_START)) {
        const open = (start.index ?? 0) + start[0].length - 1
        const sql = templateBody(source, open)
        for (const ref of unqualifiedReferences(sql)) {
          const line = source.slice(0, open).split('\n').length
          failures.push(`${file}:${line}  ${ref}  (write it as "public"."table")`)
        }
      }
    }

    expect(failures).toEqual([])
  })

  it('catches an unqualified name and accepts a qualified one', () => {
    expect(unqualifiedReferences('SELECT * FROM vehicles v')).toEqual(['FROM vehicles'])
    expect(unqualifiedReferences('SELECT * FROM "vehicles" v')).toEqual(['FROM "vehicles"'])
    expect(unqualifiedReferences('UPDATE "inventory_parts" SET x = 1')).toEqual([
      'UPDATE "inventory_parts"',
    ])
    expect(unqualifiedReferences('SELECT * FROM "public"."vehicles" v')).toEqual([])
    expect(unqualifiedReferences('SELECT * FROM public.vehicles v')).toEqual([])
    expect(unqualifiedReferences('WITH t AS (SELECT 1) SELECT * FROM t')).toEqual([])
    expect(unqualifiedReferences('SELECT * FROM (SELECT 1) sub')).toEqual([])
    expect(
      unqualifiedReferences('SELECT EXTRACT(YEAR FROM "serviceDate") FROM "public"."x"')
    ).toEqual([])
  })
})
