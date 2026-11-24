/**
 * A work order is dated the day it is opened, on the workshop's calendar,
 * even when the first free slot is tomorrow morning. A car taken in after
 * closing time was dated the next day everywhere the job's date is read: the
 * list, the vehicle's "last visit" (in 13 hours), the portal, the readings
 * taken with it. And a job completed before its booked slot kept holding
 * tomorrow's time on the calendar.
 *
 * The workshop is in Auckland, far from UTC, and it is 18:30 there, after
 * closing (the shop works 07:00 to 15:00).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/notification-bus', () => ({ notificationBus: { publish: vi.fn(), emit: vi.fn() } }))
vi.mock('@/lib/workshop-timezone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workshop-timezone')>()),
  workshopTimeZone: async () => 'Pacific/Auckland',
}))
vi.mock('@/features/meters/Lib/requiredMeters.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/meters/Lib/requiredMeters.server')>()),
  assertRequiredMetersRead: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    vehicle: { findFirst: vi.fn(), count: vi.fn() },
    appSetting: { findMany: vi.fn(), updateMany: vi.fn() },
    organization: { findUnique: vi.fn() },
    serviceRecord: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    workOrderStatus: { findFirst: vi.fn() },
    inspection: { findMany: vi.fn() },
    technician: { findFirst: vi.fn() },
    workshopClosure: { findMany: vi.fn() },
    technicianAbsence: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { createDraftRecord } from '@/features/vehicles/Lib/createDraftRecord'
import { updateServiceStatus } from '@/features/vehicles/Actions/serviceActions'
import { slotOnCompletion } from '@/features/work-order-statuses/Lib/stages'
import { effectiveReadAt } from '@/features/meters/Lib/readingTime'
import { getVehicleGlance } from '@/features/vehicles/Actions/getVehicleGlance'

const ORG = 'org-1'
const USER = 'user-1'
// Tuesday 24 November 2026, 18:30 in Auckland (NZDT, UTC+13).
const NOW = new Date('2026-11-24T05:30:00.000Z')
// Midnight starting Tuesday 24 November in Auckland: the day the job opened.
const TODAY = '2026-11-23T11:00:00.000Z'
// Wednesday 25 November, 07:00 in Auckland: the next free slot.
const TOMORROW_OPENING = '2026-11-24T18:00:00.000Z'

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.mocked(getCachedSession).mockResolvedValue({ user: { id: USER, email: 'a@b.c' } } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false, name: 'Desk' } as any)
  vi.mocked(db.appSetting.findMany).mockResolvedValue([
    { key: 'workshop.timezone', value: 'Pacific/Auckland' },
  ] as any)
  vi.mocked(db.organization.findUnique).mockResolvedValue({ name: 'Shop' } as any)
  vi.mocked(db.vehicle.findFirst).mockResolvedValue({ licensePlate: 'AB123' } as any)
  vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null)
  vi.mocked(db.serviceRecord.findMany).mockResolvedValue([])
  vi.mocked(db.inspection.findMany).mockResolvedValue([])
  vi.mocked(db.workshopClosure.findMany).mockResolvedValue([])
  vi.mocked(db.technicianAbsence.findMany).mockResolvedValue([])
  vi.mocked(db.$queryRaw).mockResolvedValue([{ highest: null }] as any)
  vi.mocked(db.serviceRecord.create).mockImplementation((async (args: any) => ({
    id: 'job-1',
    ...args.data,
  })) as any)
})

afterEach(() => {
  vi.useRealTimers()
})

function created() {
  return vi.mocked(db.serviceRecord.create).mock.calls[0][0].data as any
}

describe('a work order opened after closing time', () => {
  it('is dated today and booked into the next free slot tomorrow', async () => {
    await createDraftRecord(
      { organizationId: ORG, userId: USER },
      { vehicleId: 'veh-1', customerId: null, customerExempt: false, title: 'Brakes' }
    )

    expect(created().serviceDate.toISOString()).toBe(TODAY)
    expect(created().startDateTime.toISOString()).toBe(TOMORROW_OPENING)
    expect(created().endDateTime.toISOString()).toBe('2026-11-24T19:00:00.000Z')
  })

  it('keeps the day of a time somebody chose, a booking next week', async () => {
    const start = new Date('2026-12-01T20:00:00.000Z') // Wed 2 Dec, 09:00 Auckland
    await createDraftRecord(
      { organizationId: ORG, userId: USER },
      {
        vehicleId: 'veh-1',
        customerId: null,
        customerExempt: false,
        title: 'Service',
        startDateTime: start,
        endDateTime: new Date(start.getTime() + 3_600_000),
      }
    )

    expect(created().serviceDate.toISOString()).toBe('2026-12-01T11:00:00.000Z')
    expect(created().startDateTime).toEqual(start)
  })

  it("keeps the day of a customer's preferred date", async () => {
    // Asked for Friday 27 November (Auckland).
    const asked = new Date('2026-11-26T11:00:00.000Z')
    await createDraftRecord(
      { organizationId: ORG, userId: USER },
      {
        vehicleId: 'veh-1',
        customerId: null,
        customerExempt: false,
        title: 'Request',
        bookFrom: asked,
      }
    )

    expect(created().startDateTime.toISOString()).toBe('2026-11-26T18:00:00.000Z')
    expect(created().serviceDate.toISOString()).toBe('2026-11-26T11:00:00.000Z')
  })
})

describe('completing a job', () => {
  const job = (start: string, end: string, status = 'in-progress') => ({
    status,
    startDateTime: new Date(start),
    endDateTime: new Date(end),
  })

  it('lets go of a booked slot that has not started yet', () => {
    expect(
      slotOnCompletion(job(TOMORROW_OPENING, '2026-11-24T19:00:00.000Z'), 'completed', NOW)
    ).toEqual({ startDateTime: NOW, endDateTime: NOW })
  })

  it('ends a slot still running now, keeping its start', () => {
    expect(
      slotOnCompletion(
        job('2026-11-24T05:00:00.000Z', '2026-11-24T06:00:00.000Z'),
        'completed',
        NOW
      )
    ).toEqual({ endDateTime: NOW })
  })

  it('leaves a slot already over as it is', () => {
    expect(
      slotOnCompletion(
        job('2026-11-23T20:00:00.000Z', '2026-11-23T21:00:00.000Z'),
        'completed',
        NOW
      )
    ).toEqual({})
  })

  it('leaves the slot alone for any other move, or a job already completed', () => {
    const ahead = job(TOMORROW_OPENING, '2026-11-24T19:00:00.000Z')
    expect(slotOnCompletion(ahead, 'waiting-parts', NOW)).toEqual({})
    expect(slotOnCompletion({ ...ahead, status: 'completed' }, 'completed', NOW)).toEqual({})
  })

  it('frees the calendar when the status is changed to completed', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      id: 'job-1',
      title: 'Brakes',
      status: 'pending',
      vehicleId: 'veh-1',
      vehicle: null,
      startDateTime: new Date(TOMORROW_OPENING),
      endDateTime: new Date('2026-11-24T19:00:00.000Z'),
    } as any)

    const result = await updateServiceStatus('job-1', 'completed')

    expect(result.success).toBe(true)
    expect(vi.mocked(db.serviceRecord.update)).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({
        status: 'completed',
        startDateTime: NOW,
        endDateTime: NOW,
      }),
    })
  })
})

describe('a reading taken with a job booked tomorrow', () => {
  const typed = new Date('2026-11-24T05:20:00.000Z')
  const onJob = (startDateTime: Date) => ({
    readAt: new Date(TOMORROW_OPENING),
    createdAt: typed,
    serviceRecord: { startDateTime, serviceDate: new Date(TODAY) },
  })

  it('is dated when it was typed while the job is still ahead', () => {
    expect(effectiveReadAt(onJob(new Date(TOMORROW_OPENING)), NOW)).toEqual(typed)
  })

  it('follows the job once the job has come', () => {
    expect(effectiveReadAt(onJob(NOW), NOW)).toEqual(NOW)
  })
})

describe("the vehicle's last visit", () => {
  const done = (id: string, start: string) => ({
    id,
    status: 'completed',
    serviceDate: new Date(TODAY),
    startDateTime: new Date(start),
    totalAmount: 0,
    cost: 0,
    manuallyPaid: false,
    sentAt: null,
    issuedAt: null,
    payments: [],
  })

  it('is never a visit still to come', async () => {
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: 'veh-1', customerId: null } as any)
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
      done('last-week', '2026-11-16T20:00:00.000Z'),
      // Completed before its slot, as a job was before the slot was freed.
      done('ahead', TOMORROW_OPENING),
    ] as any)

    const result = await getVehicleGlance('veh-1')

    expect(result.success && result.data?.lastVisitJobId).toBe('last-week')
  })
})
