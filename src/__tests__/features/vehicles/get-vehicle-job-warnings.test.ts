/**
 * The vehicle page's booking warnings read only this workshop's jobs for this
 * vehicle, only jobs still to be done, and name technicians from this
 * workshop alone.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    serviceRecord: { findMany: vi.fn() },
    technician: { findMany: vi.fn() },
  },
}))

vi.mock('@/features/workboard/Lib/bookings', () => ({
  loadBookingContext: vi.fn(),
  MAX_WINDOW_DAYS: 400,
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { loadBookingContext } from '@/features/workboard/Lib/bookings'
import { getVehicleJobWarnings } from '@/features/vehicles/Actions/getVehicleJobWarnings'
import { absenceBookings } from '@/features/workboard/Lib/availability'
import { zonedDate } from '@/lib/timezone'
import { defaultWeek, type WorkshopCalendar } from '@/features/workshop-calendar/Lib/calendar'

const ORG = 'org-a'
const OSLO = 'Europe/Oslo'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-a', email: 'a@example.com' },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
})

describe('getVehicleJobWarnings', () => {
  it('asks only for this workshop’s open, not yet finished jobs on this vehicle', async () => {
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([])
    const result = await getVehicleJobWarnings('veh-1')

    expect(result).toEqual({ success: true, data: [] })
    const where = vi.mocked(db.serviceRecord.findMany).mock.calls[0][0]?.where
    expect(where).toMatchObject({
      organizationId: ORG,
      vehicleId: 'veh-1',
      status: { notIn: ['completed', 'cancelled'] },
      startDateTime: { not: null },
      endDateTime: { gt: expect.any(Date) },
    })
    // Nothing booked, so the workshop's calendar is not read at all.
    expect(loadBookingContext).not.toHaveBeenCalled()
  })

  it('reports a technician away on a booked job, named from this workshop', async () => {
    const start = zonedDate(2026, 11, 16, 9, 0, OSLO)
    const end = zonedDate(2026, 11, 16, 12, 0, OSLO)
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
      {
        id: 'job-1',
        title: 'Brake service',
        invoiceNumber: '2026-1071',
        startDateTime: start,
        endDateTime: end,
        technicianId: 'tech-ola',
        workBayId: null,
        helpers: [],
      },
    ] as never)
    const calendar: WorkshopCalendar = {
      timeZone: OSLO,
      week: defaultWeek('08:00', '16:00'),
      closures: [],
      absences: [
        {
          id: 'abs-1',
          technicianId: 'tech-ola',
          startDate: '2026-11-16',
          endDate: '2026-11-17',
          reason: 'holiday',
        },
      ],
    }
    vi.mocked(loadBookingContext).mockResolvedValue({
      bookings: absenceBookings(calendar),
      hours: { start: '08:00', end: '16:00', timeZone: OSLO, calendar },
      closuresEnabled: true,
    })
    vi.mocked(db.technician.findMany).mockResolvedValue([
      { id: 'tech-ola', name: 'Ola Nordmann' },
    ] as never)

    const result = await getVehicleJobWarnings('veh-1')

    expect(loadBookingContext).toHaveBeenCalledWith(ORG, start, expect.any(Object))
    expect(vi.mocked(db.technician.findMany).mock.calls[0][0]?.where).toEqual({
      organizationId: ORG,
    })
    expect(result.success).toBe(true)
    expect(result.data).toEqual([
      expect.objectContaining({
        serviceRecordId: 'job-1',
        away: [expect.objectContaining({ people: ['Ola Nordmann'], reason: 'holiday' })],
      }),
    ])
  })

  it('reads the workshop once for several jobs, from the first to past the last', async () => {
    const first = zonedDate(2026, 11, 16, 9, 0, OSLO)
    const lastEnd = zonedDate(2026, 11, 30, 12, 0, OSLO)
    const job = (id: string, s: Date, e: Date) => ({
      id,
      title: id,
      invoiceNumber: null,
      startDateTime: s,
      endDateTime: e,
      technicianId: null,
      workBayId: null,
      helpers: [],
    })
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
      job('a', first, zonedDate(2026, 11, 16, 12, 0, OSLO)),
      job('b', zonedDate(2026, 11, 30, 9, 0, OSLO), lastEnd),
    ] as never)
    vi.mocked(loadBookingContext).mockResolvedValue({
      bookings: [],
      hours: { start: '08:00', end: '16:00', timeZone: OSLO },
      closuresEnabled: false,
    })
    vi.mocked(db.technician.findMany).mockResolvedValue([])

    await getVehicleJobWarnings('veh-1')

    expect(loadBookingContext).toHaveBeenCalledTimes(1)
    const [, from, opts] = vi.mocked(loadBookingContext).mock.calls[0]
    expect(from).toEqual(first)
    const reach = from.getTime() + (opts?.days ?? 0) * 86_400_000
    expect(reach).toBeGreaterThan(lastEnd.getTime())
  })

  it('reads each window of jobs far apart on its own, within the loader’s limit', async () => {
    const job = (id: string, s: Date, e: Date) => ({
      id,
      title: id,
      invoiceNumber: null,
      startDateTime: s,
      endDateTime: e,
      technicianId: null,
      workBayId: null,
      helpers: [],
    })
    const near = zonedDate(2026, 11, 16, 9, 0, OSLO)
    const far = zonedDate(2028, 3, 1, 9, 0, OSLO)
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
      job('a', near, zonedDate(2026, 11, 16, 12, 0, OSLO)),
      job('b', far, zonedDate(2028, 3, 1, 12, 0, OSLO)),
    ] as never)
    vi.mocked(loadBookingContext).mockResolvedValue({
      bookings: [],
      hours: { start: '08:00', end: '16:00', timeZone: OSLO },
      closuresEnabled: false,
    })
    vi.mocked(db.technician.findMany).mockResolvedValue([])

    const result = await getVehicleJobWarnings('veh-1')

    expect(result.success).toBe(true)
    const calls = vi.mocked(loadBookingContext).mock.calls
    expect(calls.map(([, from]) => from)).toEqual([near, far])
    for (const [, , opts] of calls) expect(opts?.days ?? 0).toBeLessThanOrEqual(400)
  })
})
