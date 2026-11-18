/**
 * What the vehicle page flags on a job's booking: the same problems the work
 * order shows once opened (a technician or helper away, the person or bay
 * already taken, the workshop closed), and nothing for a job that is fine.
 */

import { describe, expect, it } from 'vitest'
import { zonedDate } from '@/lib/timezone'
import { type Booking, absenceBookings } from '@/features/workboard/Lib/availability'
import type { BookingContext } from '@/features/workboard/Lib/bookings'
import { type WorkshopCalendar, defaultWeek } from '@/features/workshop-calendar/Lib/calendar'
import {
  type BookedJob,
  buildVehicleJobWarnings,
  planWindows,
  splitSpan,
} from '@/features/vehicles/Lib/vehicleJobWarnings'

const OSLO = 'Europe/Oslo'
const oslo = (d: number, h: number, min = 0) => zonedDate(2026, 11, d, h, min, OSLO)

const NAMES = new Map([
  ['tech-ola', 'Ola Nordmann'],
  ['tech-kari', 'Kari Hansen'],
])

function calendar(over: Partial<WorkshopCalendar> = {}): WorkshopCalendar {
  return {
    timeZone: OSLO,
    week: defaultWeek('08:00', '16:00'),
    closures: [],
    absences: [],
    ...over,
  }
}

function context(cal: WorkshopCalendar, bookings: Booking[] = []): BookingContext {
  return {
    bookings: [...bookings, ...absenceBookings(cal)],
    hours: { start: '08:00', end: '16:00', timeZone: OSLO, calendar: cal },
    closuresEnabled: true,
  }
}

// Monday 16 November 2026, nine to twelve, Ola on it in bay 1.
const JOB: BookedJob = {
  id: 'job-1',
  title: 'Brake service',
  invoiceNumber: '2026-1071',
  start: oslo(16, 9),
  end: oslo(16, 12),
  technicianId: 'tech-ola',
  helperIds: [],
  workBayId: 'bay-1',
}

