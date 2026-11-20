/**
 * @vitest-environment node
 *
 * Where meters may be read. Every page, document, share link, portal page,
 * app response and AI context reaches them through the helpers in
 * `features/meters/Lib/meters.server.ts`, which answer nothing for a workshop
 * that has defined no meter or whose plan has no custom fields. A new place
 * that queried the tables itself would skip that, so it fails here instead.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === '__tests__' || name === 'generated' || name === 'node_modules') return []
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

/**
 * The meters feature itself, equipment (whose items have their own meters,
 * gated by both lists) and the backup, which carries everything.
 */
const ALLOWED = [
  'src/features/meters/',
  'src/features/equipment/',
  'src/lib/backup/build-data.ts',
  'src/lib/backup/import.ts',
  // The fleet setup checklist counts the meters to say whether the step is
  // on, behind the same plan check.
  'src/features/setup/Lib/heavyVehicleSetup.server.ts',
]

describe('the meter tables', () => {
  it('are read and written only by the meters feature and the backup', () => {
    const offenders = sourceFiles('src')
      .filter((path) => !ALLOWED.some((allowed) => path.startsWith(allowed)))
      .filter((path) =>
        /\b(db|tx)\.(meterType|vehicleMeter|meterReading)\b/.test(readFileSync(path, 'utf8'))
      )
    expect(offenders).toEqual([])
  })

  it('are only reached through helpers that ask the plan first', () => {
    const helpers = readFileSync('src/features/meters/Lib/meters.server.ts', 'utf8')
    // Every exported reader starts from the workshop's meters in use.
    for (const name of [
      'vehicleMeterViews',
      'jobMeterViews',
      'printableMeterReadings',
      'metersEnabled',
      'equipmentMeterViews',
    ]) {
      const body = helpers.slice(helpers.indexOf(`export async function ${name}`))
      const end = body.indexOf('\nexport ', 1)
      expect(body.slice(0, end > 0 ? end : undefined), name).toMatch(
        /activeMeterTypes|vehicleMeterViews/
      )
    }
    expect(helpers).toMatch(
      /if \(!\(await getFeatures\(organizationId\)\)\.customFields\) return \[\]/
    )
  })

  it('take no new reading on a plan without custom fields', () => {
    for (const file of ['jobMeterActions.ts', 'vehicleMeterActions.ts', 'meterTypeActions.ts']) {
      const source = readFileSync(`src/features/meters/Actions/${file}`, 'utf8')
      for (const action of source.matchAll(/export async function (\w+)/g)) {
        const name = action[1]
        // Only reading is left open after a downgrade: taking a meter off or
        // deleting one would destroy what the downgrade keeps.
        if (/^get/.test(name)) continue
        const body = source.slice(action.index)
        const end = body.indexOf('\nexport ', 1)
        expect(body.slice(0, end > 0 ? end : undefined), `${file} ${name}`).toContain(
          "requireFeature(organizationId, 'customFields')"
        )
      }
    }
  })

  it('are no longer a job’s when the job moves to another vehicle, in the same save', () => {
    const source = readFileSync('src/features/vehicles/Actions/serviceActions.ts', 'utf8')
    const move = source.slice(source.indexOf('if (!sameVehicle && vehicleBefore) {'))
    expect(move.slice(0, move.indexOf('\n        }\n'))).toContain(
      'unlinkJobMeterReadingsFromOtherVehicles(tx'
    )
  })

  it('keep the date they count at when their job or its vehicle is deleted', () => {
    const job = readFileSync('src/features/vehicles/Actions/serviceActions.ts', 'utf8')
    const remove = job.slice(job.indexOf('export async function deleteServiceRecord'))
    expect(remove.indexOf('unlinkMeterReadingsOfDeletedJobs(tx')).toBeGreaterThan(-1)
    expect(remove.indexOf('unlinkMeterReadingsOfDeletedJobs(tx')).toBeLessThan(
      remove.indexOf('tx.serviceRecord.delete(')
    )
    for (const file of [
      'src/features/vehicles/Actions/deleteVehicle.ts',
      'src/features/vehicles/Actions/vehicleActions.ts',
    ]) {
      const source = readFileSync(file, 'utf8')
      const at = source.indexOf('unlinkMeterReadingsOfDeletedJobs(tx')
      expect(at, file).toBeGreaterThan(-1)
      expect(at, file).toBeLessThan(source.indexOf('tx.vehicle.deleteMany(', at - 400) + 1000)
    }
  })
})
