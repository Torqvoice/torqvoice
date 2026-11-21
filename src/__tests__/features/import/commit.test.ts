/**
 * Writing an import. Rows go in chunks, each chunk in one transaction; a chunk
 * that fails is written again a row at a time, so one bad row costs only
 * itself. When the bad row is the one that was to create a vehicle other rows
 * share, the next row creates it instead and the rest still land on it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Store {
  customers: Record<string, unknown>[]
  vehicles: Record<string, unknown>[]
  services: Record<string, unknown>[]
}

let committed: Store
let seq = 0
/** What the import wrote over vehicles that were already there. */
let vehicleUpdates: { where: { id: string }; data: Record<string, unknown> }[] = []
/** Vehicles the workshop already has, for a vehicle sheet to match. */
let existingVehicles: Record<string, unknown>[] = []

/** A transaction client that keeps its writes aside until the transaction succeeds. */
function txClient(pending: Store) {
  const create = (into: Record<string, unknown>[], prefix: string) =>
    vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const id = `${prefix}${++seq}`
      into.push({ id, ...data })
      return { id }
    })
  return {
    customer: { create: create(pending.customers, 'c'), update: vi.fn() },
    vehicle: {
      create: create(pending.vehicles, 'v'),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        vehicleUpdates.push(args)
        return { id: args.where.id }
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    serviceRecord: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        // Stands in for a row the database refuses.
        if (data.title === 'Refused') throw new Error('write refused')
        const id = `s${++seq}`
        pending.services.push({ id, ...data })
        return { id }
      }),
    },
  }
}

const db = {
  $transaction: vi.fn(async (fn: (tx: ReturnType<typeof txClient>) => Promise<unknown>) => {
    const pending: Store = { customers: [], vehicles: [], services: [] }
    // A row chunk writes through the transaction client; the readings, settled
    // afterwards, read and write the vehicles as they are (the db below), under
    // the vehicle's row lock.
    const tx = txClient(pending)
    const result = await fn({
      ...tx,
      $queryRaw: async () => [],
      serviceRecord: { ...tx.serviceRecord, findFirst: db.serviceRecord.findFirst },
      vehicle: {
        ...tx.vehicle,
        findFirst: db.vehicle.findFirst,
        updateMany: db.vehicle.updateMany,
      },
    } as never)
    committed.customers.push(...pending.customers)
    committed.vehicles.push(...pending.vehicles)
    committed.services.push(...pending.services)
    return result
  }),
  customer: { findMany: vi.fn(async () => []) },
  vehicle: {
    findMany: vi.fn(async () => existingVehicles),
    // The rule reads the vehicle, then moves it up only as it was read.
    findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
      const car = committed.vehicles.find((v) => v.id === where.id)
      return car
        ? {
            mileage: (car.mileage as number | undefined) ?? 0,
            readingJobId: (car.readingJobId as string | undefined) ?? null,
            readingBeforeJob: (car.readingBeforeJob as number | undefined) ?? null,
          }
        : null
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string; mileage: number }
        data: { mileage: number; readingJobId: string; readingBeforeJob: number | null }
      }) => {
        const car = committed.vehicles.find((v) => v.id === where.id)
        if (!car || ((car.mileage as number | undefined) ?? 0) !== where.mileage)
          return { count: 0 }
        Object.assign(car, data)
        return { count: 1 }
      }
    ),
  },
  serviceRecord: {
    // The plan reads what exists (nothing); the readings are settled from
    // what this import wrote.
    findMany: vi.fn(async (args?: { where?: { vehicleId?: string; importBatchId?: string } }) =>
      args?.where?.importBatchId
        ? committed.services.filter(
            (s) => s.vehicleId === args.where?.vehicleId && ((s.mileage as number | null) ?? 0) > 0
          )
        : []
    ),
    // The rule's one question: a later job on the vehicle with a reading?
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: { vehicleId: string; id: { not: string }; OR: [{ startDateTime: { gt: Date } }] }
      }) =>
        committed.services.find(
          (s) =>
            s.vehicleId === where.vehicleId &&
            s.id !== where.id.not &&
            s.mileage != null &&
            (s.startDateTime as Date) > where.OR[0].startDateTime.gt
        ) ?? null
    ),
  },
  importBatch: {
    create: vi.fn(async () => ({ id: 'batch' })),
    update: vi.fn(async () => ({})),
  },
}
vi.mock('@/lib/db', () => ({ db }))

