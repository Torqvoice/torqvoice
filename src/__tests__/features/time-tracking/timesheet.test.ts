import { describe, expect, it } from 'vitest'
import {
  buildTimesheet,
  dayKeysBetween,
  entryMinutes,
  formatElapsed,
  formatMinutes,
  groupTimesheetEntries,
  minutesToBillableHours,
  sliceByDay,
  sortTimesheetEntries,
  type SheetEntry,
} from '@/features/time-tracking/Lib/timesheet'
import { timesheetCsv } from '@/features/time-tracking/Lib/timesheet-csv'

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

describe('sortTimesheetEntries', () => {
  function sortableEntry(
    id: string,
    job: Partial<SheetEntry['job']>,
    startedAt = '2026-09-07T06:00:00Z'
  ): SheetEntry {
    const base = entry({ id, startedAt, endedAt: null })
    return { ...base, job: { ...base.job, clientName: 'Same client', ...job } }
  }

  it.each(['asc', 'desc'] as const)('sorts clients %s independently of vehicles', (direction) => {
    const entries = [
      sortableEntry('zed', { clientName: 'Zed', vehicleLabel: 'Audi A3' }),
      sortableEntry('alice', { clientName: 'Alice', vehicleLabel: 'Volvo V70' }),
      sortableEntry('bob', { clientName: 'Bob', vehicleLabel: 'BMW X3' }),
    ]

    expect(sortTimesheetEntries(entries, 'client', direction, 'en').map((e) => e.id)).toEqual(
      direction === 'asc' ? ['alice', 'bob', 'zed'] : ['zed', 'bob', 'alice']
    )
  })

  it.each([
    'asc',
    'desc',
  ] as const)('sorts vehicles %s by make/model, then numeric plate, ignoring clients', (direction) => {
    const entries = [
      sortableEntry('volvo', { clientName: 'Alice', vehicleLabel: 'Volvo V70' }),
      sortableEntry('audi-10', { vehicleLabel: 'Audi A3', licensePlate: 'AB10' }),
      sortableEntry('audi-a4', { vehicleLabel: 'Audi A4', licensePlate: 'AB1' }),
      sortableEntry('audi-2', {
        clientName: 'Zed',
        vehicleLabel: 'Audi A3',
        licensePlate: 'AB2',
      }),
    ]

    expect(sortTimesheetEntries(entries, 'vehicle', direction, 'en').map((e) => e.id)).toEqual(
      direction === 'asc'
        ? ['audi-2', 'audi-10', 'audi-a4', 'volvo']
        : ['volvo', 'audi-a4', 'audi-10', 'audi-2']
    )
  })

  it.each([
    'asc',
    'desc',
  ] as const)('prioritizes client before vehicle and plate in combined %s sorting', (direction) => {
    const entries = [
      sortableEntry('bob-audi', { clientName: 'Bob', vehicleLabel: 'Audi A3' }),
      sortableEntry('alice-volvo', { clientName: 'Alice', vehicleLabel: 'Volvo V70' }),
      sortableEntry('alice-audi-10', {
        clientName: 'Alice',
        vehicleLabel: 'Audi A3',
        licensePlate: 'AB10',
      }),
      sortableEntry('alice-audi-2', {
        clientName: 'Alice',
        vehicleLabel: 'Audi A3',
        licensePlate: 'AB2',
      }),
    ]

    expect(
      sortTimesheetEntries(entries, 'clientVehicle', direction, 'en').map((e) => e.id)
    ).toEqual(
      direction === 'asc'
        ? ['alice-audi-2', 'alice-audi-10', 'alice-volvo', 'bob-audi']
        : ['bob-audi', 'alice-volvo', 'alice-audi-10', 'alice-audi-2']
    )
  })

  describe.each(['asc', 'desc'] as const)('missing values with %s sorting', (direction) => {
    it.each([
      'client',
      'clientVehicle',
    ] as const)('puts null and absent clients last for %s', (sort) => {
      const entries = [
        sortableEntry('null', { clientName: null }, '2026-09-07T07:00:00Z'),
        sortableEntry('absent', { clientName: undefined }),
        sortableEntry('named', { clientName: 'Zed' }),
      ]

      expect(sortTimesheetEntries(entries, sort, direction).map((e) => e.id)).toEqual([
        'named',
        'null',
        'absent',
      ])
    })

    it.each(['vehicle', 'clientVehicle'] as const)('puts missing vehicles last for %s', (sort) => {
      const entries = [
        sortableEntry('missing', { vehicleId: null, vehicleLabel: null, licensePlate: null }),
        sortableEntry('volvo', { vehicleLabel: 'Volvo V70' }),
        sortableEntry('audi', { vehicleLabel: 'Audi A3' }),
      ]

      expect(sortTimesheetEntries(entries, sort, direction).map((e) => e.id)).toEqual(
        direction === 'asc' ? ['audi', 'volvo', 'missing'] : ['volvo', 'audi', 'missing']
      )
    })

    it.each([
      'vehicle',
      'clientVehicle',
    ] as const)('puts null plates last for matching vehicles in %s', (sort) => {
      const entries = [
        sortableEntry('missing', { licensePlate: null }),
        sortableEntry('plate-10', { licensePlate: 'AB10' }),
        sortableEntry('plate-2', { licensePlate: 'AB2' }),
      ]

      expect(sortTimesheetEntries(entries, sort, direction).map((e) => e.id)).toEqual(
        direction === 'asc'
          ? ['plate-2', 'plate-10', 'missing']
          : ['plate-10', 'plate-2', 'missing']
      )
    })

    it.each([
      'default',
      'client',
      'vehicle',
      'clientVehicle',
    ] as const)('returns a new array without mutating entries for %s', (sort) => {
      const entries = [
        sortableEntry('zed', { clientName: 'Zed', vehicleLabel: 'Volvo V70' }),
        sortableEntry('alice', { clientName: 'Alice', vehicleLabel: 'Audi A3' }),
      ]
      const before = structuredClone(entries)

      const sorted = sortTimesheetEntries(entries, sort, direction)

      expect(sorted).not.toBe(entries)
      expect(entries).toEqual(before)
      expect(sorted).toHaveLength(entries.length)
      for (const original of entries) expect(sorted).toContain(original)
      if (sort === 'default') expect(sorted).toEqual(entries)
    })

    it.each([
      'client',
      'vehicle',
      'clientVehicle',
    ] as const)('breaks %s ties by newest start first, then id', (sort) => {
      const entries = [
        sortableEntry('old', {}, '2026-09-07T06:00:00Z'),
        sortableEntry('b', {}, '2026-09-07T08:00:00Z'),
        sortableEntry('a', {}, '2026-09-07T08:00:00Z'),
      ]

      expect(sortTimesheetEntries(entries, sort, direction).map((e) => e.id)).toEqual([
        'a',
        'b',
        'old',
      ])
    })
  })

  it('defaults to ascending order', () => {
    const entries = [
      sortableEntry('zed', { clientName: 'Zed' }),
      sortableEntry('alice', { clientName: 'Alice' }),
    ]

    expect(sortTimesheetEntries(entries, 'client').map((e) => e.id)).toEqual(['alice', 'zed'])
  })

  it.each([
    'client',
    'vehicle',
    'clientVehicle',
  ] as const)('uses locale-aware %s collation', (sort) => {
    const entries = [
      sortableEntry('z', { clientName: 'Zebra', vehicleLabel: 'Zebra' }),
      sortableEntry('a-umlaut', { clientName: 'Älg', vehicleLabel: 'Älg' }),
    ]

    expect(sortTimesheetEntries(entries, sort, 'asc', 'en').map((e) => e.id)).toEqual([
      'a-umlaut',
      'z',
    ])
    expect(sortTimesheetEntries(entries, sort, 'asc', 'sv').map((e) => e.id)).toEqual([
      'z',
      'a-umlaut',
    ])
    expect(sortTimesheetEntries(entries, sort, 'desc', 'sv').map((e) => e.id)).toEqual([
      'a-umlaut',
      'z',
    ])
  })

  it('compares client names without case or accent sensitivity before breaking ties', () => {
    const entries = [
      sortableEntry('old', { clientName: 'Élodie' }, '2026-09-07T06:00:00Z'),
      sortableEntry('new', { clientName: 'elodie' }, '2026-09-07T08:00:00Z'),
    ]

    expect(sortTimesheetEntries(entries, 'client', 'asc', 'en').map((e) => e.id)).toEqual([
      'new',
      'old',
    ])
    expect(sortTimesheetEntries(entries, 'client', 'desc', 'en').map((e) => e.id)).toEqual([
      'new',
      'old',
    ])
  })
})

