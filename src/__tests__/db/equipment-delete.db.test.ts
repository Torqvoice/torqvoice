/**
 * Equipment on a real PostgreSQL (`npm run test:db`): what goes with what.
 * An item belongs to its vehicle and goes with it, report file and all; its
 * kind cannot be deleted from under it; a job that worked on it can go
 * without taking it; and a whole workshop can be deleted with equipment in it.
 *
 * It makes one person and one workshop of its own and removes them again.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const url = process.env.E2E_DATABASE_URL ?? ''
const databaseName = url.split('/').pop()?.split('?')[0]?.toLowerCase() ?? ''
if (url && !/test|e2e/.test(databaseName)) {
  throw new Error(
    `Refusing to use database "${databaseName}": its name must say test or e2e, like the rest of this suite.`
  )
}
process.env.DATABASE_URL = url
const dataRoot = mkdtempSync(path.join(process.env.TMPDIR || tmpdir(), 'equipment-delete-'))
process.env.DATA_ROOT = dataRoot

const stamp = randomUUID().slice(0, 8)
let db: typeof import('@/lib/db')['db']
let organizationId = ''
let userId = ''

const reportPath = (orgId: string, name: string) =>
  path.join(dataRoot, 'uploads', orgId, 'vehicles', name)

/** A truck with a crane on it, its report on disk, a job on the crane and its hour meter. */
async function truckWithCrane(orgId = organizationId) {
  const vehicle = await db.vehicle.create({
    data: { make: 'Volvo', model: 'FH', year: 2019, userId, organizationId: orgId },
  })
  const type = await db.equipmentType.create({
    data: { name: `Crane ${randomUUID().slice(0, 6)}`, organizationId: orgId },
  })
  const name = `${randomUUID()}.pdf`
  mkdirSync(path.dirname(reportPath(orgId, name)), { recursive: true })
  writeFileSync(reportPath(orgId, name), 'report')
  const item = await db.equipmentItem.create({
    data: {
      make: 'Hiab',
      reportFileUrl: `/api/protected/files/${orgId}/vehicles/${name}`,
      reportFileName: 'Examination.pdf',
      typeId: type.id,
      vehicleId: vehicle.id,
      organizationId: orgId,
    },
  })
  await db.equipmentFitting.create({
    data: { itemId: item.id, vehicleId: vehicle.id, organizationId: orgId },
  })
  const job = await db.serviceRecord.create({
    data: {
      title: 'Crane service',
      vehicleId: vehicle.id,
      organizationId: orgId,
      serviceDate: new Date('2026-11-01'),
    },
  })
  await db.serviceRecordEquipment.create({
    data: { serviceRecordId: job.id, itemId: item.id, organizationId: orgId },
  })
  const hours = await db.meterType.create({
    data: { name: `Crane hours ${randomUUID().slice(0, 6)}`, unit: 'hrs', organizationId: orgId },
  })
  const meter = await db.vehicleMeter.create({
    data: { equipmentItemId: item.id, meterTypeId: hours.id, organizationId: orgId },
  })
  await db.meterReading.create({
    data: {
      vehicleMeterId: meter.id,
      value: '812.5',
      readAt: new Date('2026-10-01'),
      organizationId: orgId,
    },
  })
  return { vehicle, type, item, job, meter, hours, reportName: name }
}

beforeAll(async () => {
  ;({ db } = await import('@/lib/db'))
  const user = await db.user.create({
    data: { name: `Equipment ${stamp}`, email: `equipment-${stamp}@example.com` },
  })
  userId = user.id
  organizationId = (await db.organization.create({ data: { name: `Equipment ${stamp}` } })).id
})

afterAll(async () => {
  await db.equipmentItem.deleteMany({ where: { organizationId } })
  await db.organization.deleteMany({ where: { id: organizationId } })
  await db.user.deleteMany({ where: { id: userId } })
})

beforeEach(async () => {
  await db.equipmentItem.deleteMany({ where: { organizationId } })
  await db.equipmentType.deleteMany({ where: { organizationId } })
  await db.meterType.deleteMany({ where: { organizationId } })
  await db.vehicle.deleteMany({ where: { organizationId } })
})

