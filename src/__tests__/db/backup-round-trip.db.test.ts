/**
 * A backup gives back what went into it, on a real PostgreSQL
 * (`npm run test:db` with E2E_DATABASE_URL set).
 *
 * The guard tests beside the restore read its source against the schema,
 * which catches a column somebody forgot in a field map. This one does not
 * read anything: it seeds a workshop with a row in every place a backup file
 * can hold one, every column filled with something other than its default,
 * exports it through the real export, empties the database, and restores the
 * file into a workshop with nothing in it. Every row of every table is then
 * compared with the dump taken before, column by column.
 *
 * The seed is built from the Prisma schema and the backup layout, not by
 * hand, so a column or a nested model added later is seeded, exported and
 * compared without anyone touching this file. What is allowed to differ is
 * listed in EXPECTED with the reason; anything else fails.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readPrismaSchema } from '@/__tests__/stubs/prisma-schema'
import { BACKUP_LAYOUT, type LayoutNode } from '@/lib/backup/layout'
import { UPLOAD_CATEGORIES } from '@/lib/backup/manifest'
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
const dataRoot = mkdtempSync(path.join(tmpdir(), 'backup-round-trip-'))
process.env.DATA_ROOT = dataRoot

type Row = Record<string, unknown>
type Dump = Map<string, Row[]>

const SCHEMA = readPrismaSchema()
const ORG = 'org_round_trip'
const OWNER = 'user_owner'
/** A second member, so a column that names a person is not always the importer. */
const MEMBER = 'user_member'

interface Field {
  name: string
  type: string
  optional: boolean
  list: boolean
  /** The text of `@default(...)`, when the column has one. */
  fallback: string | null
}

/** Each model's stored columns, and the table it lives in. */
function readModels(): { fields: Map<string, Field[]>; tables: Map<string, string> } {
  const fields = new Map<string, Field[]>()
  const tables = new Map<string, string>()
  for (const block of SCHEMA.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const list: Field[] = []
    for (const line of block[2].split('\n')) {
      const field =
        /^\s+(\w+)\s+(String|Int|Float|Boolean|DateTime|Json|Bytes|BigInt)(\?|\[\])?(\s.*)?$/.exec(
          line
        )
      if (!field || line.trim().startsWith('//')) continue
      const fallback = /@default\((.*)\)/.exec(field[4] ?? '')
      list.push({
        name: field[1],
        type: field[2],
        optional: field[3] === '?',
        list: field[3] === '[]',
        fallback: fallback ? fallback[1].replace(/\).*$/, '') : null,
      })
    }
    fields.set(block[1], list)
    const map = /@@map\("([^"]+)"\)/.exec(block[2])
    tables.set(block[1], map ? map[1] : block[1])
  }
  return { fields, tables }
}

const { fields: FIELDS, tables: TABLE_OF } = readModels()
const MODEL_OF = new Map([...TABLE_OF].map(([model, table]) => [table, model]))

/** One place in a backup file that holds rows: a dataset, or a list nested in a row. */
interface Position {
  id: string
  model: string
  parent: Position | null
}

function positions(): Position[] {
  const out: Position[] = []
  const walk = (key: string, node: LayoutNode, parent: Position | null) => {
    const position = { id: parent ? `${parent.id}_${key}` : key, model: node.model, parent }
    out.push(position)
    for (const [childKey, child] of Object.entries(node.children ?? {})) {
      walk(childKey, child, position)
    }
  }
  for (const [key, node] of Object.entries(BACKUP_LAYOUT)) walk(key, node, null)
  return out
}

const POSITIONS = positions()
const POSITIONS_OF = new Map<string, Position[]>()
for (const position of POSITIONS) {
  POSITIONS_OF.set(position.model, [...(POSITIONS_OF.get(position.model) ?? []), position])
}

function lowerFirst(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1)
}

/**
 * Places the layout offers that the app never fills, so no row is seeded
 * there. Each is a statement about the product, not about the backup.
 */
const NEVER_FILLED: Readonly<Record<string, string>> = {}

/**
 * The column that ties a nested row to the row it nests in, where the name
 * does not say so.
 */
const PARENT_LINK: Readonly<Record<string, string>> = {}

/**
 * Values the generic seed cannot guess: a column whose text means something
 * to the restore (a file link it rewrites, a status it checks), or a pair of
 * columns the app never fills together. Keyed by model, then by column; a
 * function gets the position's id. `undefined` leaves the generic value.
 */
