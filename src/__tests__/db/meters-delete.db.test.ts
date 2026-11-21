/**
 * Meters on a real PostgreSQL (`npm run test:db` with E2E_DATABASE_URL set):
 * what goes with what. Readings are kept apart from the odometer and from
 * custom field values, with foreign keys of their own, so the database does
 * the removing; this proves it does, on every path that deletes a vehicle,
 * a meter or a job.
 *
 * It makes one person and one workshop of its own and removes them again.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const url = process.env.E2E_DATABASE_URL ?? ''
const databaseName = url.split('/').pop()?.split('?')[0]?.toLowerCase() ?? ''
if (url && !/test|e2e/.test(databaseName)) {
  throw new Error(
    `Refusing to use database "${databaseName}": its name must say test or e2e, like the rest of this suite.`
  )
}
process.env.DATABASE_URL = url

const stamp = randomUUID().slice(0, 8)
let db: typeof import('@/lib/db')['db']
let organizationId = ''
let userId = ''

async function vehicleWithMeter(name: string) {
  const type = await db.meterType.create({
    data: { name: `${name} ${stamp}`, unit: 'hrs', organizationId },
  })
  const vehicle = await db.vehicle.create({
    data: { make: 'Volvo', model: 'FH', year: 2019, userId, organizationId },
  })
  const job = await db.serviceRecord.create({
    data: {
      title: 'Service',
      vehicleId: vehicle.id,
      organizationId,
      serviceDate: new Date('2026-11-01T10:00:00Z'),
    },
  })
  const meter = await db.vehicleMeter.create({
    data: { vehicleId: vehicle.id, meterTypeId: type.id, organizationId },
  })
  await db.meterReading.createMany({
    data: [
      { vehicleMeterId: meter.id, value: '4256.7', readAt: new Date('2026-10-01'), organizationId },
      {
        vehicleMeterId: meter.id,
        serviceRecordId: job.id,
        value: '4300.25',
        readAt: new Date('2026-11-01'),
        organizationId,
      },
    ],
  })
  return { type, vehicle, job, meter }
}

const readingsOf = (vehicleMeterId: string) =>
  db.meterReading.findMany({ where: { vehicleMeterId }, orderBy: { readAt: 'asc' } })

beforeAll(async () => {
  ;({ db } = await import('@/lib/db'))
  const user = await db.user.create({
    data: { name: `Meters ${stamp}`, email: `meters-${stamp}@example.com` },
  })
  userId = user.id
  organizationId = (await db.organization.create({ data: { name: `Meters ${stamp}` } })).id
})

afterAll(async () => {
  await db.organization.deleteMany({ where: { id: organizationId } })
  await db.user.deleteMany({ where: { id: userId } })
})

beforeEach(async () => {
  await db.meterType.deleteMany({ where: { organizationId } })
  await db.vehicle.deleteMany({ where: { organizationId } })
})

describe('meters on a real database', () => {
  it('keeps decimals as typed, to two places', async () => {
    const { meter } = await vehicleWithMeter('Engine hours')
    const values = (await readingsOf(meter.id)).map((r) => r.value.toString())
    expect(values).toEqual(['4256.7', '4300.25'])
  })

  it('removes a vehicle’s meters and readings with the vehicle, and nothing else', async () => {
    const kept = await vehicleWithMeter('Kept')
    const gone = await vehicleWithMeter('Gone')

    await db.vehicle.deleteMany({ where: { id: gone.vehicle.id, organizationId } })

    expect(await db.vehicleMeter.count({ where: { id: gone.meter.id } })).toBe(0)
    expect(await db.meterReading.count({ where: { vehicleMeterId: gone.meter.id } })).toBe(0)
    // The workshop's meter stays; the other vehicle keeps its readings.
    expect(await db.meterType.count({ where: { id: gone.type.id } })).toBe(1)
    expect(await readingsOf(kept.meter.id)).toHaveLength(2)
  })

  it('removes every vehicle’s meter and readings when the meter is deleted from the list', async () => {
    const { type, vehicle, meter } = await vehicleWithMeter('Deleted')

    await db.meterType.deleteMany({ where: { id: type.id, organizationId } })

    expect(await db.vehicleMeter.count({ where: { id: meter.id } })).toBe(0)
    expect(await db.meterReading.count({ where: { vehicleMeterId: meter.id } })).toBe(0)
    expect(await db.vehicle.count({ where: { id: vehicle.id } })).toBe(1)
  })

  it('keeps a job’s reading in the vehicle’s history when the job is deleted', async () => {
    const { job, meter } = await vehicleWithMeter('Job')

    await db.serviceRecord.deleteMany({ where: { id: job.id, organizationId } })

    const readings = await readingsOf(meter.id)
    expect(readings).toHaveLength(2)
    expect(readings.every((r) => r.serviceRecordId === null)).toBe(true)
  })

  it('takes one reading per meter per job', async () => {
    const { job, meter } = await vehicleWithMeter('Unique')
    await expect(
      db.meterReading.create({
        data: {
          vehicleMeterId: meter.id,
          serviceRecordId: job.id,
          value: '1',
          readAt: new Date(),
          organizationId,
        },
      })
    ).rejects.toThrow()
  })

  it('removes everything when the workshop goes', async () => {
    const { meter, type } = await vehicleWithMeter('Org')
    const other = await db.organization.create({ data: { name: `Meters other ${stamp}` } })
    const otherType = await db.meterType.create({
      data: { name: `Other ${stamp}`, unit: '', organizationId: other.id },
    })

    await db.organization.deleteMany({ where: { id: other.id } })

    expect(await db.meterType.count({ where: { id: otherType.id } })).toBe(0)
    // This workshop's are untouched.
    expect(await db.meterType.count({ where: { id: type.id } })).toBe(1)
    expect(await readingsOf(meter.id)).toHaveLength(2)
  })

  it('unlinks a job’s readings from the vehicle it left, and keeps them in that vehicle’s history', async () => {
    const { unlinkJobMeterReadingsFromOtherVehicles } = await import(
      '@/features/meters/Lib/jobMeterReading.server'
    )
    const a = await vehicleWithMeter('Move A')
    const b = await db.vehicle.create({
      data: { make: 'Scania', model: 'R 450', year: 2020, userId, organizationId },
    })

    await db.$transaction(async (tx) => {
      await tx.serviceRecord.updateMany({
        where: { id: a.job.id, organizationId },
        data: { vehicleId: b.id },
      })
      await unlinkJobMeterReadingsFromOtherVehicles(tx, {
        organizationId,
        jobId: a.job.id,
        vehicleId: b.id,
      })
    })

    const readings = await readingsOf(a.meter.id)
    expect(readings).toHaveLength(2)
    expect(readings.every((r) => r.serviceRecordId === null)).toBe(true)
  })
})
