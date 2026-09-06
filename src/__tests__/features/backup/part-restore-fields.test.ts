import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPrismaSchema } from '@/__tests__/stubs/prisma-schema'

/**
 * Restore completeness for part lines.
 *
 * The import route rebuilds ServicePart and QuotePart rows through explicit
 * field maps. A column added to the schema but not to the map is dropped
 * silently on restore, and the loss only surfaces later — zeroed profit
 * reports, dead inventory links. Like the tire hotel coverage test, this
 * reads the route source and the schema rather than running the route: the
 * failure being guarded against is "someone forgot a field", which is visible
 * in the source.
 */

const ROOT = process.cwd()
const importSource = fs.readFileSync(
  path.join(ROOT, 'src/app/api/protected/backup/import/route.ts'),
  'utf-8'
)
const schema = readPrismaSchema(ROOT)

/** Scalar (persisted, non-relation) columns of a model, from the schema. */
function scalarColumns(model: string): string[] {
  const match = schema.match(new RegExp(`^model\\s+${model}\\s*\\{([\\s\\S]*?)^\\}`, 'm'))
  expect(match, `model ${model} not found in schema`).toBeTruthy()
  const columns: string[] = []
  for (const line of match![1].split('\n')) {
    const field = line.match(/^\s{2}(\w+)\s+(String|Int|Float|Boolean|DateTime|Json)(\?|\[\])?/)
    if (field) columns.push(field[1])
  }
  expect(columns.length).toBeGreaterThan(0)
  return columns
}

/** The restore map for one model — the createMany call and its data mapper. */
function restoreMap(delegate: string): string {
  const marker = `tx.${delegate}.createMany`
  const start = importSource.indexOf(marker)
  expect(start, `${marker} not found in import route`).toBeGreaterThan(-1)
  // One restore site per model; a second one would need its own coverage.
  expect(importSource.indexOf(marker, start + 1)).toBe(-1)
  return importSource.slice(start, start + 1500)
}

describe.each([
  { model: 'ServicePart', delegate: 'servicePart' },
  { model: 'QuotePart', delegate: 'quotePart' },
])('$model restore', ({ model, delegate }) => {
  it('carries every schema column, so nothing is dropped on restore', () => {
    const map = restoreMap(delegate)
    for (const column of scalarColumns(model)) {
      expect(map, `${model}.${column} is lost by the ${delegate} restore map`).toMatch(
        new RegExp(`\\b${column}:`)
      )
    }
  })
})

describe('restore ordering', () => {
  it('restores inventory parts before the lines that reference them', () => {
    // inventoryPartId is restored verbatim, which is only honest if the
    // inventory rows (with their preserved ids) already exist by then.
    // Service parts restore inside the importServiceRecordTree helper, so the
    // execution order is the order of the call sites, not of the definitions.
    const inventory = importSource.indexOf('tx.inventoryPart.createMany')
    const firstTreeCall = importSource.indexOf('await importServiceRecordTree(')
    expect(inventory).toBeGreaterThan(-1)
    expect(firstTreeCall).toBeGreaterThan(-1)
    expect(inventory).toBeLessThan(firstTreeCall)
    expect(inventory).toBeLessThan(importSource.indexOf('tx.quotePart.createMany'))
  })
})
