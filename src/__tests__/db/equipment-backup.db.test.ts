/**
 * Equipment through a restore, on a real PostgreSQL (`npm run test:db`).
 *
 * An item hangs off its vehicle with a cascade, and so do where it has been,
 * its meters with their readings and the links from jobs and quotes, so a
 * restore that replaces the vehicles deletes them all. Whatever the file was
 * taken with, a restore must never delete equipment it cannot put back: a
 * vehicles backup carries it (report files too), a file without equipment
 * (taken before it) keeps and re-attaches what the workshop has, and a custom
 * fields restore leaves it alone.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const url = process.env.E2E_DATABASE_URL ?? ''
const databaseName = url.split('/').pop()?.split('?')[0]?.toLowerCase() ?? ''
if (url && !/test|e2e/.test(databaseName)) {
  throw new Error(
    `Refusing to use database "${databaseName}": its name must say test or e2e, like the rest of this suite.`
  )
}
process.env.DATABASE_URL = url
const dataRoot = mkdtempSync(path.join(process.env.TMPDIR || tmpdir(), 'equipment-backup-'))
process.env.DATA_ROOT = dataRoot

const stamp = randomUUID().slice(0, 8)
let db: typeof import('@/lib/db')['db']
let importCore: typeof import('@/lib/backup/import')
let buildData: typeof import('@/lib/backup/build-data')
let organizationId = ''
let userId = ''
let reportName = ''

const reportUrl = (name: string) => `/api/protected/files/${organizationId}/vehicles/${name}`
const reportPath = (name: string) =>
  path.join(dataRoot, 'uploads', organizationId, 'vehicles', name)

function writeReport(name: string) {
  mkdirSync(path.dirname(reportPath(name)), { recursive: true })
  writeFileSync(reportPath(name), `report ${name}`)
}

/**
 * A backup on disk, the way the export leaves it: data.json, and the
 * workshop's vehicles folder as it was when the backup was taken.
 */
async function exportWith(
  only: (keyof typeof buildData.DEFAULT_OPTIONS)[],
  edit?: (data: Record<string, unknown>) => void
): Promise<{ dataFile: string; filesDir: string }> {
  const chunks: string[] = []
  const out = new PassThrough()
  out.on('data', (chunk: Buffer | string) => chunks.push(chunk.toString()))
  const options = { ...buildData.DEFAULT_OPTIONS }
  for (const key of Object.keys(options) as (keyof typeof options)[]) {
    options[key] = only.includes(key)
  }
  await buildData.writeBackupData(organizationId, { ...options, includeSecrets: true }, out)
  out.end()
  const file = JSON.parse(chunks.join('')) as { data: Record<string, unknown> }
  edit?.(file.data)
  const dir = mkdtempSync(path.join(dataRoot, 'backup-'))
  const dataFile = path.join(dir, 'data.json')
  writeFileSync(dataFile, JSON.stringify(file))
  const filesDir = path.join(dir, 'files')
  mkdirSync(path.join(filesDir, 'vehicles'), { recursive: true })
  if (only.includes('vehicles') && existsSync(reportPath(reportName))) {
    writeFileSync(path.join(filesDir, 'vehicles', reportName), readFileSync(reportPath(reportName)))
  }
  return { dataFile, filesDir }
}

const restore = (backup: { dataFile: string; filesDir: string }) =>
  importCore.restoreFromDisk({ organizationId, userId }, backup)

/** Everything about the workshop's equipment, in a form two reads can compare. */
async function equipmentRows() {
  const items = await db.equipmentItem.findMany({
    where: { organizationId },
    orderBy: { id: 'asc' },
    include: {
      fittings: { orderBy: { fittedAt: 'asc' } },
      jobs: { select: { serviceRecordId: true } },
      quotes: { select: { quoteId: true } },
      meters: {
        orderBy: { id: 'asc' },
        include: { readings: { orderBy: { value: 'asc' } } },
      },
    },
  })
  return items.map((item) => ({
    ...item,
    meters: item.meters.map((meter) => ({
      ...meter,
      readings: meter.readings.map((r) => ({
        id: r.id,
        value: r.value.toString(),
        job: r.serviceRecordId,
      })),
    })),
  }))
}

