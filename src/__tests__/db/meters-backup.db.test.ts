/**
 * Meters through a restore, on a real PostgreSQL (`npm run test:db`).
 *
 * A vehicle's meters and readings hang off the vehicle with a cascade, so a
 * restore that replaces the vehicles deletes them. Whatever the file was
 * taken with, a restore must never delete readings it cannot put back:
 * a vehicles backup carries the meters, a file without meters (taken before
 * them) keeps and re-attaches the ones the workshop has, and a custom fields
 * restore leaves them alone.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
const dataRoot = mkdtempSync(path.join(process.env.TMPDIR || tmpdir(), 'meters-backup-'))
process.env.DATA_ROOT = dataRoot

const stamp = randomUUID().slice(0, 8)
let db: typeof import('@/lib/db')['db']
let importCore: typeof import('@/lib/backup/import')
let buildData: typeof import('@/lib/backup/build-data')
let organizationId = ''
let userId = ''
let vehicleId = ''
let jobId = ''

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
  mkdirSync(filesDir, { recursive: true })
  return { dataFile, filesDir }
}

const restore = (backup: { dataFile: string; filesDir: string }) =>
  importCore.restoreFromDisk({ organizationId, userId }, backup)

async function meterRows() {
  const readings = await db.meterReading.findMany({
    where: { organizationId },
    orderBy: { value: 'asc' },
    select: {
      id: true,
      value: true,
      serviceRecordId: true,
      vehicleMeter: { select: { vehicleId: true } },
    },
  })
  return readings.map((r) => ({
    id: r.id,
    value: r.value.toString(),
    job: r.serviceRecordId,
    vehicle: r.vehicleMeter.vehicleId,
  }))
}

beforeAll(async () => {
  ;({ db } = await import('@/lib/db'))
  importCore = await import('@/lib/backup/import')
  buildData = await import('@/lib/backup/build-data')
  const user = await db.user.create({
    data: { name: `Meters backup ${stamp}`, email: `meters-backup-${stamp}@example.com` },
  })
  userId = user.id
  organizationId = (await db.organization.create({ data: { name: `Meters backup ${stamp}` } })).id
  await db.organizationMember.create({ data: { userId, organizationId, role: 'owner' } })
})

afterAll(async () => {
  await db.organization.deleteMany({ where: { id: organizationId } })
  await db.user.deleteMany({ where: { id: userId } })
})

beforeEach(async () => {
  await db.meterType.deleteMany({ where: { organizationId } })
  await db.vehicle.deleteMany({ where: { organizationId } })
  const vehicle = await db.vehicle.create({
    data: { make: 'Volvo', model: 'FH', year: 2019, userId, organizationId },
  })
  vehicleId = vehicle.id
  jobId = (
    await db.serviceRecord.create({
      data: { title: 'Service', vehicleId, organizationId, serviceDate: new Date('2026-11-01') },
    })
  ).id
  const type = await db.meterType.create({
    data: { name: `Engine hours ${stamp}`, unit: 'hrs', organizationId },
  })
  const meter = await db.vehicleMeter.create({
    data: { vehicleId, meterTypeId: type.id, organizationId },
  })
  await db.meterReading.createMany({
    data: [
      { vehicleMeterId: meter.id, value: '4256.7', readAt: new Date('2026-10-01'), organizationId },
      {
        vehicleMeterId: meter.id,
        serviceRecordId: jobId,
        value: '4300.25',
        readAt: new Date('2026-11-01'),
        organizationId,
      },
    ],
  })
})

describe('meters through a restore', () => {
  it('come back from a vehicles backup, which carries them', async () => {
    const before = await meterRows()
    const backup = await exportWith(['vehicles'])
    expect(JSON.parse(readFileSync(backup.dataFile, 'utf8')).data.meterTypes).toHaveLength(1)

    await restore(backup)

    expect(await meterRows()).toEqual(before)
  })

  it('are kept and re-attached when the file replaces the vehicles but has no meters', async () => {
    const before = await meterRows()
    // A file taken before meters existed.
    const backup = await exportWith(['vehicles'], (data) => {
      delete data.meterTypes
    })

    await restore(backup)

    expect(await meterRows()).toEqual(before)
    expect(await db.meterType.count({ where: { organizationId } })).toBe(1)
  })

  it('come back required when the workshop required them, and not required otherwise', async () => {
    await db.meterType.create({
      data: { name: `PTO hours ${stamp}`, unit: 'hrs', required: true, organizationId },
    })
    const options = async () =>
      (
        await db.meterType.findMany({
          where: { organizationId },
          orderBy: { name: 'asc' },
          select: { name: true, required: true },
        })
      ).map((t) => [t.name, t.required])
    const before = await options()
    expect(before).toEqual([
      [`Engine hours ${stamp}`, false],
      [`PTO hours ${stamp}`, true],
    ])

    await restore(await exportWith(['vehicles']))
    expect(await options()).toEqual(before)

    // A file taken before the option existed asks for nothing.
    await restore(
      await exportWith(['vehicles'], (data) => {
        for (const type of data.meterTypes as Record<string, unknown>[]) delete type.required
      })
    )
    expect((await options()).map(([, required]) => required)).toEqual([false, false])
  })

  it('are left alone by a restore of custom fields only', async () => {
    const before = await meterRows()
    await restore(await exportWith(['customFields']))
    expect(await meterRows()).toEqual(before)
  })
})
