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
      update: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    serviceRecord: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        // Stands in for a row the database refuses.
        if (data.title === 'Refused') throw new Error('write refused')
        pending.services.push(data)
        return { id: `s${++seq}` }
      }),
    },
  }
}

const db = {
  $transaction: vi.fn(async (fn: (tx: ReturnType<typeof txClient>) => Promise<unknown>) => {
    const pending: Store = { customers: [], vehicles: [], services: [] }
    const result = await fn(txClient(pending))
    committed.customers.push(...pending.customers)
    committed.vehicles.push(...pending.vehicles)
    committed.services.push(...pending.services)
    return result
  }),
  customer: { findMany: vi.fn(async () => []) },
  vehicle: { findMany: vi.fn(async () => []) },
  serviceRecord: { findMany: vi.fn(async () => []) },
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
vi.mock('@/i18n/organization-translator', () => ({
  organizationTranslator: async () => () => 'Imported service',
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const TOKEN = '6f1c2b0e-8d4a-4c7e-9a3b-2f5d6e7a8b9c'
const HEADER = ['Date', 'Rego', 'Make', 'Model', 'Year', 'Job']
let rows: string[][] = []
vi.mock('@/features/import/Lib/staging', () => ({
  readStagedImport: async () => ({
    token: TOKEN,
    organizationId: 'org',
    fileName: 'history.csv',
    entity: 'services',
    presetId: null,
    sheet: { format: 'csv', columns: HEADER, rows },
    createdAt: new Date().toISOString(),
  }),
  writeImportProgress: vi.fn(),
  discardStagedImport: vi.fn(async () => {}),
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
})
