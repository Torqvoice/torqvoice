/**
 * The decisive proof that a restore never touches another workshop, on a
 * real PostgreSQL (`npm run test:db` with E2E_DATABASE_URL set).
 *
 * Two workshops, A and B, are seeded with the full spread of records. Every
 * row of every table is dumped, and the restore core is run into A three
 * times: with A's own backup, with a crafted file whose foreign keys point
 * at B's rows, and with a crafted file that reuses B's row ids as its own.
 * After each, B's rows are compared with the dump taken before, row by row
 * over every table, not a hand-picked list. The comparison is what proves
 * it; the guard code is only how it is achieved.
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readPrismaSchema } from '@/__tests__/stubs/prisma-schema'
import { TENANCY_SCHEMA } from '@/lib/backup/tenancy-schema'

const url = process.env.E2E_DATABASE_URL ?? ''
const databaseName = url.split('/').pop()?.split('?')[0]?.toLowerCase() ?? ''
if (url && !/test|e2e/.test(databaseName)) {
  throw new Error(
    `Refusing to use database "${databaseName}": the suite empties it, so its name must say test or e2e.`
  )
}

// Set before the app's modules load, so the client connects to the test
// database and files land in a folder of this run's own.
process.env.DATABASE_URL = url
const dataRoot = mkdtempSync(path.join(tmpdir(), 'restore-tenancy-'))
process.env.DATA_ROOT = dataRoot

type Row = Record<string, unknown>
type Dump = Map<string, Row[]>

/** `@@map` names: the table each model is stored in. */
function tableOfModel(): Map<string, string> {
  const out = new Map<string, string>()
  for (const block of readPrismaSchema().matchAll(/\nmodel\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const map = /@@map\("([^"]+)"\)/.exec(block[2])
    out.set(block[1], map ? map[1] : block[1])
  }
  return out
}

const TABLE_OF = tableOfModel()
const MODEL_OF = new Map([...TABLE_OF].map(([model, table]) => [table, model]))

let db: typeof import('@/lib/db')['db']
let importCore: typeof import('@/lib/backup/import')
let buildData: typeof import('@/lib/backup/build-data')
let tenancy: typeof import('@/lib/backup/tenancy')
let tableNames: string[] = []

