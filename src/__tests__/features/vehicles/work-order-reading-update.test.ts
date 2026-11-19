/**
 * Saving a work order and the vehicle's reading.
 *
 * The work order page sends the reading with every save, so the save has to
 * tell a reading that was just typed from one that was already there, and the
 * newest job from an old one being tidied up. The rule itself is tested in
 * vehicle-reading.test.ts; this is the action asking it the right question.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/notification-bus', () => ({ notificationBus: { emit: vi.fn() } }))
vi.mock('@/lib/document-lock.server', () => ({
  assertInvoiceEditable: vi.fn().mockResolvedValue(undefined),
  getDocumentLockSettings: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn().mockResolvedValue([]) },
    vehicle: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    serviceRecord: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { updateServiceRecord } from '@/features/vehicles/Actions/serviceActions'

const ORG = 'org-a'
const START = new Date('2026-11-19T09:00:00Z')

const state = {
  /** Current readings by vehicle. */
  vehicles: {} as Record<string, number>,
  /** Whether a later-dated job on the vehicle carries a reading. */
  laterReading: false,
  job: {
    id: 'sr-a',
    organizationId: ORG,
    vehicleId: 'veh-a' as string,
    customerId: null,
    title: 'Brake pads',
    status: 'pending',
    mileage: null as number | null,
    startDateTime: START,
    serviceDate: START,
    attachments: [],
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  state.vehicles = { 'veh-a': 100_000, 'veh-b': 30_000 }
  state.laterReading = false
  state.job.vehicleId = 'veh-a'
  state.job.mileage = null

  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-a', email: 'a@example.com' },
  } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
  vi.mocked(db.appSetting.findMany).mockResolvedValue([])
  vi.mocked(db.vehicle.findFirst).mockImplementation((async ({ where }: any) =>
    where.organizationId === ORG && where.id in state.vehicles ? { id: where.id } : null) as any)
  vi.mocked(db.serviceRecord.findFirst).mockImplementation((async ({ where }: any) => {
    // The rule's question: another job on the vehicle, later, with a reading.
    if (where.mileage?.gt === 0) {
      expect(where.organizationId).toBe(ORG)
      return state.laterReading ? { id: 'sr-later' } : null
    }
    return where.id === state.job.id && where.organizationId === ORG
      ? {
          ...state.job,
          vehicle: { id: state.job.vehicleId, mileage: state.vehicles[state.job.vehicleId] },
        }
      : null
  }) as any)
  vi.mocked(db.vehicle.updateMany).mockImplementation((async ({ where, data }: any) => {
    if (where.organizationId !== ORG || !(state.vehicles[where.id] < where.mileage.lt))
      return { count: 0 }
    state.vehicles[where.id] = data.mileage
    return { count: 1 }
  }) as any)
  vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
    fn({
      serviceRecord: {
        update: vi.fn(async ({ data }: any) => {
          if (data.mileage !== undefined) state.job.mileage = data.mileage
          if (data.vehicleId) state.job.vehicleId = data.vehicleId
          return { ...state.job }
        }),
      },
    })
  )
})

async function save(input: Record<string, unknown>) {
  const result = await updateServiceRecord({ id: 'sr-a', ...input })
  expect(result.success, result.error).toBe(true)
}

describe('saving a work order', () => {
  it('moves the vehicle on when a higher reading is typed on its newest job', async () => {
    await save({ mileage: 104_500 })
    expect(state.job.mileage).toBe(104_500)
    expect(state.vehicles['veh-a']).toBe(104_500)
  })

  it('saves a lower reading on the job and leaves the vehicle where it was', async () => {
    await save({ mileage: 99_000 })
    expect(state.job.mileage).toBe(99_000)
    expect(state.vehicles['veh-a']).toBe(100_000)
  })

  it('saves an equal reading without touching the vehicle', async () => {
    await save({ mileage: 100_000 })
    expect(state.job.mileage).toBe(100_000)
    expect(state.vehicles['veh-a']).toBe(100_000)
  })

  it('does not let an older job being edited push the vehicle forward', async () => {
    state.laterReading = true
    await save({ mileage: 900_000 })
    expect(state.job.mileage).toBe(900_000)
    expect(state.vehicles['veh-a']).toBe(100_000)
    expect(db.vehicle.updateMany).not.toHaveBeenCalled()
  })

  it('leaves a vehicle corrected by hand alone when the job is saved again unchanged', async () => {
    // The job read 180 000 on the way in; the cluster was replaced and the
    // vehicle set to 5 on the vehicle form. The page still sends 180 000.
    state.job.mileage = 180_000
    state.vehicles['veh-a'] = 5
    await save({ mileage: 180_000, title: 'Instrument cluster' })
    expect(state.vehicles['veh-a']).toBe(5)
  })

  it('does not ask at all when the save says nothing about the reading', async () => {
    state.job.mileage = 180_000
    await save({ title: 'Brake pads, front' })
    expect(db.vehicle.updateMany).not.toHaveBeenCalled()
    expect(state.vehicles['veh-a']).toBe(100_000)
  })

  it('clears a reading without touching the vehicle', async () => {
    state.job.mileage = 100_000
    await save({ mileage: null })
    expect(state.job.mileage).toBeNull()
    expect(state.vehicles['veh-a']).toBe(100_000)
  })

  it('speaks for the vehicle the job is moved to, not the one it left', async () => {
    state.job.mileage = 120_000
    await save({ vehicleId: 'veh-b', mileage: 120_000 })
    expect(state.vehicles['veh-b']).toBe(120_000)
    expect(state.vehicles['veh-a']).toBe(100_000)
  })
})