type Override = unknown | ((position: Position) => unknown)
/** A tax split as the documents store it; the restore reads it leniently and writes it clean. */
const TAX_SPLIT = [
  { name: 'GST', rate: 5, amount: 4.2, registrationNumber: 'RT 0001' },
  { name: 'QST', rate: 9.975, amount: 8.38, compound: true },
]
const OVERRIDES: Readonly<Record<string, Readonly<Record<string, Override>>>> = {
  // A status the restore does not know the stage of is not restored.
  WorkOrderStatus: { stage: 'in-progress' },
  // Months, mileage and an expiry belong to an included warranty only.
  ServiceRecord: { warrantyStatus: 'included', taxComponents: TAX_SPLIT },
  Quote: { warrantyStatus: 'included', taxComponents: TAX_SPLIT },
  // The kinds of mark at completion, a list.
  Inspection: { markTypesSnapshot: [{ key: 'dent', label: 'Dent', color: '#f00' }] },
  // The newer mark a dent was recorded again as. The seed has one mark per
  // place, so it names itself: what matters is that the link comes back.
  ConditionMark: { carriedToId: (position: Position) => position.id },
}

/** How much of their place in the file two positions share, for choosing a row in the same tree. */
function sharedPrefix(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

/**
 * The seed is run twice. `filled` gives every number something above zero;
 * `zeros` gives every number zero, which is what a restore written as
 * `value || fallback` turns into the fallback.
 */
type Variant = 'filled' | 'zeros'

/** A generic value for a column, never the column's default. */
function generic(field: Field, position: Position, index: number, variant: Variant): unknown {
  const tag = `${field.name}:${position.id}`
  if (field.list) return field.type === 'String' ? [`${tag}:1`, `${tag}:2`] : []
  switch (field.type) {
    case 'String':
      return /email/i.test(field.name) ? `${position.id}.${field.name}@example.test` : tag
    case 'Int':
      return variant === 'zeros' ? 0 : 3 + index
    case 'BigInt':
      return BigInt(variant === 'zeros' ? 0 : 1000 + index)
    case 'Float':
      return variant === 'zeros' ? 0 : 12.5 + index
    case 'Boolean':
      return field.fallback !== 'true'
    case 'DateTime':
      // A fixed moment per column, in the past: a restore that stamps "now"
      // instead of the stored time shows up as a difference.
      return new Date(Date.UTC(2024, 0, 1 + (index % 300), 7, index % 60, 9, 120))
    case 'Json':
      return { seeded: tag, list: [1, 2], nested: { on: true } }
    case 'Bytes':
      return new Uint8Array([1, 2, 3, index % 250])
    default:
      throw new Error(`No seed value for ${field.type}`)
  }
}

function rowFor(position: Position, variant: Variant): Row {
  const model = position.model
  const known = TENANCY_SCHEMA[model]
  const fields = FIELDS.get(model)
  if (!known || !fields) throw new Error(`${model} is in the layout but not in the schema`)

  // The models this model nests under elsewhere in the file. A row has one
  // parent, so the columns that point at the other kinds stay empty.
  const otherParents = new Set(
    (POSITIONS_OF.get(model) ?? [])
      .filter((other) => other !== position && other.parent?.model !== position.parent?.model)
      .map((other) => other.parent?.model)
      .filter((name): name is string => !!name)
  )
  const parentLinks = position.parent
    ? Object.entries(known.foreignKeys)
        .filter(([, fk]) => fk.target === position.parent?.model)
        .map(([column]) => column)
    : []
  const parentLink =
    PARENT_LINK[model] ??
    parentLinks.find((column) => column === `${lowerFirst(position.parent?.model ?? '')}Id`) ??
    parentLinks[0]
  if (position.parent && !parentLink) {
    throw new Error(`${model} has no column pointing at ${position.parent.model}`)
  }

  const row: Row = {}
  fields.forEach((field, index) => {
    const override = OVERRIDES[model]?.[field.name]
    const overridden = typeof override === 'function' ? override(position) : override
    if (field.name in (OVERRIDES[model] ?? {}) && overridden !== undefined) {
      row[field.name] = overridden
      return
    }
    if (field.name === 'id') {
      row.id = position.id
      return
    }
    if (field.name === 'organizationId') {
      row.organizationId = ORG
      return
    }
    if (position.parent && field.name === parentLink) {
      row[field.name] = position.parent.id
      return
    }
    const fk = known.foreignKeys[field.name]
    const plain = !fk && field.type === 'String' && !field.list
    // A column that names a person without a foreign key: who created,
    // unlocked or wrote something.
    if (plain && /(^userId|UserId|ById)$/.test(field.name)) {
      row[field.name] = MEMBER
      return
    }
    const plainTarget =
      plain && field.name.endsWith('Id')
        ? field.name.charAt(0).toUpperCase() + field.name.slice(1, -2)
        : null
    // A column named after its own model is not a link: `telegramMessageId`
    // on a Telegram message is Telegram's number for it.
    const target =
      fk?.target ??
      (plainTarget && plainTarget !== model && POSITIONS_OF.has(plainTarget) ? plainTarget : null)
    if (target === 'User') {
      row[field.name] = MEMBER
      return
    }
    if (target === 'Organization') {
      row[field.name] = ORG
      return
    }
    if (target) {
      // A row of the same tree first: a job's attachment is filed under one
      // of that job's concerns, not another job's.
      const candidates = (POSITIONS_OF.get(target) ?? [])
        .filter((other) => other !== position)
        .sort((a, b) => sharedPrefix(b.id, position.id) - sharedPrefix(a.id, position.id))
      const empty = otherParents.has(target) || candidates.length === 0
      if (empty && fk?.required) {
        throw new Error(`${model}.${field.name} is required and has nothing to point at`)
      }
      row[field.name] = empty ? null : candidates[0].id
      return
    }
    row[field.name] = generic(field, position, index, variant)
  })
  return row
}

let db: typeof import('@/lib/db')['db']
let importCore: typeof import('@/lib/backup/import')
let buildData: typeof import('@/lib/backup/build-data')
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

/** Every row of every table, by table, as the database holds it. */
async function dumpAll(): Promise<Dump> {
  const out: Dump = new Map()
  for (const table of tableNames) {
    const rows = await db.$queryRawUnsafe<{ row: string }[]>(
      `select row_to_json(t)::text as row from "${table}" t`
    )
    if (rows.length) {
      out.set(
        table,
        rows
          .map((r) => r.row)
          .sort()
          .map((text) => JSON.parse(text) as Row)
      )
    }
  }
  return out
}

/** The people and the workshop itself: what a backup never carries and a restore expects to find. */
async function createWorkshop(): Promise<void> {
  await db.user.createMany({
    data: [
      { id: OWNER, name: 'Owner', email: 'owner@round-trip.test' },
      { id: MEMBER, name: 'Member', email: 'member@round-trip.test' },
    ],
  })
  await db.organization.create({ data: { id: ORG, name: 'Round trip workshop' } })
  await db.organizationMember.createMany({
    data: [
      { id: 'member_owner', userId: OWNER, organizationId: ORG, role: 'owner' },
      { id: 'member_member', userId: MEMBER, organizationId: ORG, role: 'member' },
    ],
  })
}

/** One file in every upload folder a backup carries. */
function seedFiles(): void {
  for (const category of UPLOAD_CATEGORIES) {
    const dir = path.join(dataRoot, 'uploads', ORG, category)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, `${category}-file.bin`), `bytes of ${category}`)
  }
}

