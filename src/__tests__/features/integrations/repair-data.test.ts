import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(async () => ({ isSuperAdmin: false })) },
    vehicle: { findFirst: vi.fn() },
    integrationConnection: { findMany: vi.fn() },
  },
}))

import {
  getRepairData,
  isRepairDataAvailable,
  unlockRepairDataItem,
} from '@/features/integrations/Actions/repairDataActions'
import { loadConnection } from '@/features/integrations/Lib/connections'
import {
  clearRepairDataCache,
  litresOf,
  pickVariant,
} from '@/features/integrations/Lib/repair-data'
import type { LaborTime, RepairDataAnswer } from '@/features/integrations/Lib/types'
import { mapLaborTime, toAnswer } from '@/integrations/openlaborproject/server'
import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'

const FIXTURES = path.join(__dirname, 'fixtures/openlaborproject')
function answerOf(name: string): RepairDataAnswer<LaborTime> {
  const body = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf-8'))
  return toAnswer(body.data, 'laborTimes', mapLaborTime) as RepairDataAnswer<LaborTime>
}

const laborTimes = vi.fn()
const fluidSpecs = vi.fn()

function connected(...connectorIds: string[]) {
  vi.mocked(db.integrationConnection.findMany).mockResolvedValue(
    connectorIds.map((connectorId) => ({ id: `conn-${connectorId}`, connectorId })) as never
  )
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
  vi.mocked(loadConnection).mockResolvedValue({
    ctx: { connection: { organizationId: `org${org}` } },
    server: {
      manifest: { id: 'openlaborproject', name: 'Open Labor Project' },
      laborTimes,
      fluidSpecs,
    },
  } as never)
  connected('openlaborproject')
  vehicle()
})

describe('isRepairDataAvailable', () => {
  it('offers labor times and fluids once Open Labor Project is connected', async () => {
    expect((await isRepairDataAvailable()).data).toEqual({ labor: true, fluids: true })
  })

  it('offers nothing without a connection, or when the plan has no integrations', async () => {
    connected('nhtsa')
    expect((await isRepairDataAvailable()).data).toEqual({ labor: false, fluids: false })
    connected('openlaborproject')
    vi.mocked(getFeatures).mockResolvedValue({ integrations: false } as never)
    expect((await isRepairDataAvailable()).data).toEqual({ labor: false, fluids: false })
  })
})

describe('getRepairData', () => {
  it("opens on the engine that matches the vehicle's and sends that engine's jobs only", async () => {
    laborTimes.mockResolvedValue(answerOf('labor-model'))
    const res = await getRepairData({ vehicleId: 'v1', kind: 'labor' })
    expect(res.data?.status).toBe('found')
    if (res.data?.status !== 'found') return
    const view = res.data.value
    expect(view.source).toBe('Open Labor Project')
    expect(view.variants.map((v) => v.label)).toEqual([
      '2.7L V6 EcoBoost, RWD',
      '3.0L V6 Power Stroke Diesel, RWD',
      '5.0L V8 Coyote, 4WD',
    ])
    expect(view.selected).toBe(2)
    expect(view.items).toHaveLength(4)
    expect(laborTimes).toHaveBeenCalledWith(expect.anything(), {
      make: 'Ford',
      model: 'F-150',
      year: 2018,
      vin: undefined,
      variant: undefined,
      item: undefined,
    })
  })

  it('switches engine from the remembered answer without another call', async () => {
    laborTimes.mockResolvedValue(answerOf('labor-model'))
    await getRepairData({ vehicleId: 'v1', kind: 'labor' })
    const res = await getRepairData({
      vehicleId: 'v1',
      kind: 'labor',
      variant: { engineId: '2.7l-v6-ecoboost', drivetrain: 'rwd', vehicleId: null },
    })
    expect(res.data?.status === 'found' && res.data.value.selected).toBe(0)
    expect(laborTimes).toHaveBeenCalledTimes(1)
  })

  it('says the source has nothing when it does not know the vehicle', async () => {
    laborTimes.mockResolvedValue(null)
    expect((await getRepairData({ vehicleId: 'v1', kind: 'labor' })).data).toEqual({
      status: 'none',
    })
  })

  it("hands the source's refusal to the dialog instead of failing the action", async () => {
    laborTimes.mockRejectedValue(new Error('Open Labor Project rejected the API key'))
    const res = await getRepairData({ vehicleId: 'v1', kind: 'labor' })
    expect(res.success).toBe(true)
    expect(res.data).toEqual({
      status: 'failed',
      message: 'Open Labor Project rejected the API key',
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
})

describe('unlockRepairDataItem', () => {
  it('gets one job and keeps its hours for the next opening', async () => {
    laborTimes.mockResolvedValueOnce(answerOf('labor-model'))
    await getRepairData({ vehicleId: 'v1', kind: 'labor' })

    const one = answerOf('labor-one-job')
    // The same job for the 4WD variant the dialog opened on.
    one.variants[0].vehicleId = '92a92bb0-7293-4783-97e9-743c15473972'
    one.variants[0].drivetrain = '4wd'
    laborTimes.mockResolvedValueOnce(one)
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

    const again = await getRepairData({ vehicleId: 'v1', kind: 'labor' })
    const items = again.data?.status === 'found' ? again.data.value.items : []
    expect(items.find((i) => i.id === 'water-pump')).toMatchObject({ hours: 2.8, locked: false })
    expect(laborTimes).toHaveBeenCalledTimes(2)
  })

  it('says so when the source would not unlock it', async () => {
    laborTimes.mockResolvedValue(null)
    const res = await unlockRepairDataItem({
      vehicleId: 'v1',
      kind: 'labor',
      variant: { engineId: '5.0l-v8-coyote', drivetrain: '4wd', vehicleId: null },
      item: 'water-pump',
    })
    expect(res.data).toEqual({ status: 'none' })
  })
})

describe('pickVariant', () => {
  const variants = answerOf('labor-model').variants

  it('matches the displacement on file', () => {
    expect(pickVariant(variants, { engineSize: '2.7 L' })).toBe(0)
    expect(pickVariant(variants, { engineSize: '5000 cc' })).toBe(2)
  })

  it('prefers the diesel for a diesel', () => {
    expect(pickVariant(variants, { fuelType: 'diesel' })).toBe(1)
  })

  it('keeps the first gasoline engine when nothing else is known', () => {
    expect(pickVariant(variants, {})).toBe(0)
  })

  it('reads litres from what the form holds', () => {
    expect(litresOf('5.0 L')).toBe(5)
    expect(litresOf('1,6')).toBe(1.6)
    expect(litresOf('1998 cc')).toBeCloseTo(1.998)
    expect(litresOf('')).toBeNull()
  })
})
