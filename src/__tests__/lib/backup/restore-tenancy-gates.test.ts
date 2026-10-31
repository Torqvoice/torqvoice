/**
 * @vitest-environment node
 *
 * A tripwire on the restore's source, in the manner of security-gates: every
 * write the import core makes has to name the restoring organisation. A
 * delete, update or upsert without it in its where, or a create for a model
 * with an organisation column that does not stamp it, fails this test before
 * it can reach a database. The runtime guard (tenant-guard.ts) catches the
 * same thing in production; this catches it at review.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TENANCY_SCHEMA } from '@/lib/backup/tenancy-schema'

const source = fs.readFileSync(path.join(process.cwd(), 'src/lib/backup/import.ts'), 'utf-8')

/** Where a line or block comment starting at `i` ends, or null when none starts there. */
function commentEnd(text: string, i: number): number | null {
  if (text.startsWith('//', i)) {
    const end = text.indexOf('\n', i)
    return end < 0 ? text.length : end
  }
  if (text.startsWith('/*', i)) {
    const end = text.indexOf('*/', i + 2)
    return end < 0 ? text.length : end + 2
  }
  return null
}

/** The text between the opening bracket at `from` and its closing one. */
function balanced(text: string, from: number): string {
  let depth = 0
  let quote = ''
  for (let i = from; i < text.length; i++) {
    const char = text[i]
    if (quote) {
      if (char === '\\') i++
      else if (char === quote) quote = ''
      continue
    }
    const skip = commentEnd(text, i)
    if (skip !== null) {
      i = skip - 1
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if ('([{'.includes(char)) depth++
    if (')]}'.includes(char)) {
      depth--
      if (depth === 0) return text.slice(from + 1, i)
    }
  }
  throw new Error('unbalanced')
}

interface Write {
  model: string
  operation: string
  args: string
  /** The override object of the restoreRows call the write sits in, if any. */
  override: string | null
  line: number
}

function writes(): Write[] {
  const out: Write[] = []
  const pattern =
    /tx\.(\w+)\.(create|createMany|createManyAndReturn|delete|deleteMany|update|updateMany|upsert)\(/g
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0
    const args = balanced(source, index + match[0].length - 1)
    // Inside `restoreRows('what', (rows) => tx.model.createMany({ data: rows }), rows, override)`.
    let override: string | null = null
    const before = source.slice(0, index)
    const call = before.lastIndexOf('restoreRows(')
    if (call >= 0) {
      const callArgs = balanced(source, call + 'restoreRows'.length)
      const end = call + 'restoreRows('.length + callArgs.length
      if (end > index) {
        const parts = splitArguments(callArgs)
        override = parts[3] ?? null
      }
    }
    const model = match[1].charAt(0).toUpperCase() + match[1].slice(1)
    out.push({
      model,
      operation: match[2],
      args,
      override,
      line: before.split('\n').length,
    })
  }
  return out
}

/** Top-level arguments of a call, split at commas outside brackets and strings. */
function splitArguments(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let current = ''
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quote) {
      current += char
      if (char === '\\') {
        current += text[++i]
        continue
      }
      if (char === quote) quote = ''
      continue
    }
    const skip = commentEnd(text, i)
    if (skip !== null) {
      current += text.slice(i, skip)
      i = skip - 1
      continue
    }
    if (char === "'" || char === '"' || char === '`') quote = char
    if ('([{'.includes(char)) depth++
    if (')]}'.includes(char)) depth--
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

const STAMPED = /\borganizationId\b/

describe('the restore core only writes its own workshop', () => {
  const all = writes()

  it('finds the writes', () => {
    expect(all.length).toBeGreaterThan(50)
    expect(
      all.every((w) => w.model in TENANCY_SCHEMA),
      'every model is in the schema'
    ).toBe(true)
  })

  it('names the organisation in every delete, update and upsert', () => {
    const offenders = all
      .filter((w) =>
        ['delete', 'deleteMany', 'update', 'updateMany', 'upsert'].includes(w.operation)
      )
      .filter((w) => !/where:\s*\{[\s\S]*?\borganizationId\b/.test(w.args))
      .map((w) => `${w.model}.${w.operation} at line ${w.line}`)
    expect(offenders).toEqual([])
  })

  it('stamps the organisation on every create for a model that has the column', () => {
    const offenders = all
      .filter((w) => w.operation.startsWith('create'))
      .filter((w) => TENANCY_SCHEMA[w.model]?.organizationId)
      .filter((w) => !(STAMPED.test(w.args) || (w.override !== null && STAMPED.test(w.override))))
      .map((w) => `${w.model}.${w.operation} at line ${w.line}`)
    expect(offenders).toEqual([])
  })

  it('does not stamp anything but the restoring organisation', () => {
    // The only organisation the file ever names is the one being restored.
    const foreign = [
      ...source.matchAll(
        /organizationId:\s*(?!ctx\.organizationId\b|organizationId\b|opts\.organizationId\b|files\.organizationId\b|string\b)(\S+)/g
      ),
    ]
      .map((m) => m[1])
      .filter((v) => !/^(string|boolean)$/.test(v))
    expect(foreign).toEqual([])
  })

  it('wraps the transaction in the tenant guard and runs the tenancy checks first', () => {
    expect(source).toMatch(/const tx = tenantScoped\(raw, ctx\.organizationId\)/)
    const guard = source.indexOf('tenantScoped(raw')
    const refuse = source.indexOf('await assertNoForeignRows(')
    const clean = source.indexOf('sanitiseForeignIds(')
    const firstDelete = source.indexOf('.deleteMany(')
    expect(guard).toBeGreaterThan(-1)
    expect(refuse).toBeGreaterThan(guard)
    expect(clean).toBeGreaterThan(refuse)
    expect(firstDelete).toBeGreaterThan(clean)
  })

  it('never skips a duplicate quietly', () => {
    expect(source).not.toContain('skipDuplicates')
  })

  it('takes the restore lock and gives the transaction the time a restore needs', () => {
    expect(source).toMatch(/acquireRestoreLock\(lock\)/)
    expect(source).toMatch(/releaseRestoreLock\(lock\)/)
    expect(source).toMatch(/timeout: TRANSACTION_TIMEOUT_MS/)
  })
})