function filesOf(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!existsSync(dir)) return out
  for (const category of readdirSync(dir).sort()) {
    for (const name of readdirSync(path.join(dir, category)).sort()) {
      out[`${category}/${name}`] = readFileSync(path.join(dir, category, name), 'utf-8')
    }
  }
  return out
}

/**
 * Writes every seeded row in one transaction with the foreign key checks
 * off, so the rows can go in in any order; each link was built to point at
 * a row of the seed, and the restore would refuse one that did not.
 */
async function seedRows(variant: Variant): Promise<number> {
  const rows = POSITIONS.filter((position) => !(position.id in NEVER_FILLED)).map((position) => ({
    position,
    row: rowFor(position, variant),
  }))
  await db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`set local session_replication_role = replica`)
      for (const { position, row } of rows) {
        const delegate = (
          tx as unknown as Record<string, { create(args: unknown): Promise<unknown> }>
        )[lowerFirst(position.model)]
        try {
          await delegate.create({ data: row })
        } catch (error) {
          throw new Error(`Could not seed ${position.id} (${position.model}): ${String(error)}`)
        }
      }
    },
    { timeout: 120_000 }
  )
  return rows.length
}

async function exportWorkshop(
  only?: (keyof typeof buildData.DEFAULT_OPTIONS)[]
): Promise<{ dataFile: string; filesDir: string; text: string }> {
  const chunks: string[] = []
  const out = new PassThrough()
  out.on('data', (chunk: Buffer | string) => chunks.push(chunk.toString()))
  const options = { ...buildData.DEFAULT_OPTIONS }
  if (only) {
    for (const key of Object.keys(options) as (keyof typeof options)[]) {
      options[key] = only.includes(key)
    }
  }
  await buildData.writeBackupData(ORG, { ...options, includeSecrets: true }, out)
  out.end()
  const text = chunks.join('')
  const dir = mkdtempSync(path.join(dataRoot, 'backup-'))
  const dataFile = path.join(dir, 'data.json')
  writeFileSync(dataFile, text)
  // The folders a backup packs, as the export route and the snapshot do.
  const filesDir = path.join(dir, 'files')
  for (const category of UPLOAD_CATEGORIES) {
    const from = path.join(dataRoot, 'uploads', ORG, category)
    if (existsSync(from)) cpSync(from, path.join(filesDir, category), { recursive: true })
  }
  return { dataFile, filesDir, text }
}

