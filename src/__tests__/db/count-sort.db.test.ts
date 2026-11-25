/**
 * The count sorts on a real PostgreSQL (`npm run test:db`): the customer list
 * by vehicle count and the vehicle list by job count.
 *
 * Those two sorts read each batch in one SQL query, with the list's filters
 * written out in SQL beside the Prisma `where` every other sort uses. Walked
 * batch by batch, the SQL has to give exactly the rows Prisma's own where
 * finds, in the order Prisma's relation-count orderBy gives them, for every
 * filter: the search (wildcards in it included), archived, the inspection due
 * date, and each setting that widens the vehicle search.
 *
 * It makes one person and two workshops of its own and removes them again.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CustomerListFilters } from '@/features/customers/Lib/customerList.server'
import type {
  VehicleListFilters,
  VehicleSearchOptions,
} from '@/features/vehicles/Lib/vehicleList.server'
import type { Cursor } from '@/lib/keyset'

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
let customers: typeof import('@/features/customers/Lib/customerList.server')
let vehicles: typeof import('@/features/vehicles/Lib/vehicleList.server')
let organizationId = ''
let otherOrganizationId = ''
let userId = ''

const DAY = 86_400_000
const NOW = new Date()
/** Small batches, so every walk crosses several boundaries and plenty of ties. */
const TAKE = 4

/** Every id the SQL hands out, batch by batch, as the list would ask for them. */
async function walk(
  batch: (cursor: Cursor | null, take: number) => Promise<{ id: string; count: number }[]>
) {
  const ids: string[] = []
  let cursor: Cursor | null = null
  for (let guard = 0; guard < 200; guard++) {
    const found = await batch(cursor, TAKE + 1)
    const page = found.slice(0, TAKE)
    ids.push(...page.map((row) => row.id))
    const last = page[page.length - 1]
    if (found.length <= TAKE || !last) return ids
    cursor = { v: [last.count], id: last.id }
  }
  throw new Error('walk did not end')
}

const NAMES = [
  'Ada Berg',
  'Ola Nordmann',
  'Kari 50% Holm',
  'Per_Lund',
  'Back\\slash AS',
  'Volvo Berg',
  'Fjord Transport',
  'Berit Volvosen',
]

async function makeWorkshop(orgId: string) {
  const made: string[] = []
  for (let i = 0; i < NAMES.length * 2; i++) {
    const customer = await db.customer.create({
      data: {
        organizationId: orgId,
        userId,
        name: NAMES[i % NAMES.length],
        email: i % 3 === 0 ? null : `c${i}@example.com`,
        phone: i % 4 === 0 ? null : `+47 9${i % 5}0 00`,
        company: i % 2 === 0 ? null : ['Volvo', 'Fjord AS', '50_50 Ltd'][i % 3],
        customerNumber: i % 5 === 0 ? null : String(1000 + i),
      },
    })
    made.push(customer.id)
  }

  const makes = ['Volvo', 'Audi', 'Tesla', 'Ford', 'Volkswagen']
  for (let i = 0; i < 30; i++) {
    const vehicle = await db.vehicle.create({
      data: {
        organizationId: orgId,
        userId,
        // Every fourth customer has none; the rest have between one and three.
        customerId: i % 7 === 6 ? null : made[(i * 3) % made.length],
        make: makes[i % makes.length],
        model: i % 6 === 0 ? 'V70 50%' : i % 6 === 1 ? 'Golf_GTI' : `Model ${i % 4}`,
        year: 2008 + (i % 6),
        licensePlate: i % 5 === 0 ? null : `AB ${10000 + i}`,
        vin: i % 3 === 0 ? null : `YV1${String(i).padStart(14, '0')}`,
        hsn: i % 4 === 0 ? '0603' : i % 4 === 1 ? '0005' : null,
        tsn: i % 3 === 0 ? 'BFQ' : i % 3 === 1 ? 'AAA' : null,
        fleetNumber: i % 2 === 0 ? `U${12 + (i % 3)}` : null,
        isArchived: i % 9 === 4,
      },
    })
    if (i % 3 !== 2) {
      await db.vehicleInspectionStatus.create({
        data: {
          organizationId: orgId,
          vehicleId: vehicle.id,
          source: 'test',
          dueAt: i % 5 === 4 ? null : new Date(NOW.getTime() + ((i % 11) - 3) * 10 * DAY),
        },
      })
    }
    for (let j = 0; j < i % 4; j++) {
      await db.serviceRecord.create({
        data: {
          organizationId: orgId,
          vehicleId: vehicle.id,
          title: `Job ${j}`,
          serviceDate: new Date('2026-11-01'),
        },
      })
    }
    if (i % 4 === 1) {
      const type = await db.equipmentType.create({
        data: { name: `Crane ${stamp} ${orgId.slice(-4)} ${i}`, organizationId: orgId },
      })
      await db.equipmentItem.create({
        data: {
          organizationId: orgId,
          vehicleId: vehicle.id,
          typeId: type.id,
          serialNumber: `SN-9${i}`,
          // One item taken off: it no longer finds the vehicle.
          removedAt: i === 5 ? new Date() : null,
        },
      })
    }
  }
}