vi.mock('@/lib/with-auth', () => ({
  withAuth: async (fn: (ctx: { organizationId: string; userId: string }) => Promise<unknown>) => {
    try {
      return { success: true, data: await fn({ organizationId: 'org', userId: 'user' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))
vi.mock('@/lib/demo', () => ({ demoGuard: vi.fn() }))
vi.mock('@/lib/features', () => ({
  FeatureGatedError: class extends Error {},
  getFeatures: async () => ({ maxCustomers: 1000 }),
}))
vi.mock('@/lib/customer-limit', () => ({ countCustomersTowardLimit: async () => 0 }))
vi.mock('@/lib/ai', () => ({
  completionTuning: vi.fn(),
  createClient: vi.fn(),
  getAiConfig: vi.fn(),
}))
vi.mock('@/lib/ai-error', () => ({ describeAiError: vi.fn() }))
vi.mock('@/lib/files/manager', () => ({ releaseFiles: vi.fn() }))
vi.mock('@/lib/files/collect', () => ({
  serviceRecordFileUrls: vi.fn(),
  vehicleFileUrls: vi.fn(),
}))
vi.mock('@/features/vehicles/Lib/typeKeySetting', () => ({ isTypeKeyEnabled: async () => false }))
// The Reference / PO field is off here, as it is for every workshop that has
// not asked for it; the rest of the module is the real one.
vi.mock('@/features/customer-reference/Lib/referenceSetting', async (original) => ({
  ...(await original<typeof import('@/features/customer-reference/Lib/referenceSetting')>()),
  isCustomerReferenceEnabled: vi.fn(async () => false),
}))
// Nor does it record a fleet number.
vi.mock('@/features/vehicles/Lib/fleetNumberSetting', async (original) => ({
  ...(await original<typeof import('@/features/vehicles/Lib/fleetNumberSetting')>()),
  isFleetNumberEnabled: vi.fn(async () => false),
}))
vi.mock('@/i18n/organization-translator', () => ({
  organizationTranslator: async () => () => 'Imported service',
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const TOKEN = '6f1c2b0e-8d4a-4c7e-9a3b-2f5d6e7a8b9c'
const HEADER = ['Date', 'Rego', 'Make', 'Model', 'Year', 'Job']
let rows: string[][] = []
let stagedEntity = 'services'
vi.mock('@/features/import/Lib/staging', () => ({
  readStagedImport: async () => ({
    token: TOKEN,
    organizationId: 'org',
    fileName: 'history.csv',
    entity: stagedEntity,
    presetId: null,
    sheet: { format: 'csv', columns: HEADER, rows },
    createdAt: new Date().toISOString(),
  }),
  writeImportProgress: vi.fn(),
  discardStagedImport: vi.fn(async () => undefined),
  readImportProgress: vi.fn(),
}))

const { commitImport } = await import('@/features/import/Actions/importActions')

const input = {
  token: TOKEN,
  mapping: {
    '0': 'service.date',
    '1': 'vehicle.licensePlate',
    '2': 'vehicle.make',
    '3': 'vehicle.model',
    '4': 'vehicle.year',
    '5': 'service.title',
  },
  options: {
    entity: 'services',
    dateFormat: 'auto',
    decimalSeparator: 'auto',
    defaultCountryCode: null,
    duplicates: 'update',
  },
}

/** Commit and hand back the result, failing the test when the action itself fails. */
async function run() {
  const res = await commitImport(input)
  if (!('data' in res) || !res.data) throw new Error(`import failed: ${res.error}`)
  return res.data
}

beforeEach(() => {
  committed = { customers: [], vehicles: [], services: [] }
  seq = 0
  vehicleUpdates = []
  existingVehicles = []
  stagedEntity = 'services'
})

describe('commitImport', () => {
  it('fails only the row the database refuses, not the rows written with it', async () => {
    rows = [
      ['2014-12-10', 'ABC123', 'Toyota', 'Hilux', '2000', 'Oil change'],
      ['2014-12-12', 'ZOV432', 'Kenworth', 'K125', '1974', 'Refused'],
      ['2014-12-16', 'OVB334', 'Land Rover', 'Discovery', '1998', 'Brakes'],
    ]
    const result = await run()
    expect(result).toMatchObject({ created: 2, failed: 1 })
    expect(result.failures.map((f) => f.index)).toEqual([1])
    expect(committed.services.map((s) => s.title)).toEqual(['Oil change', 'Brakes'])
  })

  it('lets the next row create a shared vehicle when the row meant to could not be written', async () => {
    rows = [
      ['2014-12-10', 'ABC123', 'Toyota', 'Hilux', '2000', 'Refused'],
      ['2014-12-12', 'ABC123', 'Toyota', 'Hilux', '2000', 'Oil change'],
      ['2014-12-16', 'ABC123', 'Toyota', 'Hilux', '2000', 'Brakes'],
    ]
    const result = await run()
    expect(result).toMatchObject({ created: 2, failed: 1 })
    expect(result.failures.map((f) => f.index)).toEqual([0])
    // One car, with both jobs on it.
    expect(committed.vehicles).toHaveLength(1)
    const carId = committed.vehicles[0].id
    expect(committed.services.map((s) => [s.title, s.vehicleId])).toEqual([
      ['Oil change', carId],
      ['Brakes', carId],
    ])
  })

  it('leaves each vehicle on its newest reading, whatever order the rows come in', async () => {
    rows = [
      ['2015-06-01', 'ABC123', 'Toyota', 'Hilux', '2000', 'Brakes', '152000'],
      ['2014-12-10', 'ABC123', 'Toyota', 'Hilux', '2000', 'Oil change', '148000'],
      // A slip in an old row: a digit too many, on a job before the newest.
      ['2015-01-15', 'ABC123', 'Toyota', 'Hilux', '2000', 'Tyres', '1490000'],
      // Oldest first on the other car, with the same slip in the middle: it
      // must not stick just because it was written before the newest row.
      ['2014-03-01', 'OVB334', 'Land Rover', 'Discovery', '1998', 'Service', '90000'],
      ['2014-09-01', 'OVB334', 'Land Rover', 'Discovery', '1998', 'Service', '950000'],
      ['2015-03-01', 'OVB334', 'Land Rover', 'Discovery', '1998', 'Service', '101000'],
    ]
    const res = await commitImport({
      ...input,
      mapping: { ...input.mapping, '6': 'service.mileage' },
    })
    if (!('data' in res) || !res.data) throw new Error(`import failed: ${res.error}`)
    expect(res.data).toMatchObject({ created: 6, failed: 0 })
    // Every reading is kept on its job, as the file had it.
    expect(committed.services.map((s) => s.mileage)).toEqual([
      152000, 148000, 1490000, 90000, 950000, 101000,
    ])
    expect(committed.vehicles.map((v) => [v.licensePlate, v.mileage])).toEqual([
      ['ABC123', 152000],
      ['OVB334', 101000],
    ])
    // Each vehicle knows which job set its reading, so correcting that job
    // later brings the vehicle with it.
    const jobOf = (title: string, mileage: number) =>
      committed.services.find((s) => s.title === title && s.mileage === mileage)?.id
    expect(committed.vehicles.map((v) => v.readingJobId)).toEqual([
      jobOf('Brakes', 152000),
      jobOf('Service', 101000),
    ])
  })

  it('makes a reading from a vehicle sheet the vehicle’s own, no longer a job’s', async () => {
    stagedEntity = 'vehicles'
    existingVehicles = [
      {
        id: 'v-existing',
        licensePlate: 'ABC123',
        vin: null,
        make: 'Toyota',
        model: 'Hilux',
        year: 2000,
        customerId: null,
      },
    ]
    rows = [['', 'ABC123', 'Toyota', 'Hilux', '2000', '', '149000']]
    const res = await commitImport({
      ...input,
      mapping: {
        '1': 'vehicle.licensePlate',
        '2': 'vehicle.make',
        '3': 'vehicle.model',
        '4': 'vehicle.year',
        '6': 'vehicle.mileage',
      },
      options: { ...input.options, entity: 'vehicles' },
    })
    if (!('data' in res) || !res.data) throw new Error(`import failed: ${res.error}`)
    expect(vehicleUpdates).toHaveLength(1)
    expect(vehicleUpdates[0]).toMatchObject({
      where: { id: 'v-existing' },
      data: { mileage: 149000, readingJobId: null, readingBeforeJob: null },
    })
  })
})
