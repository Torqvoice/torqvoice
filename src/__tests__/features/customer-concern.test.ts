import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createServiceSchema } from '@/features/vehicles/Schema/serviceSchema'

/**
 * What the customer said at drop-off, kept apart from what the shop says.
 *
 * The trade calls these the three Cs: concern, cause, correction. Only the
 * first belongs to the customer, and only the first is something they can
 * later dispute, which is the whole reason it is not folded into a field the
 * shop rewrites.
 */
describe('customer concern', () => {
  it('is accepted on a service record, and is optional', () => {
    const base = { title: 'Brakes', vehicleId: 'v1' }
    expect(createServiceSchema.safeParse(base).success).toBe(true)

    const withConcern = createServiceSchema.safeParse({
      ...base,
      customerConcern: 'Noise from the back when I brake',
    })
    expect(withConcern.success).toBe(true)
    expect(withConcern.success ? withConcern.data.customerConcern : null).toBe(
      'Noise from the back when I brake'
    )
  })

  it('survives a backup restore', () => {
    // The export sends the whole row, but the import names every column, so a
    // field added to the schema and not to that list is dropped by every
    // restore without a word.
    const route = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/protected/backup/import/route.ts'),
      'utf-8'
    )
    expect(route).toContain('customerConcern')
  })

  it('reaches the technician app', () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/v1/tech/jobs/[id]/route.ts'),
      'utf-8'
    )
    expect(route).toContain('customerConcern: true')
  })

  it('is not writable from the technician app', () => {
    // Read only there on purpose: the value of the field is that it is the
    // customer's account and not the shop's, so a technician who could edit it
    // would be able to make it agree with what they found.
    const techRoutes = [
      'jobs/[id]/notes',
      'jobs/[id]/labor',
      'jobs/[id]/status',
      'jobs/[id]/findings',
    ]
    for (const r of techRoutes) {
      const src = fs.readFileSync(
        path.join(process.cwd(), `src/app/api/v1/tech/${r}/route.ts`),
        'utf-8'
      )
      expect(src, `${r} must not write customerConcern`).not.toMatch(/customerConcern\s*[:=]/)
    }
  })
})
