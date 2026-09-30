import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A vehicle's own details survive a restore.
 *
 * The export writes whole vehicle rows, but the import rebuilds each one
 * through an explicit field map, and the engine code, the body type the
 * condition map draws and the German type key were all missing from it: a
 * restored workshop lost them without a word.
 */

const importSource = fs.readFileSync(
  path.join(process.cwd(), 'src/app/api/protected/backup/import/route.ts'),
  'utf-8'
)

function vehicleRestoreMap(): string {
  const start = importSource.indexOf('tx.vehicle.create(')
  expect(start, 'tx.vehicle.create( not found in import route').toBeGreaterThan(-1)
  return importSource.slice(start, start + 2500)
}

describe('vehicle restore', () => {
  it.each(['engineCode', 'bodyType', 'hsn', 'tsn'])('carries %s', (column) => {
    expect(vehicleRestoreMap()).toMatch(new RegExp(`\\b${column}: \\(v\\.${column} as string\\)`))
  })
})
