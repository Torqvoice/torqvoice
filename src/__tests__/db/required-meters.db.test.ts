/**
 * Required meters on a real PostgreSQL (`npm run test:db` with
 * E2E_DATABASE_URL set): the queries the shared check rests on, which mocks
 * cannot prove. Which meters apply is what the work order shows: the
 * vehicle's own meters in use and those of the equipment the job works on;
 * a reading counts only when it is this job's and not marked wrong; a hidden
 * meter, another workshop's meter and an item the job does not work on are
 * never asked for.
 *
 * It makes one person and two workshops of its own and removes them again.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const url = process.env.E2E_DATABASE_URL ?? ''
const databaseName = url.split('/').pop()?.split('?')[0]?.toLowerCase() ?? ''
if (url && !/test|e2e/.test(databaseName)) {
  throw new Error(
    `Refusing to use database "${databaseName}": its name must say test or e2e, like the rest of this suite.`
  )
}
process.env.DATABASE_URL = url

// Meters and equipment are a custom-fields feature; these workshops have it.
vi.mock('@/lib/features', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/features')>()
  return { ...original, getFeatures: async () => ({ customFields: true }) }
})
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: { meters: string }) =>
    `${key}: ${values?.meters}`,
}))

const stamp = randomUUID().slice(0, 8)
let db: typeof import('@/lib/db')['db']
let check: typeof import('@/features/meters/Lib/requiredMeters.server')
let organizationId = ''
let otherOrganizationId = ''
let userId = ''
let vehicleId = ''
let jobId = ''
let ids: Record<string, string> = {}

const missing = async (occasion: 'complete' | 'payment' = 'complete') =>
  (await check.missingRequiredMeters(organizationId, jobId, occasion)).map((m) => m.name)

beforeAll(async () => {
  ;({ db } = await import('@/lib/db'))
  check = await import('@/features/meters/Lib/requiredMeters.server')
  userId = (
    await db.user.create({
      data: { name: `Required meters ${stamp}`, email: `required-meters-${stamp}@example.com` },
    })
  ).id
  organizationId = (await db.organization.create({ data: { name: `Required ${stamp}` } })).id
  otherOrganizationId = (await db.organization.create({ data: { name: `Other ${stamp}` } })).id
})

afterAll(async () => {
  await db.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } })
  await db.user.deleteMany({ where: { id: userId } })
})

beforeEach(async () => {
  for (const org of [organizationId, otherOrganizationId]) {
    await db.serviceRecord.deleteMany({ where: { organizationId: org } })
    await db.equipmentItem.deleteMany({ where: { organizationId: org } })
    await db.equipmentType.deleteMany({ where: { organizationId: org } })
    await db.meterType.deleteMany({ where: { organizationId: org } })
    await db.vehicle.deleteMany({ where: { organizationId: org } })
  }
  vehicleId = (
    await db.vehicle.create({
      data: { make: 'Scania', model: 'R 450', year: 2019, userId, organizationId },
    })
  ).id
  jobId = (
    await db.serviceRecord.create({
      data: {
        title: 'Service',
        status: 'in-progress',
        vehicleId,
        organizationId,
        serviceDate: new Date('2026-11-01T10:00:00Z'),
      },
    })
  ).id
  const type = (name: string, data: { required?: boolean; isActive?: boolean } = {}) =>
    db.meterType.create({ data: { name, unit: 'hrs', organizationId, ...data } })
  const pto = await type('PTO hours', { required: true })
  const engine = await type('Engine hours')
  const hidden = await type('Hidden hours', { required: true, isActive: false })
  const crane = await type('Crane hours', { required: true })
  const craneType = await db.equipmentType.create({ data: { name: 'Crane', organizationId } })
  const item = await db.equipmentItem.create({
    data: { typeId: craneType.id, vehicleId, make: 'HIAB', organizationId },
  })
  const fit = (meterTypeId: string, on: { vehicleId?: string; equipmentItemId?: string }) =>
    db.vehicleMeter.create({ data: { meterTypeId, organizationId, ...on } })
  const vmPto = await fit(pto.id, { vehicleId })
  await fit(engine.id, { vehicleId })
  await fit(hidden.id, { vehicleId })
  const vmCrane = await fit(crane.id, { equipmentItemId: item.id })
  ids = { pto: vmPto.id, crane: vmCrane.id, item: item.id }
})

describe('the meters a job is asked for', () => {
  it('are the vehicle’s own required meters in use, not a hidden one', async () => {
    expect(await missing()).toEqual(['PTO hours'])
  })

  it('take in an item’s meter only once the job works on the item', async () => {
    await db.serviceRecordEquipment.create({
      data: { serviceRecordId: jobId, itemId: ids.item, organizationId },
    })
    expect(await missing()).toEqual(['PTO hours', 'Crane hours'])
  })

  it('are no longer asked once the job has its own readings', async () => {
    await db.serviceRecordEquipment.create({
      data: { serviceRecordId: jobId, itemId: ids.item, organizationId },
    })
    await db.meterReading.createMany({
      data: [ids.pto, ids.crane].map((vehicleMeterId) => ({
        vehicleMeterId,
        serviceRecordId: jobId,
        value: '812.5',
        readAt: new Date('2026-11-01T10:00:00Z'),
        organizationId,
      })),
    })
    expect(await missing()).toEqual([])
  })

  it('still ask when the reading is the vehicle’s or another job’s, or marked wrong', async () => {
    await db.meterReading.create({
      data: {
        vehicleMeterId: ids.pto,
        value: '700',
        readAt: new Date('2026-10-01T10:00:00Z'),
        organizationId,
      },
    })
    expect(await missing()).toEqual(['PTO hours'])
    await db.meterReading.create({
      data: {
        vehicleMeterId: ids.pto,
        serviceRecordId: jobId,
        value: '812.5',
        readAt: new Date('2026-11-01T10:00:00Z'),
        wrongAt: new Date(),
        organizationId,
      },
    })
    expect(await missing()).toEqual(['PTO hours'])
  })

  it('are none for a job completed already, or once its invoice is out', async () => {
    await db.serviceRecord.update({ where: { id: jobId }, data: { status: 'completed' } })
    expect(await missing()).toEqual([])
    await db.serviceRecord.update({
      where: { id: jobId },
      data: { status: 'in-progress', issuedAt: new Date() },
    })
    expect(await missing('payment')).toEqual([])
    expect(await missing('complete')).toEqual(['PTO hours'])
  })

  it('are none for a job of another workshop asked about by id', async () => {
    expect(await check.missingRequiredMeters(otherOrganizationId, jobId, 'complete')).toEqual([])
  })

  it('are none for a workshop that requires nothing', async () => {
    await db.meterType.updateMany({ where: { organizationId }, data: { required: false } })
    expect(await missing()).toEqual([])
  })
})
