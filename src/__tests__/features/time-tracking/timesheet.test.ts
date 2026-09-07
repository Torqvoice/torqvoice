import { describe, expect, it } from 'vitest'
import {
  buildTimesheet,
  dayKeysBetween,
  entryMinutes,
  formatElapsed,
  formatMinutes,
  minutesToBillableHours,
  sliceByDay,
  type SheetEntry,
} from '@/features/time-tracking/Lib/timesheet'

const TZ = 'Europe/Oslo'

function entry(overrides: Partial<SheetEntry> & { startedAt: string; endedAt: string | null }) {
  const durationMinutes = overrides.endedAt
    ? Math.round(
        (new Date(overrides.endedAt).getTime() - new Date(overrides.startedAt).getTime()) / 60_000
      )
    : null
  return {
    id: 'e1',
    durationMinutes,
    note: null,
    source: 'app',
    editedAt: null,
    editedByName: null,
    technicianId: 't1',
    technicianName: 'Kari',
    technicianColor: '#3b82f6',
    job: {
      id: 'j1',
      title: 'Brakes',
      status: 'in-progress',
      vehicleId: 'v1',
      vehicleLabel: 'Volvo V70',
      licensePlate: 'AB12345',
    },
    ...overrides,
  } satisfies SheetEntry
}

describe('sliceByDay', () => {
  it('keeps an ordinary stretch on one workshop day', () => {
    // 08:00 to 11:30 Oslo summer time is 06:00Z to 09:30Z.
    const e = entry({ startedAt: '2026-09-07T06:00:00Z', endedAt: '2026-09-07T09:30:00Z' })
    expect(sliceByDay(e, TZ, new Date('2026-09-08T00:00:00Z'))).toEqual([
      { dayKey: '2026-09-07', minutes: 210 },
    ])
  })

  it('splits a night shift at the workshop midnight, not UTC midnight', () => {
    // 22:00 Oslo (20:00Z) to 02:00 Oslo next day (00:00Z).
    const e = entry({ startedAt: '2026-09-07T20:00:00Z', endedAt: '2026-09-08T00:00:00Z' })
    expect(sliceByDay(e, TZ, new Date('2026-09-09T00:00:00Z'))).toEqual([
      { dayKey: '2026-09-07', minutes: 120 },
      { dayKey: '2026-09-08', minutes: 120 },
    ])
  })

  it('counts a running clock up to now', () => {
    const e = entry({ startedAt: '2026-09-07T06:00:00Z', endedAt: null })
    expect(sliceByDay(e, TZ, new Date('2026-09-07T06:45:00Z'))).toEqual([
      { dayKey: '2026-09-07', minutes: 45 },
    ])
  })

  it('clips to the requested window', () => {
    const e = entry({ startedAt: '2026-09-06T20:00:00Z', endedAt: '2026-09-07T02:00:00Z' })
    const window = { from: new Date('2026-09-06T22:00:00Z'), to: new Date('2026-09-08T22:00:00Z') }
    expect(sliceByDay(e, TZ, new Date('2026-09-09T00:00:00Z'), window)).toEqual([
      { dayKey: '2026-09-07', minutes: 240 },
    ])
  })

  it('returns nothing for a stretch entirely outside the window', () => {
    const e = entry({ startedAt: '2026-09-01T06:00:00Z', endedAt: '2026-09-01T07:00:00Z' })
    const window = { from: new Date('2026-09-06T22:00:00Z'), to: new Date('2026-09-08T22:00:00Z') }
    expect(sliceByDay(e, TZ, new Date(), window)).toEqual([])
  })
})

describe('dayKeysBetween', () => {
  it('lists every workshop day inclusive', () => {
    const from = new Date('2026-09-06T22:00:00Z') // Sep 7 00:00 Oslo
    const to = new Date('2026-09-09T21:59:59Z') // Sep 9 23:59 Oslo
    expect(dayKeysBetween(from, to, TZ)).toEqual(['2026-09-07', '2026-09-08', '2026-09-09'])
  })
})

describe('buildTimesheet', () => {
  const from = new Date('2026-09-06T22:00:00Z')
  const to = new Date('2026-09-09T22:00:00Z')
  const now = new Date('2026-09-08T10:00:00Z')

  it('totals per technician and per day, most time first', () => {
    const sheet = buildTimesheet({
      entries: [
        entry({ id: 'a', startedAt: '2026-09-07T06:00:00Z', endedAt: '2026-09-07T08:00:00Z' }),
        entry({
          id: 'b',
          technicianId: 't2',
          technicianName: 'Ola',
          startedAt: '2026-09-07T06:00:00Z',
          endedAt: '2026-09-07T13:00:00Z',
        }),
        entry({ id: 'c', startedAt: '2026-09-08T06:00:00Z', endedAt: null }),
      ],
      technicians: [
        { id: 't1', name: 'Kari', color: '#000' },
        { id: 't2', name: 'Ola', color: '#111' },
        { id: 't3', name: 'Idle', color: '#222' },
      ],
      from,
      to,
      timeZone: TZ,
      now,
    })

    expect(sheet.technicians.map((s) => s.technician.id)).toEqual(['t2', 't1', 't3'])
    const kari = sheet.technicians[1]
    expect(kari.totalMinutes).toBe(120 + 240)
    expect(kari.byDay.get('2026-09-07')).toBe(120)
    expect(kari.byDay.get('2026-09-08')).toBe(240)
    expect(kari.running?.id).toBe('c')
    expect(sheet.technicians[2].totalMinutes).toBe(0)
    expect(sheet.dayTotals.get('2026-09-07')).toBe(120 + 420)
    expect(sheet.totalMinutes).toBe(120 + 420 + 240)
    expect(sheet.runningCount).toBe(1)
    expect(sheet.dayKeys).toEqual(['2026-09-07', '2026-09-08', '2026-09-09'])
  })

  it('names a technician who is no longer on the roster from the entry', () => {
    const sheet = buildTimesheet({
      entries: [
        entry({
          technicianId: 'gone',
          technicianName: 'Former',
          startedAt: '2026-09-07T06:00:00Z',
          endedAt: '2026-09-07T07:00:00Z',
        }),
      ],
      technicians: [],
      from,
      to,
      timeZone: TZ,
      now,
    })
    expect(sheet.technicians[0].technician.name).toBe('Former')
  })
})

describe('formatting', () => {
  it('formats minutes as hours and minutes', () => {
    expect(formatMinutes(0)).toBe('0m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(65)).toBe('1h 05m')
    expect(formatMinutes(600)).toBe('10h 00m')
  })

  it('formats a running clock with seconds', () => {
    expect(formatElapsed(0)).toBe('0:00:00')
    expect(formatElapsed(3_661_000)).toBe('1:01:01')
  })

  it('rounds clocked time to a billable quarter hour, never below one', () => {
    expect(minutesToBillableHours(0)).toBe(0)
    expect(minutesToBillableHours(3)).toBe(0.25)
    expect(minutesToBillableHours(37)).toBe(0.5)
    expect(minutesToBillableHours(83)).toBe(1.5)
  })

  it('uses the stored duration for a stopped entry and live time for a running one', () => {
    const stopped = entry({ startedAt: '2026-09-07T06:00:00Z', endedAt: '2026-09-07T07:00:00Z' })
    expect(entryMinutes(stopped, new Date('2026-09-07T09:00:00Z'))).toBe(60)
    const running = entry({ startedAt: '2026-09-07T06:00:00Z', endedAt: null })
    expect(entryMinutes(running, new Date('2026-09-07T06:20:00Z'))).toBe(20)
  })
})
