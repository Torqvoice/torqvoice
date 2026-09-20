/**
 * @vitest-environment node
 *
 * What a restore writes has to be a column the model actually has.
 *
 * `restoreRows` takes an override object stamped onto every row: the
 * workshop, the importing user, the parent id. Prisma refuses an unknown
 * field outright, and a restore is one transaction, so a single wrong key
 * does not lose one table, it fails the whole import and rolls the workshop
 * back to nothing.
 *
 * Two of these were sitting in the route unnoticed, on vehicle findings and
 * recurring invoices, because neither was ever written into a backup: the
 * export did not carry them, so the code that reads them back never ran with
 * anything in it. Both are carried now, which is exactly when a wrong key
 * would have started failing real restores.
 *
 * This reads the route rather than running it: the mistake is visible in the
 * source, and a test that needed a database would not be run often enough to
 * catch it.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPrismaSchema } from '@/__tests__/stubs/prisma-schema'

const ROOT = process.cwd()
const source = fs.readFileSync(
  path.join(ROOT, 'src/app/api/protected/backup/import/route.ts'),
  'utf-8'
)
const schema = readPrismaSchema(ROOT)

/** The arguments of one call, split at top level so nested objects survive. */
function argumentsOf(call: string): string[] {
  const args: string[] = []
  let depth = 0
  let current = ''
  let quote = ''
  for (const char of call) {
    if (quote) {
      current += char
      if (char === quote) quote = ''
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      current += char
      continue
    }
    if ('([{'.includes(char)) depth++
    if (')]}'.includes(char)) {
      depth--
      // The closing bracket of the call itself.
      if (depth < 0) break
    }
    if (char === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) args.push(current.trim())
  return args
}

/** Every `restoreRows(...)` in the route, as model plus the keys it stamps on. */
function restoreCalls(): { model: string; keys: string[]; where: number }[] {
  const calls: { model: string; keys: string[]; where: number }[] = []
  // `await`, so the function's own definition is not read as a call.
  const marker = 'await restoreRows('
  for (let at = source.indexOf(marker); at !== -1; at = source.indexOf(marker, at + 1)) {
    const args = argumentsOf(source.slice(at + marker.length))
    const accessor = /tx\.(\w+)\.\w+/.exec(args[1] ?? '')
    expect(accessor, `restoreRows at ${at} writes through no tx accessor`).toBeTruthy()
    const model = (accessor as RegExpExecArray)[1]
    // The override is the fourth argument; the fifth names file columns and
    // is not written to the row.
    const override = args[3] ?? ''
    const keys = [...override.matchAll(/(?:^|[{,])\s*(\w+)\s*[:,}]/g)].map((m) => m[1])
    calls.push({ model, keys, where: source.slice(0, at).split('\n').length })
  }
  return calls
}

/** The scalar columns of a model, as the schema declares them. */
function columnsOf(model: string): Set<string> {
  const pascal = model.charAt(0).toUpperCase() + model.slice(1)
  const found = new RegExp(`^model ${pascal} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema)
  expect(found, `no model ${pascal} in the schema`).toBeTruthy()
  const columns = new Set<string>()
  for (const line of (found as RegExpExecArray)[1].split('\n')) {
    const field = /^\s{2}(\w+)\s+\w+/.exec(line)
    if (field) columns.add(field[1])
  }
  return columns
}

describe('what a restore stamps on every row', () => {
  const calls = restoreCalls()

  it('finds the restores in the route', () => {
    // Guards the guard: a parser that silently matched nothing would make
    // every assertion below pass.
    expect(calls.length).toBeGreaterThan(10)
    expect(calls.map((call) => call.model)).toContain('statusReport')
  })

  it('is a column the model has', () => {
    const wrong = calls.flatMap(({ model, keys, where }) => {
      const columns = columnsOf(model)
      return keys
        .filter((key) => !columns.has(key))
        .map((key) => `${model}.${key} (route line ${where})`)
    })

    expect(
      wrong,
      `Prisma refuses an unknown field, and takes the whole restore with it: ${wrong.join(', ')}`
    ).toEqual([])
  })

  it('stamps the workshop only where the row carries one', () => {
    // The reverse mistake: a row that has an organizationId and is restored
    // without one belongs to no workshop, and a query scoped by workshop
    // never finds it again.
    const missing = calls
      .filter(({ model }) => columnsOf(model).has('organizationId'))
      .filter(({ keys }) => !keys.includes('organizationId'))
      .map(({ model, where }) => `${model} (route line ${where})`)

    expect(
      missing,
      `Restored without a workshop, so nothing will find them: ${missing.join(', ')}`
    ).toEqual([])
  })
})