/** The vehicle's own meters, which an item's must never be mistaken for. */
const vehicleMeterCount = () =>
  db.vehicleMeter.count({ where: { organizationId, vehicleId: { not: null } } })

/** Clears what an item points at with Restrict before its kind. */
async function clearEquipment() {
  await db.equipmentItem.deleteMany({ where: { organizationId } })
  await db.equipmentType.deleteMany({ where: { organizationId } })
}

beforeAll(async () => {
  ;({ db } = await import('@/lib/db'))
  importCore = await import('@/lib/backup/import')
  buildData = await import('@/lib/backup/build-data')
  const user = await db.user.create({
    data: { name: `Equipment backup ${stamp}`, email: `equipment-backup-${stamp}@example.com` },
  })
  userId = user.id
  organizationId = (await db.organization.create({ data: { name: `Equipment backup ${stamp}` } }))
    .id
  await db.organizationMember.create({ data: { userId, organizationId, role: 'owner' } })
})

afterAll(async () => {
  await clearEquipment()
  await db.organization.deleteMany({ where: { id: organizationId } })
  await db.user.deleteMany({ where: { id: userId } })
})

beforeEach(async () => {
  await clearEquipment()
  await db.meterType.deleteMany({ where: { organizationId } })
  await db.quote.deleteMany({ where: { organizationId } })
  await db.vehicle.deleteMany({ where: { organizationId } })

  // A crane that came off one truck and went onto another, worked on by a
  // job and quoted for, with its own hour meter beside the truck's.
  const [first, truck] = await Promise.all([
    db.vehicle.create({
      data: { make: 'Scania', model: 'R 450', year: 2015, userId, organizationId },
    }),
    db.vehicle.create({ data: { make: 'Volvo', model: 'FH', year: 2019, userId, organizationId } }),
  ])
  const job = await db.serviceRecord.create({
    data: {
      title: 'Crane service',
      vehicleId: truck.id,
      organizationId,
      serviceDate: new Date('2026-11-01'),
    },
  })
  const quote = await db.quote.create({
    data: { title: 'Crane repair', userId, organizationId },
  })
  const type = await db.equipmentType.create({ data: { name: 'Crane', organizationId } })
  reportName = `${randomUUID()}.pdf`
  writeReport(reportName)
  const item = await db.equipmentItem.create({
    data: {
      make: 'Hiab',
      model: 'X-HiPro 232',
      serialNumber: `SN-${stamp}`,
      manufactureYear: 2018,
      manufactureDate: new Date('2018-04-12'),
      installDate: new Date('2019-02-01'),
      ratedCapacity: '8 t',
      nextExaminationDue: new Date('2027-02-01'),
      lastExaminedAt: new Date('2026-02-01'),
      certificateReference: 'LOLER-77',
      reportFileUrl: reportUrl(reportName),
      reportFileName: 'Examination 2026.pdf',
      notes: 'Moved over from the Scania',
      typeId: type.id,
      vehicleId: truck.id,
      organizationId,
    },
  })
  await db.equipmentFitting.createMany({
    data: [
      {
        itemId: item.id,
        vehicleId: first.id,
        fittedAt: new Date('2019-02-01'),
        endedAt: new Date('2024-06-01'),
        endReason: 'moved',
        organizationId,
      },
      { itemId: item.id, vehicleId: truck.id, fittedAt: new Date('2024-06-01'), organizationId },
    ],
  })
  await db.serviceRecordEquipment.create({
    data: { serviceRecordId: job.id, itemId: item.id, organizationId },
  })
  await db.quoteEquipment.create({ data: { quoteId: quote.id, itemId: item.id, organizationId } })
  const hours = await db.meterType.create({
    data: { name: `Crane hours ${stamp}`, unit: 'hrs', organizationId },
  })
  const meter = await db.vehicleMeter.create({
    data: { equipmentItemId: item.id, meterTypeId: hours.id, organizationId },
  })
  await db.vehicleMeter.create({
    data: { vehicleId: truck.id, meterTypeId: hours.id, organizationId },
  })
  await db.meterReading.createMany({
    data: [
      { vehicleMeterId: meter.id, value: '812.5', readAt: new Date('2026-10-01'), organizationId },
      {
        vehicleMeterId: meter.id,
        serviceRecordId: job.id,
        value: '830.25',
        readAt: new Date('2026-11-01'),
        organizationId,
      },
    ],
  })
})