describe('booking warnings on the vehicle page', () => {
  it('says nothing about a job that is fine', () => {
    expect(buildVehicleJobWarnings([JOB], context(calendar()), NAMES)).toEqual([])
  })

  it('names the technician who is away, with why and when', () => {
    const cal = calendar({
      absences: [
        {
          id: 'abs-1',
          technicianId: 'tech-ola',
          startDate: '2026-11-16',
          endDate: '2026-11-17',
          reason: 'holiday',
        },
      ],
    })
    const [warning] = buildVehicleJobWarnings([JOB], context(cal), NAMES)
    expect(warning).toMatchObject({
      serviceRecordId: 'job-1',
      invoiceNumber: '2026-1071',
      title: 'Brake service',
      away: [{ people: ['Ola Nordmann'], reason: 'holiday' }],
      clashes: [],
      closures: [],
      closedWeekday: false,
    })
    // From the Monday to the midnight after the Tuesday, on the workshop's clock.
    expect(new Date(warning.away[0].start)).toEqual(oslo(16, 0))
    expect(new Date(warning.away[0].end)).toEqual(oslo(18, 0))
  })

  it('names a helper who is away, not only the technician', () => {
    const cal = calendar({
      absences: [
        {
          id: 'abs-2',
          technicianId: 'tech-kari',
          startDate: '2026-11-16',
          endDate: '2026-11-16',
          reason: 'sick',
        },
      ],
    })
    const [warning] = buildVehicleJobWarnings(
      [{ ...JOB, helperIds: ['tech-kari'] }],
      context(cal),
      NAMES
    )
    expect(warning.away).toEqual([
      expect.objectContaining({ people: ['Kari Hansen'], reason: 'sick' }),
    ])
  })

  it('flags another job in the same bay, and says it is the bay', () => {
    const other: Booking = {
      id: 'job-2',
      kind: 'serviceRecord',
      label: 'Volvo XC60 AB12345',
      start: oslo(16, 10),
      end: oslo(16, 14),
      technicianId: 'tech-kari',
      workBayId: 'bay-1',
    }
    const [warning] = buildVehicleJobWarnings([JOB], context(calendar(), [other]), NAMES)
    expect(warning.clashes).toEqual([
      {
        label: 'Volvo XC60 AB12345',
        start: oslo(16, 10).toISOString(),
        end: oslo(16, 14).toISOString(),
        onTechnician: false,
        onBay: true,
        people: [],
      },
    ])
  })

  it('names who is double-booked when the clash is on a person', () => {
    const other: Booking = {
      id: 'job-3',
      kind: 'inspection',
      label: 'Tesla Model 3 EV11111',
      start: oslo(16, 11),
      end: oslo(16, 13),
      technicianId: 'tech-ola',
      workBayId: 'bay-2',
    }
    const [warning] = buildVehicleJobWarnings([JOB], context(calendar(), [other]), NAMES)
    expect(warning.clashes[0]).toMatchObject({
      onTechnician: true,
      onBay: false,
      people: ['Ola Nordmann'],
    })
  })

  it('never flags a job for clashing with itself', () => {
    const itself: Booking = {
      id: 'job-1',
      kind: 'serviceRecord',
      label: 'Same job',
      start: JOB.start,
      end: JOB.end,
      technicianId: 'tech-ola',
      workBayId: 'bay-1',
    }
    expect(buildVehicleJobWarnings([JOB], context(calendar(), [itself]), NAMES)).toEqual([])
  })

  it('flags a job booked on a day the workshop is closed, by the closure name', () => {
    const cal = calendar({
      closures: [
        { name: 'Staff day', source: 'closure', startDate: '2026-11-16', endDate: '2026-11-16' },
      ],
    })
    const [warning] = buildVehicleJobWarnings(
      [{ ...JOB, technicianId: null, workBayId: null }],
      context(cal),
      NAMES
    )
    expect(warning.closures).toEqual(['Staff day'])
  })

  it('flags a job on a weekday the workshop does not open', () => {
    // Sunday 15 November.
    const sunday = { ...JOB, start: oslo(15, 9), end: oslo(15, 12) }
    const [warning] = buildVehicleJobWarnings([sunday], context(calendar()), NAMES)
    expect(warning.closedWeekday).toBe(true)
  })

  it('keeps the jobs in the order given and leaves out the fine ones', () => {
    const cal = calendar({
      absences: [
        {
          id: 'abs-3',
          technicianId: 'tech-ola',
          startDate: '2026-11-18',
          endDate: '2026-11-18',
          reason: 'training',
        },
      ],
    })
    const fine = JOB
    const away = { ...JOB, id: 'job-9', start: oslo(18, 9), end: oslo(18, 11) }
    const result = buildVehicleJobWarnings([fine, away], context(cal), NAMES)
    expect(result.map((w) => w.serviceRecordId)).toEqual(['job-9'])
  })
})

describe('reading bookings in windows', () => {
  const DAY = 86_400_000
  const at = (day: number) => new Date(Date.UTC(2027, 0, 1) + day * DAY)

  it('cuts a stretch longer than a window into pieces that each fit', () => {
    const pieces = splitSpan({ start: at(0), end: at(900) }, 398)
    expect(pieces.map((p) => [p.start, p.end])).toEqual([
      [at(0), at(398)],
      [at(398), at(796)],
      [at(796), at(900)],
    ])
  })

  it('leaves a stretch that fits whole', () => {
    expect(splitSpan({ start: at(0), end: at(3) }, 398)).toEqual([{ start: at(0), end: at(3) }])
  })

  it('covers jobs close together with one window and far apart with two', () => {
    const windows = planWindows(
      [
        { start: at(500), end: at(501) },
        { start: at(0), end: at(1) },
        { start: at(10), end: at(12) },
      ],
      398
    )
    expect(windows).toEqual([
      { start: at(0), end: at(12) },
      { start: at(500), end: at(501) },
    ])
  })

  it('finds a clash past the first window on a job longer than one', () => {
    // A job booked across 500 days (nobody does, but nothing should hide),
    // with the technician away near its end.
    const cal = calendar({
      absences: [
        {
          id: 'abs-far',
          technicianId: 'tech-ola',
          startDate: '2028-04-10',
          endDate: '2028-04-10',
          reason: 'training',
        },
      ],
    })
    const long = { ...JOB, start: oslo(16, 9), end: new Date(oslo(16, 9).getTime() + 520 * DAY) }
    const asked: { start: Date; end: Date }[] = []
    const [warning] = buildVehicleJobWarnings(
      [long],
      (span) => {
        asked.push(span)
        return context(cal)
      },
      NAMES,
      398
    )
    expect(asked).toHaveLength(2)
    expect(warning.away).toEqual([expect.objectContaining({ reason: 'training' })])
  })
})
