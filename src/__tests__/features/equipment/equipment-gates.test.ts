/**
 * Equipment is opt-in twice over: the plan (custom fields) and the
 * workshop's first equipment type. These scan the source so a new reader or
 * writer cannot skip the gate: the tables are reached only through the
 * equipment feature (and the backup, deletes and the job move that must
 * carry or clean them), every reader starts from the workshop's types, and
 * every writer asks for the plan.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

/** Where equipment rows may be read or written. */
const ALLOWED = [
  'src/features/equipment/',
  // The backup carries everything, and a restore puts it back.
  'src/lib/backup/',
  // A job moved to another vehicle stops working on the old one's equipment.
  'src/features/vehicles/Actions/serviceActions.ts',
  // And so does a quote.
  'src/features/quotes/Actions/quoteActions.ts',
  // Deletes that must find an item's report file before the rows go.
  'src/lib/files/collect.ts',
  // Deleting a workshop's data: items before their types, which refuse to go first.
  'src/lib/delete-user-data.ts',
]

const TABLES =
  /\b(db|tx)\.(equipmentType|equipmentItem|equipmentFitting|serviceRecordEquipment|quoteEquipment)\b/

/** The body of an exported function, up to the next export. */
function bodyOf(source: string, start: number): string {
  const body = source.slice(start)
  const end = body.indexOf('\nexport ', 1)
  return body.slice(0, end > 0 ? end : undefined)
}

describe('the equipment tables', () => {
  it('are read and written only by equipment, the backup and the paths that clean up', () => {
    const offenders = sourceFiles('src')
      .filter((path) => !ALLOWED.some((allowed) => path.startsWith(allowed)))
      .filter((path) => TABLES.test(readFileSync(path, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('are only reached through readers that ask for the workshop’s types first', () => {
    const gate = readFileSync('src/features/equipment/Lib/equipmentGate.server.ts', 'utf8')
    // The plan is asked before any query on equipment.
    expect(gate).toMatch(
      /if \(!\(await getFeatures\(organizationId\)\)\.customFields\) return \[\]/
    )
    for (const file of [
      'src/features/equipment/Lib/equipment.server.ts',
      'src/features/equipment/Lib/equipmentPrint.server.ts',
    ]) {
      const source = readFileSync(file, 'utf8')
      for (const reader of source.matchAll(/export async function (\w+)/g)) {
        expect(bodyOf(source, reader.index), `${file} ${reader[1]}`).toMatch(/equipmentTypes\(/)
      }
    }
    const workOn = readFileSync('src/features/equipment/Lib/equipmentWorkOn.server.ts', 'utf8')
    for (const writer of workOn.matchAll(/export async function (\w+)/g)) {
      expect(bodyOf(workOn, writer.index), writer[1]).toMatch(/equipmentEnabled\(/)
    }
  })

  it('take no change on a plan without custom fields', () => {
    const dir = 'src/features/equipment/Actions'
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8')
      for (const action of source.matchAll(/export async function (\w+)/g)) {
        const name = action[1]
        // Reading is left open after a downgrade: the data is hidden, and kept.
        if (/^get/.test(name)) continue
        expect(bodyOf(source, action.index), `${file} ${name}`).toContain(
          "requireFeature(organizationId, 'customFields')"
        )
      }
    }
  })

  it('are written only from an upload this workshop made for equipment', () => {
    const route = readFileSync('src/app/api/protected/upload/equipment-report/route.ts', 'utf8')
    expect(route).toMatch(/equipmentEnabled\(ctx\.organizationId\)/)
    expect(route).toMatch(/PermissionSubject\.VEHICLES/)
  })
})