describe('equipment through a restore', () => {
  it('comes back from a vehicles backup, with its meter, history, links and report', async () => {
    const before = await equipmentRows()
    expect(before).toHaveLength(1)
    const backup = await exportWith(['vehicles'])
    const written = JSON.parse(readFileSync(backup.dataFile, 'utf8')).data
    expect(written.equipmentTypes[0].items).toHaveLength(1)

    await restore(backup)

    expect(await equipmentRows()).toEqual(before)
    expect(await vehicleMeterCount()).toBe(1)
    expect(readFileSync(reportPath(reportName), 'utf8')).toBe(`report ${reportName}`)
  })

  it('comes back with the quotes too when the file replaces them', async () => {
    const before = await equipmentRows()
    await restore(await exportWith(['vehicles', 'quotes']))
    expect(await equipmentRows()).toEqual(before)
  })

  it('is kept and re-attached when the file replaces the vehicles but has no equipment', async () => {
    const before = await equipmentRows()
    // A file taken after meters but before equipment: no items, and only the
    // vehicles' own meters.
    const backup = await exportWith(['vehicles', 'quotes'], (data) => {
      delete data.equipmentTypes
      for (const type of data.meterTypes as { vehicleMeters: { vehicleId: unknown }[] }[]) {
        type.vehicleMeters = type.vehicleMeters.filter((meter) => meter.vehicleId)
      }
    })

    await restore(backup)

    expect(await equipmentRows()).toEqual(before)
    expect(await vehicleMeterCount()).toBe(1)
    expect(await db.equipmentType.count({ where: { organizationId } })).toBe(1)
    expect(existsSync(reportPath(reportName))).toBe(true)
  })

  it('is kept when the file has neither equipment nor meters', async () => {
    const before = await equipmentRows()
    const backup = await exportWith(['vehicles'], (data) => {
      delete data.equipmentTypes
      delete data.meterTypes
    })

    await restore(backup)

    expect(await equipmentRows()).toEqual(before)
    expect(await vehicleMeterCount()).toBe(1)
  })

  it('keeps a quote’s link when a quotes-only file replaces the quotes', async () => {
    const before = await equipmentRows()
    await restore(await exportWith(['quotes']))
    expect(await equipmentRows()).toEqual(before)
  })

  it('is left alone by a restore of custom fields only', async () => {
    const before = await equipmentRows()
    await restore(await exportWith(['customFields']))
    expect(await equipmentRows()).toEqual(before)
  })

  it('lets go of an item added after the backup, and its report file', async () => {
    const backup = await exportWith(['vehicles'])
    const before = await equipmentRows()
    const later = `${randomUUID()}.pdf`
    writeReport(later)
    const item = before[0]
    await db.equipmentItem.create({
      data: {
        make: 'Zepro',
        reportFileUrl: reportUrl(later),
        reportFileName: 'Tail lift.pdf',
        typeId: item.typeId,
        vehicleId: item.vehicleId,
        organizationId,
      },
    })

    await restore(backup)

    expect(await equipmentRows()).toEqual(before)
    expect(existsSync(reportPath(later))).toBe(false)
    expect(existsSync(reportPath(reportName))).toBe(true)
  })
})