beforeAll(async () => {
  ;({ db } = await import('@/lib/db'))
  customers = await import('@/features/customers/Lib/customerList.server')
  vehicles = await import('@/features/vehicles/Lib/vehicleList.server')
  const user = await db.user.create({
    data: { name: `Count sort ${stamp}`, email: `count-sort-${stamp}@example.com` },
  })
  userId = user.id
  organizationId = (await db.organization.create({ data: { name: `Count sort ${stamp}` } })).id
  otherOrganizationId = (
    await db.organization.create({ data: { name: `Count sort other ${stamp}` } })
  ).id
  // The other workshop has the same rows: none of them may turn up.
  await makeWorkshop(organizationId)
  await makeWorkshop(otherOrganizationId)
})

afterAll(async () => {
  if (!db) return
  for (const orgId of [organizationId, otherOrganizationId]) {
    if (!orgId) continue
    await db.equipmentItem.deleteMany({ where: { organizationId: orgId } })
    await db.equipmentType.deleteMany({ where: { organizationId: orgId } })
    await db.serviceRecord.deleteMany({ where: { organizationId: orgId } })
    await db.vehicle.deleteMany({ where: { organizationId: orgId } })
    await db.customer.deleteMany({ where: { organizationId: orgId } })
    await db.organization.deleteMany({ where: { id: orgId } })
  }
  await db.user.deleteMany({ where: { id: userId } })
})

const CUSTOMER_FILTERS: CustomerListFilters[] = [
  {},
  { search: 'berg' },
  { search: 'BERG volvo' },
  { search: '50%' },
  { search: '_' },
  { search: 'Back\\' },
  { search: '+47 91' },
  { search: 'nobody at all' },
]

describe('the customer list by vehicle count', () => {
  for (const filters of CUSTOMER_FILTERS) {
    for (const dir of ['asc', 'desc'] as const) {
      it(`finds what Prisma finds, in its order: ${JSON.stringify(filters)} ${dir}`, async () => {
        const expected = await db.customer.findMany({
          where: customers.customerListWhere(organizationId, filters),
          orderBy: [{ vehicles: { _count: dir } }, { id: 'asc' }],
          select: { id: true },
        })
        const ids = await walk((cursor, take) =>
          customers.customerIdsByVehicleCount(organizationId, filters, dir, cursor, take)
        )
        expect(ids).toEqual(expected.map((row) => row.id))
      })
    }
  }

  it('finds something for the searches that should', async () => {
    const found = await db.customer.count({
      where: customers.customerListWhere(organizationId, { search: 'BERG volvo' }),
    })
    expect(found).toBeGreaterThan(0)
  })
})

const OFF: VehicleSearchOptions = { typeKeyOn: false, fleetNumberOn: false, equipmentOn: false }
const ON: VehicleSearchOptions = { typeKeyOn: true, fleetNumberOn: true, equipmentOn: true }

const VEHICLE_FILTERS: [VehicleListFilters, VehicleSearchOptions][] = [
  [{}, OFF],
  [{ archived: true }, OFF],
  [{ search: 'volvo' }, OFF],
  [{ search: 'volvo 2010' }, OFF],
  [{ search: 'ada / berg' }, OFF],
  [{ search: '50%' }, OFF],
  [{ search: 'golf_' }, OFF],
  [{ search: 'yv1' }, OFF],
  [{ search: '0603' }, { ...OFF, typeKeyOn: true }],
  [{ search: 'bfq' }, { ...OFF, typeKeyOn: true }],
  [{ search: '0603/BFQ' }, ON],
  [{ search: 'u12' }, { ...OFF, fleetNumberOn: true }],
  [{ search: 'sn-9' }, { ...OFF, equipmentOn: true }],
  [{ search: 'sn-95' }, { ...OFF, equipmentOn: true }],
  [{ inspectionDue: 'overdue' }, OFF],
  [{ inspectionDue: 30 }, OFF],
  [{ inspectionDue: 90 }, OFF],
  [{ search: 'u1 volvo', archived: true, inspectionDue: 90 }, ON],
]

describe('the vehicle list by job count', () => {
  for (const [filters, options] of VEHICLE_FILTERS) {
    for (const sortOrder of ['asc', 'desc'] as const) {
      it(`finds what Prisma finds, in its order: ${JSON.stringify({ ...filters, ...options })} ${sortOrder}`, async () => {
        const params = { ...filters, sortBy: 'services', sortOrder }
        const expected = await db.vehicle.findMany({
          where: vehicles.vehicleListWhereWith(organizationId, params, options, NOW),
          orderBy: [{ serviceRecords: { _count: sortOrder } }, { id: 'asc' }],
          select: { id: true },
        })
        const ids = await walk((cursor, take) =>
          vehicles.vehicleIdsByServiceCount(organizationId, params, options, NOW, cursor, take)
        )
        expect(ids).toEqual(expected.map((row) => row.id))
      })
    }
  }

  it('finds something for each widening setting', async () => {
    const count = (filters: VehicleListFilters, options: VehicleSearchOptions) =>
      db.vehicle.count({
        where: vehicles.vehicleListWhereWith(organizationId, filters, options, NOW),
      })
    for (const [filters, options] of VEHICLE_FILTERS.slice(8, 13)) {
      expect(await count(filters, options), JSON.stringify(filters)).toBeGreaterThan(0)
    }
    // The only item with that serial was taken off its vehicle.
    expect(await count({ search: 'sn-95' }, { ...OFF, equipmentOn: true })).toBe(0)
  })
})