describe('groupTimesheetEntries', () => {
  const NOW = new Date('2026-09-08T00:00:00Z')
  function grouped(
    id: string,
    job: Partial<SheetEntry['job']>,
    overrides: Partial<SheetEntry> = {}
  ): SheetEntry {
    const base = entry({
      id,
      startedAt: '2026-09-07T06:00:00Z',
      endedAt: '2026-09-07T07:00:00Z',
      ...overrides,
    })
    return { ...base, job: { ...base.job, clientName: 'Alice', ...job } }
  }

  it('keeps one group per client in the order given, with whole-entry subtotals', () => {
    const entries = [
      grouped('a1', { clientName: 'Alice' }),
      grouped('b1', { clientName: 'Bob' }),
      grouped('a2', { clientName: 'Alice' }),
      grouped('none', { clientName: null }),
    ]

    const groups = groupTimesheetEntries(entries, 'client', NOW)

    expect(groups.map((g) => [g.clientName, g.entries.map((e) => e.id), g.minutes])).toEqual([
      ['Alice', ['a1', 'a2'], 120],
      ['Bob', ['b1'], 60],
      [null, ['none'], 60],
    ])
    expect(groups.every((g) => g.vehicle === null && g.technicianName === null)).toBe(true)
  })

  it('groups vehicles by id, not label, and counter sales together', () => {
    const entries = [
      grouped('v1', { vehicleId: 'v1', vehicleLabel: 'Audi A3', licensePlate: 'AB1' }),
      grouped('v2', { vehicleId: 'v2', vehicleLabel: 'Audi A3', licensePlate: 'AB2' }),
      grouped('sale-1', { vehicleId: null, vehicleLabel: null, licensePlate: null }),
      grouped('sale-2', {
        clientName: 'Bob',
        vehicleId: null,
        vehicleLabel: null,
        licensePlate: null,
      }),
    ]

    const groups = groupTimesheetEntries(entries, 'vehicle', NOW)

    expect(groups.map((g) => [g.vehicle, g.entries.map((e) => e.id)])).toEqual([
      [{ label: 'Audi A3', licensePlate: 'AB1' }, ['v1']],
      [{ label: 'Audi A3', licensePlate: 'AB2' }, ['v2']],
      [{ label: null, licensePlate: null }, ['sale-1', 'sale-2']],
    ])
    expect(groups.every((g) => g.clientName === null)).toBe(true)
  })

  it('splits a client by vehicle for the combined sort', () => {
    const entries = [
      grouped('alice-v1', { vehicleId: 'v1' }),
      grouped('alice-v2', { vehicleId: 'v2' }),
      grouped('bob-v1', { clientName: 'Bob', vehicleId: 'v1' }),
      grouped('alice-v1-again', { vehicleId: 'v1' }),
    ]

    expect(
      groupTimesheetEntries(entries, 'clientVehicle', NOW).map((g) => [
        g.clientName,
        g.entries.map((e) => e.id),
      ])
    ).toEqual([
      ['Alice', ['alice-v1', 'alice-v1-again']],
      ['Alice', ['alice-v2']],
      ['Bob', ['bob-v1']],
    ])
  })

  it('groups by technician by default and counts a running clock up to now', () => {
    const entries = [
      grouped('kari', {}),
      grouped(
        'ola',
        {},
        {
          technicianId: 't2',
          technicianName: 'Ola',
          startedAt: '2026-09-07T22:00:00Z',
          endedAt: null,
        }
      ),
    ]

    expect(
      groupTimesheetEntries(entries, 'default', NOW).map((g) => [g.technicianName, g.minutes])
    ).toEqual([
      ['Kari', 60],
      ['Ola', 120],
    ])
  })
})

