import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Backup coverage for the tire hotel.
 *
 * A curated export fails silently: a model nobody remembered to add is simply
 * absent from the file, and the loss is only discovered on the restore that
 * was supposed to save someone. These read the route source rather than
 * running it, which is enough to catch the thing that actually goes wrong,
 * namely a model being added to the schema and not to the backup.
 */

const ROOT = process.cwd()
const exportSource = fs.readFileSync(
  path.join(ROOT, 'src/app/api/protected/backup/export/route.ts'),
  'utf-8'
)
const importSource = fs.readFileSync(
  path.join(ROOT, 'src/app/api/protected/backup/import/route.ts'),
  'utf-8'
)
const schema = fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf-8')

/** Every tire hotel model the schema declares. */
function tireModels(): string[] {
  return [...schema.matchAll(/^model\s+(Tire\w+)\s*\{/gm)].map((m) => m[1])
}

describe('tire hotel models', () => {
  it('are all known to this test', () => {
    // Guards the guard: a new Tire* model shows up here first.
    expect(tireModels().sort()).toEqual([
      'TireLocation',
      'TireMeasurement',
      'TireMovement',
      'TireSet',
      'TireSetAttachment',
      'TireTreatment',
      'TireWarehouse',
    ])
  })
})

describe('export', () => {
  it('offers tire hotel as a selectable section', () => {
    expect(exportSource).toContain('tireHotel: boolean')
    expect(exportSource).toMatch(/tireHotel:\s*true/)
  })

  it('reads the two root models', () => {
    // Everything else hangs off a warehouse or a set.
    expect(exportSource).toContain('db.tireWarehouse')
    expect(exportSource).toContain('db.tireSet')
  })

  it('pulls the shelves with their warehouse', () => {
    // Sets reference a location id, so exporting sets without shelves would
    // restore tires with nowhere to sit.
    expect(exportSource).toMatch(/tireWarehouse[\s\S]{0,200}locations:\s*true/)
  })

  it.each(['measurements', 'movements', 'treatments'])('pulls %s with the set', (relation) => {
    expect(exportSource).toMatch(new RegExp(`db\\.tireSet[\\s\\S]{0,400}${relation}`))
  })
})

describe('import', () => {
  it.each([
    'tx.tireWarehouse',
    'tx.tireLocation',
    'tx.tireSet',
    'tx.tireMeasurement',
    'tx.tireMovement',
    'tx.tireTreatment',
    'tx.tireSetAttachment',
  ])('restores through %s', (call) => {
    expect(importSource).toContain(call)
  })

  it('reads back exactly what the export writes', () => {
    // The two sides agree on the key names or the data lands nowhere.
    for (const key of ['tireWarehouses', 'tireSets']) {
      expect(exportSource, `export never sets data.${key}`).toContain(`data.${key} =`)
      expect(importSource, `import never reads data.${key}`).toContain(`data.${key}`)
    }
  })
})