/** Tables a backup does not carry, which this test puts back itself. */
const NOT_IN_A_BACKUP = new Set(['User', 'Organization', 'OrganizationMember'])

interface Difference {
  where: string
  before: unknown
  after: unknown
}

function compare(before: Dump, after: Dump): Difference[] {
  const out: Difference[] = []
  for (const table of new Set([...before.keys(), ...after.keys()])) {
    const model = MODEL_OF.get(table) ?? table
    if (NOT_IN_A_BACKUP.has(model)) continue
    const was = new Map((before.get(table) ?? []).map((row) => [String(row.id), row]))
    const is = new Map((after.get(table) ?? []).map((row) => [String(row.id), row]))
    for (const [id, row] of was) {
      const restored = is.get(id)
      if (!restored) {
        out.push({ where: `${model} row ${id}`, before: 'present', after: 'missing' })
        continue
      }
      for (const column of Object.keys(row)) {
        if (JSON.stringify(row[column]) !== JSON.stringify(restored[column])) {
          out.push({ where: `${model}.${column}`, before: row[column], after: restored[column] })
        }
      }
    }
    for (const id of is.keys()) {
      if (!was.has(id)) {
        out.push({ where: `${model} row ${id}`, before: 'missing', after: 'present' })
      }
    }
  }
  return out
}

/**
 * What a restore is allowed to change, and why. Keyed as the differences
 * are named: `Model.column`, or `Model row <id>` for a row that is lost or
 * appears.
 */
const OWNED_BY_WHOEVER_RESTORES =
  'The row is owned by whoever restores the backup: the column is required, and the account the file names may not exist here.'
const EXPECTED: Readonly<Record<string, string>> = {
  'AppSetting.userId': OWNED_BY_WHOEVER_RESTORES,
  'CustomFieldDefinition.userId': OWNED_BY_WHOEVER_RESTORES,
  'Customer.userId': OWNED_BY_WHOEVER_RESTORES,
  'InspectionReminderCampaign.createdById': OWNED_BY_WHOEVER_RESTORES,
  'InventoryPart.userId': OWNED_BY_WHOEVER_RESTORES,
  'LaborPreset.userId': OWNED_BY_WHOEVER_RESTORES,
  'Quote.userId': OWNED_BY_WHOEVER_RESTORES,
  'ScheduledMessage.createdById': OWNED_BY_WHOEVER_RESTORES,
  'StockMovement.userId': OWNED_BY_WHOEVER_RESTORES,
  'TireSet.userId': OWNED_BY_WHOEVER_RESTORES,
  'TireWarehouse.userId': OWNED_BY_WHOEVER_RESTORES,
  'Vehicle.userId': OWNED_BY_WHOEVER_RESTORES,
}

/** What differs only when the numbers are zero. */
const NO_PERIOD =
  'A warranty of zero months or zero distance is no period, stored as none (normalizeWarranty), as the editor stores it.'
const EXPECTED_AT_ZERO: Readonly<Record<string, string>> = {
  'Quote.warrantyMonths': NO_PERIOD,
  'Quote.warrantyMileage': NO_PERIOD,
  'ServiceRecord.warrantyMonths': NO_PERIOD,
  'ServiceRecord.warrantyMileage': NO_PERIOD,
}

/**
 * Columns the seed leaves empty, and why. Everything else must hold a value
 * before the export, or the comparison says nothing about it.
 */
const IMPORT_BATCH =
  'Spreadsheet import batches are not in a backup, so nothing is there to point at.'
