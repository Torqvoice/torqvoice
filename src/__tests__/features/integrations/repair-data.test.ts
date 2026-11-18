import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn() }))
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (k: string) => k) }))
vi.mock('@/features/integrations/Lib/display-name', () => ({
  connectorName: () => 'Open Labor Project',
}))
vi.mock('@/features/integrations/Lib/connections', () => ({ loadConnection: vi.fn() }))

/**
 * The stored answers as a table in memory, with the few queries the guide
 * runs against it, so storing, deleting and refreshing are tested the way
 * they behave rather than as a list of calls.
 */
interface Row {
  id: string
  source: string
  owner: string
  connectionId: string | null
  kind: string
  lookupKey: string
  version: number
  data: unknown
  fetchedAt: Date
}
const table: Row[] = []
function matches(row: Row, where: Record<string, unknown>) {
  return Object.entries(where).every(([k, v]) => {
    const value = row[k as keyof Row]
    if (v && typeof v === 'object' && 'in' in (v as object))
      return (v as { in: unknown[] }).in.includes(value)
    return value === v
  })
}
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(async () => ({ isSuperAdmin: false })) },
    vehicle: { findFirst: vi.fn() },
    integrationConnection: { findMany: vi.fn() },
    repairDataCache: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        table.filter((r) => matches(r, where)).map((r) => ({ ...r }))
      ),
      count: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          table.filter((r) => matches(r, where)).length
      ),
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const gone = table.filter((r) => matches(r, where))
        for (const r of gone) table.splice(table.indexOf(r), 1)
        return { count: gone.length }
      }),
      upsert: vi.fn(
        async (args: {
          where: { source_owner_kind_lookupKey: Record<string, string> }
          create: Omit<Row, 'id' | 'fetchedAt'>
          update: Partial<Row>
        }) => {
          const key = args.where.source_owner_kind_lookupKey
          const found = table.find((r) => matches(r, key))
          if (found) Object.assign(found, args.update)
          else table.push({ id: `row${table.length + 1}`, fetchedAt: new Date(), ...args.create })
        }
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const found = table.find((r) => r.id === where.id)
        if (found) Object.assign(found, data)
      }),
    },
  },
}))

import {
  getRepairData,
  isRepairDataAvailable,
  unlockRepairDataItem,
} from '@/features/integrations/Actions/repairDataActions'
import { loadConnection } from '@/features/integrations/Lib/connections'
import {
  CHECK_PLAN_JOB,
  clearRepairDataCache,
  litresOf,
  matchVariant,
  PLATFORM_OWNER,
  pickVariant,
  REFRESH_AFTER_DAYS,
  repairDataJobs,
  usesServerKey,
} from '@/features/integrations/Lib/repair-data'
import {
  type ConnectorContext,
  type LaborTime,
  type RepairDataAnswer,
  RepairDataKeyRejected,
  type RepairDataReply,
} from '@/features/integrations/Lib/types'
import { manifest, SERVER_KEY_ENV } from '@/integrations/openlaborproject/manifest'
import { mapLaborTime, toAnswer } from '@/integrations/openlaborproject/server'
import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'

const FIXTURES = path.join(__dirname, 'fixtures/openlaborproject')
function answerOf(name: string): RepairDataAnswer<LaborTime> {
  const body = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf-8'))
  const answer = toAnswer(body.data, 'laborTimes', mapLaborTime) as RepairDataAnswer<LaborTime>
  return { ...answer, matchedBy: 'model', region: 'US' }
}
/** Every job unlocked, the way a paid key answers. */
function paidAnswer(): RepairDataAnswer<LaborTime> {
  const answer = answerOf('labor-model')
  for (const v of answer.variants) {
    v.items = v.items.map((i, n) => ({
      ...i,
      hours: i.hours ?? 1 + n / 10,
      confidence: i.confidence ?? (n % 2 ? 'estimated' : 'high'),
      locked: false,
    }))
  }
  return answer
}
function paid(answer = paidAnswer()): RepairDataReply<LaborTime> {
  return { answer, keep: true }
}
function free(answer: RepairDataAnswer<LaborTime> | null = answerOf('labor-model')) {
  return { answer, keep: false }
}

