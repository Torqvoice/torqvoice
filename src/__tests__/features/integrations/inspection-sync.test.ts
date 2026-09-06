import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectorContext } from '@/features/integrations/Lib/types'

const vehicle = { findMany: vi.fn() }
const vehicleInspectionStatus = { upsert: vi.fn(), count: vi.fn() }
vi.mock('@/lib/db', () => ({ db: { vehicle, vehicleInspectionStatus } }))

const { BATCH_SIZE, recordRegistryAnswer, refreshInspections, vehiclesDueForCheck } = await import(
  '@/features/integrations/Lib/inspection-sync'
)

function context(settings: Record<string, unknown>, state: Record<string, unknown> = {}) {
  const log = vi.fn(
    async (_level: string, _message: string, _details?: Record<string, unknown>) => undefined
  )
  const saveState = vi.fn(async (patch: Record<string, unknown>) => {
    Object.assign(ctx.connection.state, patch)
  })
  const ctx = {
    connection: {
      id: 'conn-1',
      organizationId: 'org-a',
      connectorId: 'vegvesen',
      settings,
      state,
      externalAccountId: null,
    },
    credentials: {},
    http: { fetch: vi.fn(), json: vi.fn() },
    links: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), remoteIds: vi.fn() },
    log,
    saveState,
    timezone: 'Europe/Oslo',
    appUrl: 'https://app.test',
  } as unknown as ConnectorContext
  return { ctx, log, saveState }
}

beforeEach(() => {
  vi.clearAllMocks()
  vehicle.findMany.mockResolvedValue([])
  vehicleInspectionStatus.upsert.mockResolvedValue({})
  vehicleInspectionStatus.count.mockResolvedValue(0)
})

describe('inspection refresh job', () => {
  it('does nothing while the setting is off', async () => {
    const { ctx } = context({ syncInspections: false })
    const outcome = await refreshInspections(ctx, vi.fn())
    expect(outcome).toEqual({ summary: 'Inspection sync is off' })
    expect(vehicle.findMany).not.toHaveBeenCalled()
  })

  it('asks only for this organisation’s live vehicles with a plate', async () => {
    await vehiclesDueForCheck('org-a', new Date('2026-09-03T08:00:00Z'))
    const where = vehicle.findMany.mock.calls[0][0].where
    expect(where.organizationId).toBe('org-a')
    expect(where.isArchived).toBe(false)
    expect(where.licensePlate).toEqual({ not: null })
    // Never checked, or checked long enough ago.
    expect(where.OR).toHaveLength(4)
  })

  it('looks each vehicle up and records the answer against the same organisation', async () => {
    vehicle.findMany.mockResolvedValueOnce([
      { id: 'v1', licensePlate: 'EV11223' },
      { id: 'v2', licensePlate: 'AB12345' },
    ])
    const lookup = vi
      .fn()
      .mockResolvedValueOnce({ inspectionDue: '2027-03-31', lastInspected: '2025-02-14' })
      .mockResolvedValueOnce(null)
    vehicleInspectionStatus.count.mockResolvedValue(1)
    const { ctx, log } = context({ syncInspections: true })

    const outcome = await refreshInspections(ctx, lookup)

    expect(lookup).toHaveBeenCalledTimes(2)
    expect(lookup.mock.calls[0][1]).toEqual({ plate: 'EV11223' })
    const [first, second] = vehicleInspectionStatus.upsert.mock.calls.map((c) => c[0])
    expect(first.where).toEqual({ vehicleId: 'v1' })
    expect(first.create.organizationId).toBe('org-a')
    expect(first.create.dueAt).toEqual(new Date('2027-03-31'))
    expect(first.create.found).toBe(true)
    expect(second.create.found).toBe(false)
    expect(outcome).toEqual({ summary: '2 checked, 1 not in the register, 1 due within 90 days' })
    // Counts in the log, never a plate.
    const summary = log.mock.calls.find((c) => c[1] === 'Inspection refresh complete')
    expect(summary?.[2]).toMatchObject({ checked: 2, found: 1, notFound: 1, dueWithin90Days: 1 })
    for (const call of log.mock.calls) expect(JSON.stringify(call)).not.toMatch(/EV11223|AB12345/)
  })

  it('reschedules itself while a full batch came back', async () => {
    vehicle.findMany.mockResolvedValueOnce(
      Array.from({ length: BATCH_SIZE }, (_, i) => ({ id: `v${i}`, licensePlate: `AA${i}` }))
    )
    const { ctx, saveState } = context({ syncInspections: true })
    const outcome = await refreshInspections(ctx, vi.fn().mockResolvedValue(null))
    expect(outcome?.rescheduleInSeconds).toBeGreaterThan(0)
    expect(saveState).toHaveBeenCalledWith({
      inspectionRun: { checked: BATCH_SIZE, found: 0, notFound: BATCH_SIZE, failed: 0 },
    })
  })

  it('stops the pass on a rejected key instead of failing every vehicle', async () => {
    vehicle.findMany.mockResolvedValueOnce([
      { id: 'v1', licensePlate: 'EV11223' },
      { id: 'v2', licensePlate: 'AB12345' },
    ])
    const lookup = vi.fn().mockRejectedValue(new Error('Statens vegvesen rejected the API key'))
    const { ctx } = context({ syncInspections: true })
    await expect(refreshInspections(ctx, lookup)).rejects.toThrow(/rejected/)
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('notes a one-off failure and moves on', async () => {
    vehicle.findMany.mockResolvedValueOnce([{ id: 'v1', licensePlate: 'EV11223' }])
    const lookup = vi.fn().mockRejectedValue(new Error('HTTP 502'))
    const { ctx } = context({ syncInspections: true })
    const outcome = await refreshInspections(ctx, lookup)
    expect(outcome?.summary).toContain('1 checked')
    const upsert = vehicleInspectionStatus.upsert.mock.calls[0][0]
    expect(upsert.create.lastError).toBe('HTTP 502')
  })
})

describe('recordRegistryAnswer', () => {
  it('keeps the dates it had when the registry answer carries none', async () => {
    await recordRegistryAnswer({
      organizationId: 'org-a',
      vehicleId: 'v1',
      source: 'vegvesen',
      result: { make: 'Volvo', registered: true },
    })
    const upsert = vehicleInspectionStatus.upsert.mock.calls[0][0]
    expect(upsert.update).not.toHaveProperty('dueAt')
    expect(upsert.update.registered).toBe(true)
    expect(upsert.update.found).toBe(true)
  })

  it('stores what has no column of its own as extras', async () => {
    await recordRegistryAnswer({
      organizationId: 'org-a',
      vehicleId: 'v1',
      source: 'vegvesen',
      result: { tyres: [{ axle: 1, tyre: '235/55R18' }], weights: { kerb: 1938 } },
    })
    const upsert = vehicleInspectionStatus.upsert.mock.calls[0][0]
    expect(upsert.create.extras).toEqual({
      tyres: [{ axle: 1, tyre: '235/55R18' }],
      weights: { kerb: 1938 },
    })
  })
})