describe('timesheetCsv', () => {
  const headers = [
    'Technician',
    'Date',
    'Start',
    'End',
    'Duration',
    'Hours',
    'Job',
    'Vehicle',
    'Plate',
    'Source',
    'Edited by',
    'Note',
    'Client',
  ]

  it('appends client names as the last column and quotes commas and double quotes', () => {
    const base = entry({
      startedAt: '2026-09-07T06:00:00Z',
      endedAt: '2026-09-07T07:00:00Z',
      note: 'Checked, ready',
    })
    const entries = [
      { ...base, job: { ...base.job, title: 'Brakes, front', clientName: 'Smith, "Auto"' } },
      { ...base, id: 'e2', note: null, job: { ...base.job, clientName: 'Alice' } },
      { ...base, id: 'e3', note: null, job: { ...base.job, clientName: null } },
      { ...base, id: 'e4', note: null },
    ]

    expect(timesheetCsv(entries, TZ, new Date('2026-09-08T00:00:00Z'), headers)).toBe(
      [
        headers.join(','),
        'Kari,2026-09-07,08:00,09:00,1h 00m,1.00,"Brakes, front",Volvo V70,AB12345,app,,"Checked, ready","Smith, ""Auto"""',
        'Kari,2026-09-07,08:00,09:00,1h 00m,1.00,Brakes,Volvo V70,AB12345,app,,,Alice',
        'Kari,2026-09-07,08:00,09:00,1h 00m,1.00,Brakes,Volvo V70,AB12345,app,,,',
        'Kari,2026-09-07,08:00,09:00,1h 00m,1.00,Brakes,Volvo V70,AB12345,app,,,',
      ].join('\n')
    )
  })
})

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