const laborTimes = vi.fn()
const fluidSpecs = vi.fn()
let ctx: ConnectorContext

function connected(settings: Record<string, unknown> = {}, ...connectorIds: string[]) {
  const ids = connectorIds.length ? connectorIds : ['openlaborproject']
  vi.mocked(db.integrationConnection.findMany).mockResolvedValue(
    ids.map((connectorId) => ({ id: 'conn1', connectorId, settings })) as never
  )
  ctx.connection.settings = settings
}

function vehicle(fields: Record<string, unknown> = {}) {
  vi.mocked(db.vehicle.findFirst).mockResolvedValue({
    make: 'Ford',
    model: 'F-150',
    year: 2018,
    vin: null,
    engineSize: '5.0 L',
    fuelType: 'gasoline',
    ...fields,
  } as never)
}

let org = 0
beforeEach(() => {
  vi.clearAllMocks()
  clearRepairDataCache()
  table.length = 0
  // A fresh organisation per case, so the per-minute lookup budget never runs out.
  org += 1
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'u1', email: 'a@b.c', name: 'A', isSuperAdmin: false },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: `org${org}`,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(getFeatures).mockResolvedValue({ integrations: true } as never)
  ctx = {
    connection: {
      id: 'conn1',
      organizationId: `org${org}`,
      connectorId: 'openlaborproject',
      settings: {},
      state: {},
      externalAccountId: null,
    },
    credentials: { apiKey: 'workshop-key' },
    log: vi.fn(async () => undefined),
    saveState: vi.fn(async (patch: Record<string, unknown>) => {
      ctx.connection.state = { ...ctx.connection.state, ...patch }
    }),
  } as unknown as ConnectorContext
  vi.mocked(loadConnection).mockImplementation(
    async () =>
      ({
        ctx,
        server: { manifest, laborTimes, fluidSpecs },
        status: 'active',
      }) as never
  )
  connected()
  vehicle()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

async function open(input: Partial<Parameters<typeof getRepairData>[0]> = {}) {
  const res = await getRepairData({ vehicleId: 'v1', kind: 'labor', ...input })
  if (res.data?.status !== 'found') throw new Error(`not found: ${JSON.stringify(res)}`)
  return res.data.value
}

describe('isRepairDataAvailable', () => {
  it('offers labor times and fluids once Open Labor Project is connected', async () => {
    expect((await isRepairDataAvailable()).data).toEqual({ labor: true, fluids: true })
  })

  it('leaves the fluids tab out when the workshop turned it off', async () => {
    connected({ fluids: false })
    expect((await isRepairDataAvailable()).data).toEqual({ labor: true, fluids: false })
  })

  it('offers nothing without a connection, or when the plan has no integrations', async () => {
    connected({}, 'nhtsa')
    expect((await isRepairDataAvailable()).data).toEqual({ labor: false, fluids: false })
    connected()
    vi.mocked(getFeatures).mockResolvedValue({ integrations: false } as never)
    expect((await isRepairDataAvailable()).data).toEqual({ labor: false, fluids: false })
  })
})

describe('getRepairData', () => {
  it("opens on the engine that matches the vehicle's and sends that engine's jobs only", async () => {
    laborTimes.mockResolvedValue(free())
    const view = await open()
    expect(view).toMatchObject({
      connector: 'openlaborproject',
      source: 'Open Labor Project',
      logo: '/images/integrations/openlaborproject.svg',
      region: 'US',
      selected: 2,
      match: 'engine',
      hidden: 0,
    })
    expect(view.variants.map((v) => v.label)).toEqual([
      '2.7L V6 EcoBoost, RWD',
      '3.0L V6 Power Stroke Diesel, RWD',
      '5.0L V8 Coyote, 4WD',
    ])
    expect(view.items).toHaveLength(4)
    expect(laborTimes).toHaveBeenCalledWith(ctx, {
      make: 'Ford',
      model: 'F-150',
      year: 2018,
      vin: undefined,
      variant: undefined,
      item: undefined,
    })
  })

  it('switches engine from the remembered answer without another call', async () => {
    laborTimes.mockResolvedValue(free())
    await open()
    const view = await open({
      variant: { engineId: '2.7l-v6-ecoboost', drivetrain: 'rwd', vehicleId: null },
    })
    expect(view.selected).toBe(0)
    expect(view.match).toBe('chosen')
    expect(laborTimes).toHaveBeenCalledTimes(1)
  })

  it('warns when no listed engine is the one on file', async () => {
    laborTimes.mockResolvedValue(free())
    vehicle({ engineSize: '', fuelType: 'electric' })
    expect((await open()).match).toBe('none')
  })

  it("leaves out times below the workshop's minimum confidence and says how many", async () => {
    connected({ minConfidence: 'high' })
    laborTimes.mockResolvedValue(paid())
    const view = await open()
    expect(view.items.every((i) => i.confidence === 'high' || i.confidence === 'oem')).toBe(true)
    expect(view.hidden).toBeGreaterThan(0)
    expect(view.items.length + view.hidden).toBe(4)
    expect(view.prefs.minConfidence).toBe('high')
  })

  it('says the source has nothing when it does not know the vehicle', async () => {
    laborTimes.mockResolvedValue(free(null))
    expect((await getRepairData({ vehicleId: 'v1', kind: 'labor' })).data).toEqual({
      status: 'none',
    })
  })

  it("hands the source's refusal to the dialog instead of failing the action", async () => {
    laborTimes.mockRejectedValue(new Error('Open Labor Project: Daily limit reached.'))
    const res = await getRepairData({ vehicleId: 'v1', kind: 'labor' })
    expect(res.success).toBe(true)
    expect(res.data).toEqual({
      status: 'failed',
      message: 'Open Labor Project: Daily limit reached.',
    })
  })

  it('asks for a make, model and year before calling out', async () => {
    vehicle({ model: ' ' })
    const res = await getRepairData({ vehicleId: 'v1', kind: 'labor' })
    expect(res.data?.status).toBe('failed')
    expect(laborTimes).not.toHaveBeenCalled()
  })

  it("looks up only this workshop's own vehicles", async () => {
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(null)
    const res = await getRepairData({ vehicleId: 'someone-elses', kind: 'labor' })
    expect(res.data).toEqual({ status: 'failed', message: 'Vehicle not found' })
    expect(vi.mocked(db.vehicle.findFirst).mock.calls[0][0]).toMatchObject({
      where: { id: 'someone-elses', organizationId: `org${org}` },
    })
  })

  it('refuses an engine id that is not one the source hands out', async () => {
    const res = await getRepairData({
      vehicleId: 'v1',
      kind: 'labor',
      variant: { engineId: '../../etc', drivetrain: null, vehicleId: null },
    })
    expect(res.success).toBe(false)
    expect(laborTimes).not.toHaveBeenCalled()
  })

  it('will not open fluids the workshop turned off', async () => {
    connected({ fluids: false })
    const res = await getRepairData({ vehicleId: 'v1', kind: 'fluids' })
    expect(res.data?.status).toBe('failed')
    expect(fluidSpecs).not.toHaveBeenCalled()
  })
})

describe('asking the source as little as possible', () => {
  it('asks for fluids under the model name the labor lookup found', async () => {
    laborTimes.mockResolvedValue(free({ ...answerOf('labor-model'), modelId: 'f-150-crew' }))
    fluidSpecs.mockResolvedValue({ answer: null, keep: false })
    await open()
    await getRepairData({ vehicleId: 'v1', kind: 'fluids' })
    expect(fluidSpecs.mock.calls[0][1]).toMatchObject({ modelId: 'f-150-crew' })
  })

  it('asks for one value under the name the whole list was found under', async () => {
    laborTimes.mockResolvedValueOnce(free({ ...answerOf('labor-model'), modelId: 'f-150-crew' }))
    await open()
    laborTimes.mockResolvedValueOnce(free(null))
    await unlockRepairDataItem({
      vehicleId: 'v1',
      kind: 'labor',
      variant: { engineId: '5.0l-v8-coyote', drivetrain: '4wd', vehicleId: null },
      item: 'water-pump',
    })
    expect(laborTimes.mock.calls[1][1]).toMatchObject({ modelId: 'f-150-crew', item: 'water-pump' })
  })

  it('remembers a vehicle the source has nothing for, so asking again costs no call', async () => {
    laborTimes.mockResolvedValue(free(null))
    await getRepairData({ vehicleId: 'v1', kind: 'labor' })
    vi.useFakeTimers({ now: Date.now() + 60 * 60_000, toFake: ['Date'] })
    expect((await getRepairData({ vehicleId: 'v1', kind: 'labor' })).data).toEqual({
      status: 'none',
    })
    expect(laborTimes).toHaveBeenCalledTimes(1)
  })
})

describe('stored answers', () => {
  it("keeps a paid key's answer, so the model year is never paid for twice", async () => {
    laborTimes.mockResolvedValue(paid())
    await open()
    expect(table).toHaveLength(1)
    expect(table[0]).toMatchObject({
      source: 'openlaborproject',
      owner: 'conn1',
      connectionId: 'conn1',
      kind: 'labor',
      lookupKey: 'ford|f-150|2018',
    })
    clearRepairDataCache()
    // Another vehicle of the same model year, written a little differently.
    vehicle({ make: ' ford ', model: 'F-150 ', vin: '1FTFW1E50JFA99999' })
    const view = await open()
    expect(view.items).toHaveLength(4)
    expect(laborTimes).toHaveBeenCalledTimes(1)
  })

  it('keeps nothing a free key fetched, and deletes what the key kept while it was paid', async () => {
    laborTimes.mockResolvedValueOnce(paid())
    await open()
    expect(table).toHaveLength(1)
    clearRepairDataCache()
    vehicle({ model: 'F-250' })
    laborTimes.mockResolvedValueOnce(free())
    await open()
    expect(table).toHaveLength(0)
  })

  it('keeps an answer only the VIN found under a digest of it, never the VIN', async () => {
    const answer = { ...paidAnswer(), matchedBy: 'vin' as const }
    laborTimes.mockResolvedValue(paid(answer))
    vehicle({ model: 'F150', vin: '1FTFW1E50JFA12345' })
    await open()
    expect(table[0].lookupKey).toMatch(/^vin:[0-9a-f]{64}$/)
    expect(JSON.stringify(table)).not.toContain('1FTFW1E50JFA12345')
  })

  it(`asks again once an answer is ${REFRESH_AFTER_DAYS} days old, and shows the old one if that fails`, async () => {
    laborTimes.mockResolvedValueOnce(paid())
    await open()
    clearRepairDataCache()
    table[0].fetchedAt = new Date(Date.now() - (REFRESH_AFTER_DAYS + 1) * 86_400_000)
    laborTimes.mockRejectedValueOnce(new Error('Open Labor Project could not be reached'))
    const view = await open()
    expect(view.items).toHaveLength(4)
    expect(laborTimes).toHaveBeenCalledTimes(2)
    expect(ctx.log).toHaveBeenCalledWith(
      'warn',
      'Showing a stored answer: the refresh failed',
      expect.anything()
    )
  })

  it('deletes everything the key fetched when the key is refused', async () => {
    laborTimes.mockResolvedValueOnce(paid())
    await open()
    clearRepairDataCache()
    table[0].fetchedAt = new Date(Date.now() - (REFRESH_AFTER_DAYS + 1) * 86_400_000)
    laborTimes.mockRejectedValueOnce(
      new RepairDataKeyRejected('Open Labor Project rejected the API key')
    )
    const res = await getRepairData({ vehicleId: 'v1', kind: 'labor' })
    expect(res.data).toEqual({
      status: 'failed',
      message: 'Open Labor Project rejected the API key',
    })
    expect(table).toHaveLength(0)
  })

  it('ignores a stored answer of an older shape', async () => {
    laborTimes.mockResolvedValue(paid())
    await open()
    clearRepairDataCache()
    table[0].version = 0
    await open()
    expect(laborTimes).toHaveBeenCalledTimes(2)
  })
})

describe('the key the server holds', () => {
  it('is used, and shared, only while the workshop has no key of its own', () => {
    expect(usesServerKey(manifest, {}, {})).toBe(false)
    expect(usesServerKey(manifest, {}, { [SERVER_KEY_ENV]: 'k' })).toBe(true)
    expect(usesServerKey(manifest, { apiKey: 'own' }, { [SERVER_KEY_ENV]: 'k' })).toBe(false)
  })

  it('stores what it fetched for every workshop, with no connection to go with', async () => {
    vi.stubEnv(SERVER_KEY_ENV, 'server-key')
    ctx.credentials = {}
    laborTimes.mockResolvedValue(paid())
    await open()
    expect(table[0]).toMatchObject({ owner: PLATFORM_OWNER, connectionId: null })
  })

  it("holds each workshop to a daily allowance of calls, counting only the source's", async () => {
    vi.stubEnv(SERVER_KEY_ENV, 'server-key')
    vi.stubEnv('REPAIR_DATA_SERVER_KEY_DAILY_LOOKUPS', '2')
    ctx.credentials = {}
    laborTimes.mockResolvedValue(free())
    await open()
    await open() // from memory: free
    clearRepairDataCache()
    await open()
    clearRepairDataCache()
    const res = await getRepairData({ vehicleId: 'v1', kind: 'labor' })
    expect(res.data?.status).toBe('failed')
    expect(laborTimes).toHaveBeenCalledTimes(2)
  })
})

describe('unlockRepairDataItem', () => {
  it('gets one job and keeps its hours for the next opening', async () => {
    laborTimes.mockResolvedValueOnce(free())
    await open()

    const one = answerOf('labor-one-job')
    // The same job for the 4WD variant the dialog opened on.
    one.variants[0].vehicleId = '92a92bb0-7293-4783-97e9-743c15473972'
    one.variants[0].drivetrain = '4wd'
    laborTimes.mockResolvedValueOnce(free(one))
    const variant = {
      engineId: '5.0l-v8-coyote',
      drivetrain: '4wd',
      vehicleId: '92a92bb0-7293-4783-97e9-743c15473972',
    }
    const res = await unlockRepairDataItem({
      vehicleId: 'v1',
      kind: 'labor',
      variant,
      item: 'water-pump',
    })
    expect(res.data).toMatchObject({ status: 'found', value: { id: 'water-pump', hours: 2.8 } })
    expect(laborTimes.mock.calls[1][1]).toMatchObject({ variant, item: 'water-pump' })

    const again = await open()
    expect(again.items.find((i) => i.id === 'water-pump')).toMatchObject({
      hours: 2.8,
      locked: false,
    })
    expect(laborTimes).toHaveBeenCalledTimes(2)
  })

  it("hides a value that comes back below the workshop's minimum confidence", async () => {
    connected({ minConfidence: 'high' })
    laborTimes.mockResolvedValueOnce(free())
    await open()
    const one = answerOf('labor-one-job') // water pump, rated medium
    one.variants[0].vehicleId = '92a92bb0-7293-4783-97e9-743c15473972'
    one.variants[0].drivetrain = '4wd'
    laborTimes.mockResolvedValueOnce(free(one))
    const res = await unlockRepairDataItem({
      vehicleId: 'v1',
      kind: 'labor',
      variant: {
        engineId: '5.0l-v8-coyote',
        drivetrain: '4wd',
        vehicleId: '92a92bb0-7293-4783-97e9-743c15473972',
      },
      item: 'water-pump',
    })
    expect(res.data).toEqual({ status: 'hidden' })
    // Opened again, the shown value is left out and counted with the rest.
    const again = await open()
    expect(again.items.find((i) => i.id === 'water-pump')).toBeUndefined()
    expect(again.hidden).toBeGreaterThan(0)
  })

  it('says so when the source would not unlock it', async () => {
    laborTimes.mockResolvedValue(free(null))
    const res = await unlockRepairDataItem({
      vehicleId: 'v1',
      kind: 'labor',
      variant: { engineId: '5.0l-v8-coyote', drivetrain: '4wd', vehicleId: null },
      item: 'water-pump',
    })
    expect(res.data).toEqual({ status: 'none' })
  })
})

describe('the daily plan check', () => {
  const plan = vi.fn<(c: ConnectorContext) => Promise<{ keep: boolean | null }>>()
  const run = () => repairDataJobs(manifest, plan)[CHECK_PLAN_JOB](ctx, {})

  async function storeOne() {
    laborTimes.mockResolvedValueOnce(paid())
    await open()
    expect(table).toHaveLength(1)
  }

  it('spends no call while nothing is stored', async () => {
    expect(await run()).toEqual({ summary: 'Nothing stored' })
    expect(plan).not.toHaveBeenCalled()
  })

  it('keeps the stored answers while the plan allows it', async () => {
    await storeOne()
    plan.mockResolvedValueOnce({ keep: true })
    await run()
    expect(table).toHaveLength(1)
  })

  it('deletes them once the plan is free again', async () => {
    await storeOne()
    plan.mockResolvedValueOnce({ keep: false })
    await run()
    expect(table).toHaveLength(0)
  })

  it('deletes them when the key is refused', async () => {
    await storeOne()
    plan.mockRejectedValueOnce(new RepairDataKeyRejected('refused'))
    await run()
    expect(table).toHaveLength(0)
  })

  it('leaves them when the source would not say', async () => {
    await storeOne()
    plan.mockResolvedValueOnce({ keep: null })
    await run()
    expect(table).toHaveLength(1)
  })

  it("leaves the server key's answers to the lookups made with it", async () => {
    vi.stubEnv(SERVER_KEY_ENV, 'server-key')
    ctx.credentials = {}
    expect(await run()).toEqual({ summary: 'Uses the server key' })
    expect(plan).not.toHaveBeenCalled()
  })
})

describe('matchVariant', () => {
  const variants = answerOf('labor-model').variants

  it('matches the displacement on file', () => {
    expect(matchVariant(variants, { engineSize: '2.7 L' })).toEqual({ index: 0, match: 'engine' })
    expect(matchVariant(variants, { engineSize: '5000 cc', fuelType: 'gasoline' })).toEqual({
      index: 2,
      match: 'engine',
    })
  })

  it('prefers the diesel for a diesel', () => {
    expect(matchVariant(variants, { fuelType: 'diesel' })).toEqual({ index: 1, match: 'fuel' })
  })

  it('says when no listed engine is the one on file', () => {
    // A diesel with no diesel listed, as a European car looked up in US data.
    const petrol = variants.filter((v) => !/diesel/i.test(v.engine))
    expect(matchVariant(petrol, { fuelType: 'diesel' }).match).toBe('none')
    expect(matchVariant(variants, { engineSize: '3.5 L' }).match).toBe('none')
  })

  it('keeps the first gasoline engine when nothing is known, and says so', () => {
    expect(matchVariant(variants, {})).toEqual({ index: 0, match: 'unknown' })
    expect(pickVariant(variants, {})).toBe(0)
  })

  it('reads litres from what the form holds', () => {
    expect(litresOf('5.0 L')).toBe(5)
    expect(litresOf('1,6')).toBe(1.6)
    expect(litresOf('1998 cc')).toBeCloseTo(1.998)
    expect(litresOf('')).toBeNull()
  })
})