async function listTables(): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ table_name: string }[]>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`
  )
  return rows.map((r) => r.table_name).filter((t) => t !== '_prisma_migrations')
}

async function emptyDatabase(): Promise<void> {
  await db.$executeRawUnsafe(`truncate table ${tableNames.map((t) => `"${t}"`).join(', ')} cascade`)
}

/** Every row of every table, as JSON text sorted within each table. */
async function dumpAll(): Promise<Dump> {
  const out: Dump = new Map()
  for (const table of tableNames) {
    const rows = await db.$queryRawUnsafe<{ row: string }[]>(
      `select row_to_json(t)::text as row from "${table}" t`
    )
    out.set(
      table,
      rows
        .map((r) => r.row)
        .sort()
        .map((text) => JSON.parse(text) as Row)
    )
  }
  return out
}

/** Rows by table and id, for following a child row to its parent. */
function index(dump: Dump): Map<string, Map<string, Row>> {
  const out = new Map<string, Map<string, Row>>()
  for (const [table, rows] of dump) {
    out.set(table, new Map(rows.map((r) => [String(r.id), r])))
  }
  return out
}

/**
 * Whose row this is: its organisation column, or its parent's, following
 * the relation paths the tenancy schema knows. Null for a global row such
 * as a user.
 */
function organizationOf(
  table: string,
  row: Row,
  byId: Map<string, Map<string, Row>>,
  depth = 0
): string | null {
  const model = MODEL_OF.get(table)
  const known = model ? TENANCY_SCHEMA[model] : undefined
  if (!known || depth > 6) return null
  if (known.organizationId)
    return typeof row.organizationId === 'string' ? row.organizationId : null
  for (const [first] of known.ownerPaths) {
    const column = Object.entries(known.foreignKeys).find(([, fk]) => fk.relation === first)
    if (!column) continue
    const id = row[column[0]]
    const parentTable = TABLE_OF.get(column[1].target)
    if (typeof id !== 'string' || !parentTable) continue
    const parent = byId.get(parentTable)?.get(id)
    if (!parent) continue
    const owner = organizationOf(parentTable, parent, byId, depth + 1)
    if (owner) return owner
  }
  return null
}

/** The rows of one workshop, table by table, as the dump holds them. */
function rowsOf(dump: Dump, organizationId: string): Dump {
  const byId = index(dump)
  const out: Dump = new Map()
  for (const [table, rows] of dump) {
    const mine = rows.filter((r) => organizationOf(table, r, byId) === organizationId)
    if (mine.length) out.set(table, mine)
  }
  return out
}

function idsOf(rows: Dump): Set<string> {
  const out = new Set<string>()
  for (const list of rows.values())
    for (const r of list) if (typeof r.id === 'string') out.add(r.id)
  return out
}

function countRows(rows: Dump): number {
  let n = 0
  for (const list of rows.values()) n += list.length
  return n
}

/** Every string anywhere in a row that is one of the given ids. */
function referencesTo(rows: Dump, ids: Set<string>): string[] {
  const hits: string[] = []
  for (const [table, list] of rows) {
    for (const row of list) {
      for (const [column, value] of Object.entries(row)) {
        if (typeof value === 'string' && ids.has(value) && column !== 'id') {
          hits.push(`${table}.${column} -> ${value}`)
        }
      }
    }
  }
  return hits
}

interface Seeded {
  organizationId: string
  userId: string
  customerId: string
  vehicleId: string
  technicianId: string
  workBayId: string
  inventoryPartId: string
  templateId: string
  locationId: string
}

/** A workshop with a bit of everything a backup carries. */
async function seedWorkshop(tag: string): Promise<Seeded> {
  const user = await db.user.create({
    data: { name: `Owner ${tag}`, email: `${tag}@restore.test` },
  })
  const org = await db.organization.create({ data: { name: `Workshop ${tag}` } })
  const organizationId = org.id
  const userId = user.id
  await db.organizationMember.create({ data: { userId, organizationId, role: 'owner' } })

  const customer = await db.customer.create({
    data: { name: `Kari ${tag}`, email: `kari-${tag}@example.com`, userId, organizationId },
  })
  const technician = await db.technician.create({ data: { name: `Ola ${tag}`, organizationId } })
  const bay = await db.workBay.create({ data: { name: `Bay ${tag}`, organizationId } })
  const part = await db.inventoryPart.create({
    data: {
      name: `Brake pads ${tag}`,
      userId,
      organizationId,
      movements: { create: [{ delta: 4, quantityAfter: 4, reason: 'seed', organizationId }] },
    },
  })
  const vehicle = await db.vehicle.create({
    data: {
      make: 'Volvo',
      model: 'V70',
      year: 2015,
      userId,
      organizationId,
      customerId: customer.id,
      notes: { create: [{ title: 'Note', content: `Rattle ${tag}` }] },
      reminders: { create: [{ title: `Service ${tag}`, organizationId }] },
    },
  })

  const uploads = path.join(dataRoot, 'uploads', organizationId, 'services')
  mkdirSync(uploads, { recursive: true })
  writeFileSync(path.join(uploads, `scan-${tag}.pdf`), `pdf of ${tag}`)

  const job = await db.serviceRecord.create({
    data: {
      title: `Brakes ${tag}`,
      organizationId,
      vehicleId: vehicle.id,
      customerId: customer.id,
      technicianId: technician.id,
      workBayId: bay.id,
      invoiceNumber: `INV-${tag}-1`,
      partItems: { create: [{ name: 'Pads', inventoryPartId: part.id }] },
      laborItems: { create: [{ description: 'Fit pads' }] },
      payments: { create: [{ amount: 100 }] },
      attachments: {
        create: [
          {
            fileName: `scan-${tag}.pdf`,
            fileUrl: `/api/protected/files/${organizationId}/services/scan-${tag}.pdf`,
            fileType: 'application/pdf',
            fileSize: 12,
          },
        ],
      },
    },
  })
  await db.timeEntry.create({
    data: { technicianId: technician.id, serviceRecordId: job.id, organizationId },
  })
  await db.serviceRecord.create({
    data: { title: `Counter sale ${tag}`, organizationId, customerId: customer.id },
  })
  await db.quote.create({
    data: {
      title: `Tyres ${tag}`,
      userId,
      organizationId,
      vehicleId: vehicle.id,
      customerId: customer.id,
      partItems: { create: [{ name: 'Tyre' }] },
      laborItems: { create: [{ description: 'Fit tyres' }] },
    },
  })
  const template = await db.inspectionTemplate.create({
    data: {
      name: `Default ${tag}`,
      organizationId,
      sections: { create: [{ name: 'Brakes', items: { create: [{ name: 'Pads' }] } }] },
    },
  })
  await db.inspection.create({
    data: {
      vehicleId: vehicle.id,
      templateId: template.id,
      organizationId,
      technicianId: technician.id,
      items: { create: [{ name: 'Pads', section: 'Brakes' }] },
    },
  })
  const warehouse = await db.tireWarehouse.create({
    data: {
      name: `Hotel ${tag}`,
      organizationId,
      userId,
      locations: { create: [{ code: 'A1', organizationId }] },
    },
  })
  const location = await db.tireLocation.findFirstOrThrow({ where: { warehouseId: warehouse.id } })
  await db.tireSet.create({
    data: {
      organizationId,
      userId,
      vehicleId: vehicle.id,
      customerId: customer.id,
      locationId: location.id,
      measurements: { create: [{}] },
    },
  })
  await db.smsMessage.create({
    data: {
      direction: 'outbound',
      fromNumber: '+4700000000',
      toNumber: '+4711111111',
      body: `Ready ${tag}`,
      organizationId,
      customerId: customer.id,
    },
  })
  await db.emailMessage.create({
    data: {
      direction: 'outbound',
      address: `kari-${tag}@example.com`,
      body: `Hello ${tag}`,
      organizationId,
      customerId: customer.id,
    },
  })
  await db.appSetting.createMany({
    data: [
      { key: 'workshop.name', value: `Workshop ${tag}`, userId, organizationId },
      { key: 'workshop.phone', value: `+47 ${tag}`, userId, organizationId },
    ],
  })
  await db.workOrderStatus.create({
    data: { name: `Waiting ${tag}`, stage: 'pending', organizationId },
  })
  await db.notification.create({
    data: {
      type: 'seed',
      title: 'Seeded',
      message: tag,
      entityType: 'Vehicle',
      entityId: vehicle.id,
      entityUrl: `/vehicles/${vehicle.id}`,
      organizationId,
    },
  })
  await db.webhook.create({
    data: {
      name: `Hook ${tag}`,
      url: 'https://example.test/hook',
      secret: `whsec_${tag}`,
      events: '["*"]',
      organizationId,
      createdById: userId,
    },
  })
  await db.role.create({
    data: {
      name: `Mechanic ${tag}`,
      organizationId,
      permissions: { create: [{ action: 'read', subject: 'vehicles' }] },
    },
  })
  await db.laborPreset.create({
    data: {
      name: `Service ${tag}`,
      userId,
      organizationId,
      items: { create: [{ description: 'Oil change' }] },
    },
  })
  await db.documentDesign.create({
    data: {
      organizationId,
      documentType: 'invoice',
      name: `Design ${tag}`,
      layout: {},
      template: {},
    },
  })
  await db.auditLog.create({ data: { action: 'seed', organizationId, userId } })

  return {
    organizationId,
    userId,
    customerId: customer.id,
    vehicleId: vehicle.id,
    technicianId: technician.id,
    workBayId: bay.id,
    inventoryPartId: part.id,
    templateId: template.id,
    locationId: location.id,
  }
}

/** A's backup, the way the engine stages it for restic: data.json and the uploads folder. */
async function exportOf(organizationId: string): Promise<{ data: Row; dir: string }> {
  const chunks: string[] = []
  const out = new PassThrough()
  out.on('data', (chunk: Buffer | string) => chunks.push(chunk.toString()))
  await buildData.writeBackupData(
    organizationId,
    {
      settings: true,
      customers: true,
      vehicles: true,
      quotes: true,
      inventory: true,
      customFields: true,
      files: false,
      technicians: true,
      inspections: true,
      auditLogs: true,
      smsMessages: true,
      scheduledMessages: true,
      notifications: true,
      tireHotel: true,
      workshopConfig: true,
      includeSecrets: true,
    },
    out
  )
  out.end()
  const text = chunks.join('')
  const dir = mkdtempSync(path.join(dataRoot, 'restore-'))
  mkdirSync(path.join(dir, 'stage'))
  writeFileSync(path.join(dir, 'stage', 'data.json'), text)
  cpSync(path.join(dataRoot, 'uploads', organizationId), path.join(dir, 'files'), {
    recursive: true,
  })
  return { data: JSON.parse(text) as Row, dir }
}

const describeDb = url ? describe : describe.skip

describeDb('a restore never touches another workshop', () => {
  let a: Seeded
  let b: Seeded
  let before: Dump
  let bBefore: Dump
  let bIds: Set<string>

  beforeAll(async () => {
    ;({ db } = await import('@/lib/db'))
    importCore = await import('@/lib/backup/import')
    buildData = await import('@/lib/backup/build-data')
    tenancy = await import('@/lib/backup/tenancy')
    tableNames = await listTables()
    expect(tableNames.length).toBeGreaterThan(50)
  })

  beforeEach(async () => {
    await emptyDatabase()
    rmSync(path.join(dataRoot, 'uploads'), { recursive: true, force: true })
    a = await seedWorkshop('a')
    b = await seedWorkshop('b')
    before = await dumpAll()
    bBefore = rowsOf(before, b.organizationId)
    bIds = idsOf(bBefore)
    // The seed has to be worth comparing.
    expect(countRows(bBefore)).toBeGreaterThan(30)
    expect(bBefore.size).toBeGreaterThan(25)
  })

  afterAll(async () => {
    if (db) await db.$disconnect()
    rmSync(dataRoot, { recursive: true, force: true })
  })

  it("restores A's own backup and leaves B byte for byte as it was", async () => {
    const { dir } = await exportOf(a.organizationId)
    const aBefore = rowsOf(before, a.organizationId)

    const result = await importCore.restoreFromDisk(
      { organizationId: a.organizationId, userId: a.userId },
      { dataFile: path.join(dir, 'stage', 'data.json'), filesDir: path.join(dir, 'files') }
    )

    expect(result.redactedSettings).toEqual([])
    const after = await dumpAll()
    expect(rowsOf(after, b.organizationId)).toEqual(bBefore)
    // A came back whole, with the ids it had, and points at nothing of B's.
    const aAfter = rowsOf(after, a.organizationId)
    expect(idsOf(aAfter)).toEqual(idsOf(aBefore))
    expect(referencesTo(aAfter, bIds)).toEqual([])
    // Nothing belongs to anyone else, and no row was left ownerless.
    const byId = index(after)
    for (const [table, rows] of after) {
      for (const row of rows) {
        const owner = organizationOf(table, row, byId)
        expect(
          owner === null || owner === a.organizationId || owner === b.organizationId,
          `${table} ${row.id} belongs to ${owner}`
        ).toBe(true)
      }
    }
  })

  it('clears every foreign key a crafted file points at B with, and leaves B as it was', async () => {
    const { data } = await exportOf(a.organizationId)
    const file = data.data as Record<string, Row[]>
    file.vehicles[0].customerId = b.customerId
    const job = (file.vehicles[0].serviceRecords as Row[])[0]
    job.workBayId = b.workBayId
    job.technicianId = b.technicianId
    ;(job.partItems as Row[])[0].inventoryPartId = b.inventoryPartId
    ;(job.timeEntries as Row[])[0].technicianId = b.technicianId
    file.counterSales[0].customerId = b.customerId
    file.quotes[0].vehicleId = b.vehicleId
    file.inspections[0].templateId = b.templateId
    file.tireSets[0].locationId = b.locationId
    file.smsMessages[0].customerId = b.customerId

    await importCore.restoreBackup(
      { organizationId: a.organizationId, userId: a.userId },
      data as unknown as import('@/lib/backup/import').BackupData,
      null
    )

    const after = await dumpAll()
    expect(rowsOf(after, b.organizationId)).toEqual(bBefore)
    const aAfter = rowsOf(after, a.organizationId)
    expect(referencesTo(aAfter, bIds)).toEqual([])
    // The links were cleared rather than the rows lost, except the ones
    // that cannot exist without their link.
    expect(aAfter.get(TABLE_OF.get('Vehicle') ?? '')).toHaveLength(1)
    expect(aAfter.get(TABLE_OF.get('Quote') ?? '')).toHaveLength(1)
    expect(aAfter.get(TABLE_OF.get('Inspection') ?? '')).toBeUndefined()
  })

  it("refuses a file that reuses B's ids before anything is written", async () => {
    const { data } = await exportOf(a.organizationId)
    const file = data.data as Record<string, Row[]>
    file.customers[0].id = b.customerId
    file.vehicles[0].customerId = b.customerId

    const error = await importCore
      .restoreBackup(
        { organizationId: a.organizationId, userId: a.userId },
        data as unknown as import('@/lib/backup/import').BackupData,
        null
      )
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(tenancy.RestoreRefusedError)
    expect((error as { code: string }).code).toBe('foreign_ids')
    expect(await dumpAll()).toEqual(before)
  })
})