const ONE_PARENT = 'The row belongs to one kind of parent; this is the column for the other kind.'
const LEFT_EMPTY: Readonly<Record<string, string>> = {
  'Customer.importBatchId': IMPORT_BATCH,
  'Inspection.importBatchId': IMPORT_BATCH,
  'ServiceRecord.importBatchId': IMPORT_BATCH,
  'Vehicle.importBatchId': IMPORT_BATCH,
  'Reminder.vehicleId': ONE_PARENT,
  'ServiceRecord.vehicleId': ONE_PARENT,
  'StatusReport.inspectionId': ONE_PARENT,
  'StatusReport.serviceRecordId': ONE_PARENT,
  'StoredImage.inventoryPartId': ONE_PARENT,
  'StoredImage.tireMeasurementId': ONE_PARENT,
}

const describeDb = url ? describe : describe.skip

describeDb('a backup round trip', () => {
  beforeAll(async () => {
    ;({ db } = await import('@/lib/db'))
    importCore = await import('@/lib/backup/import')
    buildData = await import('@/lib/backup/build-data')
    tableNames = await listTables()
    expect(tableNames.length).toBeGreaterThan(50)
  })

  afterAll(async () => {
    if (db) await db.$disconnect()
    rmSync(dataRoot, { recursive: true, force: true })
  })

  it.each([
    'filled',
    'zeros',
  ] as const)('restores every row, column and file into an empty workshop (%s)', async (variant) => {
    await emptyDatabase()
    rmSync(path.join(dataRoot, 'uploads'), { recursive: true, force: true })
    await createWorkshop()
    const seeded = await seedRows(variant)
    seedFiles()
    expect(seeded).toBeGreaterThan(70)

    const before = await dumpAll()
    const filesBefore = filesOf(path.join(dataRoot, 'uploads', ORG))

    // Every column of every seeded row holds something, or the comparison
    // below proves nothing about it.
    const unfilled: string[] = []
    for (const [table, rows] of before) {
      const model = MODEL_OF.get(table) ?? table
      if (NOT_IN_A_BACKUP.has(model)) continue
      for (const row of rows) {
        for (const [column, value] of Object.entries(row)) {
          if (value === null) unfilled.push(`${model}.${column}`)
        }
      }
    }
    expect([...new Set(unfilled)].filter((column) => !(column in LEFT_EMPTY))).toEqual([])

    const backup = await exportWorkshop()

    // A workshop with nothing in it: the same people, and no record.
    await emptyDatabase()
    rmSync(path.join(dataRoot, 'uploads'), { recursive: true, force: true })
    await createWorkshop()

    await importCore.restoreFromDisk(
      { organizationId: ORG, userId: OWNER },
      { dataFile: backup.dataFile, filesDir: backup.filesDir }
    )

    const after = await dumpAll()
    const differences = compare(before, after)
    const expected = variant === 'zeros' ? { ...EXPECTED, ...EXPECTED_AT_ZERO } : EXPECTED
    const unexpected = differences.filter((d) => !(d.where in expected))
    const stale = Object.keys(expected).filter((key) => !differences.some((d) => d.where === key))

    if (process.env.BACKUP_ROUND_TRIP_REPORT) {
      writeFileSync(
        `${process.env.BACKUP_ROUND_TRIP_REPORT}.${variant}.json`,
        JSON.stringify({ seeded, unfilled, differences, stale }, null, 2)
      )
    }

    expect(
      unexpected.map((d) => `${d.where}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}`)
    ).toEqual([])
    expect(stale, 'listed as expected to differ, but came back as it was').toEqual([])
    expect(filesOf(path.join(dataRoot, 'uploads', ORG))).toEqual(filesBefore)
  })

  it('keeps a quote tied to its tire set and inspection when the backup carries only quotes', async () => {
    // A selective export leaves the tire hotel and the inspections where they
    // are. The quotes are replaced, and each still belongs to the set and the
    // inspection it was raised from, because both are still in the workshop.
    await emptyDatabase()
    await createWorkshop()
    await seedRows('filled')

    const links = () =>
      db.quote.findMany({
        where: { organizationId: ORG },
        select: { id: true, tireSetId: true, inspectionId: true },
        orderBy: { id: 'asc' },
      })
    const before = await links()
    expect(before.length).toBeGreaterThan(0)
    expect(before.every((quote) => quote.tireSetId && quote.inspectionId)).toBe(true)

    const backup = await exportWorkshop(['quotes'])
    const carried = (JSON.parse(backup.text) as { data: Record<string, unknown> }).data
    expect(carried.quotes).toBeTruthy()
    expect(carried.tireSets).toBeUndefined()
    expect(carried.inspections).toBeUndefined()

    await importCore.restoreFromDisk(
      { organizationId: ORG, userId: OWNER },
      { dataFile: backup.dataFile, filesDir: backup.filesDir }
    )

    expect(await links()).toEqual(before)
  })
})
