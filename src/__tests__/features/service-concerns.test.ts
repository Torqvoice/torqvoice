import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createServiceSchema, serviceConcernSchema } from '@/features/vehicles/Schema/serviceSchema'
import { BACKUP_ENTITIES } from '@/lib/backup/manifest'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

/**
 * What the customer asked about, kept apart from what the shop says, and kept
 * as rows rather than one note.
 *
 * The trade calls these the three Cs: concern, cause, correction. Only the
 * first belongs to the customer, and only the first is something they can
 * later dispute, which is why the shop cannot rewrite it from the app. Rows
 * rather than a blob because answering one concern and quietly dropping the
 * other is the most common reason a car comes back.
 */
describe('service concerns', () => {
  it('accepts a list of concerns, and the list is optional', () => {
    const base = { title: 'Brakes', vehicleId: 'v1' }
    expect(createServiceSchema.safeParse(base).success).toBe(true)

    const parsed = createServiceSchema.safeParse({
      ...base,
      concerns: [
        { description: 'Noise from the back when I brake', sortOrder: 0 },
        { description: 'Aircon smells', sortOrder: 1 },
      ],
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success ? parsed.data.concerns?.length : 0).toBe(2)
  })

  it('rejects an empty concern rather than storing a blank row', () => {
    expect(serviceConcernSchema.safeParse({ description: '' }).success).toBe(false)
  })

  it('carries an optional id, which is what keeps findings attached', () => {
    // Parts and labour are deleted and rewritten on every save. Concerns
    // cannot be, because VehicleFinding.concernId is SetNull: replacing the
    // list wholesale would cut every diagnosis loose from its question.
    const parsed = serviceConcernSchema.safeParse({ description: 'Pulls right', id: 'c1' })
    expect(parsed.success).toBe(true)
    expect(parsed.success ? parsed.data.id : null).toBe('c1')
  })

  it('reconciles concerns by id on update instead of replacing them', () => {
    const actions = read('src/features/vehicles/Actions/serviceActions.ts')
    // The guard rail for the bug above: if this ever becomes a deleteMany over
    // the whole job again, findings lose their concern on the next autosave.
    expect(actions).not.toMatch(/serviceConcern\.deleteMany\(\{\s*where:\s*\{\s*serviceRecordId/)
    expect(actions).toContain('serviceConcern.updateMany')
  })

  it('is exported and restored by backups', () => {
    // A nested entity missing from the manifest is one the restore drops
    // without a word, which is how clocked hours were lost once already.
    const entity = BACKUP_ENTITIES.find((e) => e.model === 'ServiceConcern')
    expect(entity, 'ServiceConcern must be in the backup manifest').toBeDefined()
    expect(entity?.nestedUnder).toBe('ServiceRecord')

    const exportRoute = read('src/app/api/protected/backup/export/route.ts')
    // Both paths: vehicle-linked jobs and counter sales.
    expect(exportRoute.match(/concerns: true/g)?.length).toBe(2)

    const importRoute = read('src/app/api/protected/backup/import/route.ts')
    expect(importRoute).toContain('serviceConcern.createMany')
  })

  it('restores concerns before the findings that point at them', () => {
    const importRoute = read('src/app/api/protected/backup/import/route.ts')
    const concerns = importRoute.indexOf('serviceConcern.createMany')
    const findings = importRoute.indexOf('vehicleFinding.createMany')
    expect(concerns).toBeGreaterThan(-1)
    if (findings > -1) expect(concerns).toBeLessThan(findings)
  })

  it('reaches the technician app with the findings against each one', () => {
    const route = read('src/app/api/v1/tech/jobs/[id]/route.ts')
    expect(route).toContain('concerns:')
    expect(route).toMatch(/concerns:[\s\S]{0,400}findings:/)
  })

  it('is not writable from the technician app', () => {
    // Read only there on purpose: the value of a concern is that it is the
    // customer's account and not the shop's, so a technician who could edit it
    // could make it agree with whatever they found.
    const techRoutes = [
      'jobs/[id]/notes',
      'jobs/[id]/labor',
      'jobs/[id]/status',
      'jobs/[id]/findings',
    ]
    for (const r of techRoutes) {
      const src = read(`src/app/api/v1/tech/${r}/route.ts`)
      expect(src, `${r} must not write concerns`).not.toMatch(/serviceConcern\s*\./)
    }
  })
})