describe('equipment on a real database', () => {
  it('goes with its vehicle, and the vehicle delete lets go of its report file', async () => {
    const { vehicleFileUrls } = await import('@/lib/files/collect')
    const { releaseFiles } = await import('@/lib/files/manager')
    const crane = await truckWithCrane()

    // What the vehicle delete actions do: collect, delete, release.
    const files = await vehicleFileUrls(organizationId, [crane.vehicle.id])
    expect(files).toContain(crane.item.reportFileUrl)
    await db.vehicle.deleteMany({ where: { id: crane.vehicle.id, organizationId } })
    const released = await releaseFiles(files, { organizationId, reason: 'vehicle deleted' })

    expect(released.removed).toContain(crane.item.reportFileUrl)
    expect(existsSync(reportPath(organizationId, crane.reportName))).toBe(false)
    expect(await db.equipmentItem.count({ where: { id: crane.item.id } })).toBe(0)
    expect(await db.equipmentFitting.count({ where: { itemId: crane.item.id } })).toBe(0)
    expect(await db.serviceRecordEquipment.count({ where: { itemId: crane.item.id } })).toBe(0)
    expect(await db.vehicleMeter.count({ where: { id: crane.meter.id } })).toBe(0)
    expect(await db.meterReading.count({ where: { vehicleMeterId: crane.meter.id } })).toBe(0)
    // The kind stays, for the next item.
    expect(await db.equipmentType.count({ where: { id: crane.type.id } })).toBe(1)
  })

  it('keeps a report file while an item still points at it', async () => {
    const { releaseFiles } = await import('@/lib/files/manager')
    const crane = await truckWithCrane()
    const released = await releaseFiles([crane.item.reportFileUrl], {
      organizationId,
      reason: 'test',
    })
    expect(released.kept).toEqual([crane.item.reportFileUrl])
    expect(existsSync(reportPath(organizationId, crane.reportName))).toBe(true)
  })

  it('refuses to delete a kind that still has items', async () => {
    const crane = await truckWithCrane()
    await expect(
      db.equipmentType.deleteMany({ where: { id: crane.type.id, organizationId } })
    ).rejects.toThrow()
    expect(await db.equipmentItem.count({ where: { id: crane.item.id } })).toBe(1)
  })

  it('leaves the item when a job that worked on it is deleted', async () => {
    const crane = await truckWithCrane()
    await db.serviceRecord.deleteMany({ where: { id: crane.job.id, organizationId } })
    expect(await db.equipmentItem.count({ where: { id: crane.item.id } })).toBe(1)
    expect(await db.serviceRecordEquipment.count({ where: { itemId: crane.item.id } })).toBe(0)
    expect(await db.meterReading.count({ where: { vehicleMeterId: crane.meter.id } })).toBe(1)
  })

  it('takes an item’s meters, not the item, when their meter is deleted', async () => {
    const crane = await truckWithCrane()
    await db.meterType.deleteMany({ where: { id: crane.hours.id, organizationId } })
    expect(await db.equipmentItem.count({ where: { id: crane.item.id } })).toBe(1)
    expect(await db.vehicleMeter.count({ where: { id: crane.meter.id } })).toBe(0)
  })

  it('takes every item away with the vehicles when all of them are deleted', async () => {
    const crane = await truckWithCrane()
    await db.vehicle.deleteMany({ where: { organizationId } })
    expect(await db.equipmentItem.count({ where: { organizationId } })).toBe(0)
    // With the items gone the kinds can go too.
    await db.equipmentType.deleteMany({ where: { organizationId } })
    expect(await db.equipmentType.count({ where: { id: crane.type.id } })).toBe(0)
  })

  it('deletes a whole workshop with equipment in it', async () => {
    const { deleteOrganizationWithData } = await import('@/lib/delete-user-data')
    const other = (await db.organization.create({ data: { name: `Equipment gone ${stamp}` } })).id
    const crane = await truckWithCrane(other)

    await deleteOrganizationWithData(other)

    expect(await db.organization.count({ where: { id: other } })).toBe(0)
    expect(await db.equipmentItem.count({ where: { id: crane.item.id } })).toBe(0)
    expect(await db.equipmentType.count({ where: { id: crane.type.id } })).toBe(0)
  })
})
