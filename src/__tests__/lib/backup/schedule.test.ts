import { describe, expect, it } from 'vitest'
import type { BackupSettings } from '@/features/integrations/Lib/backup-types'
import {
  BACKUP_SETTING_DEFAULTS,
  intervalMs,
  isDue,
  nextRunAfter,
  readBackupSettings,
  retentionFlags,
  spreadOffsetMinutes,
} from '@/lib/backup/schedule'

const OSLO = 'Europe/Oslo'
const NY = 'America/New_York'

function settings(over: Partial<BackupSettings>): BackupSettings {
  return { ...BACKUP_SETTING_DEFAULTS, ...over }
}

function next(over: Partial<BackupSettings>, after: string, tz: string, offset = 0): string {
  return nextRunAfter(settings(over), new Date(after), tz, offset).toISOString()
}

/** Every run between two instants, by chaining nextRunAfter. */
function runsBetween(
  over: Partial<BackupSettings>,
  from: string,
  to: string,
  tz: string
): string[] {
  const out: string[] = []
  let t = new Date(from)
  for (;;) {
    t = nextRunAfter(settings(over), t, tz)
    if (t.getTime() > new Date(to).getTime()) return out
    out.push(t.toISOString())
  }
}

describe('nextRunAfter: frequencies', () => {
  it('hourly runs at :00 on the workshop clock', () => {
    expect(next({ frequency: 'hourly' }, '2026-06-10T10:15:00Z', OSLO)).toBe(
      '2026-06-10T11:00:00.000Z'
    )
    expect(next({ frequency: 'hourly' }, '2026-01-15T10:00:00Z', NY)).toBe(
      '2026-01-15T11:00:00.000Z'
    )
    // India is UTC+5:30, so its :00 is UTC :30.
    expect(next({ frequency: 'hourly' }, '2026-06-10T10:15:00Z', 'Asia/Kolkata')).toBe(
      '2026-06-10T10:30:00.000Z'
    )
  })

  it('every4h runs at 00, 04, 08, 12, 16 and 20', () => {
    // 12:30 CEST → 16:00 CEST.
    expect(next({ frequency: 'every4h' }, '2026-06-10T10:30:00Z', OSLO)).toBe(
      '2026-06-10T14:00:00.000Z'
    )
    // 07:00 EST → 08:00 EST.
    expect(next({ frequency: 'every4h' }, '2026-01-15T12:00:00Z', NY)).toBe(
      '2026-01-15T13:00:00.000Z'
    )
    // 21:00 EST → 00:00 EST next day.
    expect(next({ frequency: 'every4h' }, '2026-01-16T02:00:00Z', NY)).toBe(
      '2026-01-16T05:00:00.000Z'
    )
  })

  it('daily runs at the set time, strictly after', () => {
    expect(next({ time: '02:00' }, '2026-06-10T10:00:00Z', OSLO)).toBe('2026-06-11T00:00:00.000Z')
    expect(next({ time: '02:00' }, '2026-06-10T23:59:00Z', OSLO)).toBe('2026-06-11T00:00:00.000Z')
    expect(next({ time: '02:00' }, '2026-06-11T00:00:00Z', OSLO)).toBe('2026-06-12T00:00:00.000Z')
    expect(next({ time: '02:00' }, '2026-01-15T12:00:00Z', NY)).toBe('2026-01-16T07:00:00.000Z')
    expect(next({ time: '23:45' }, '2026-01-15T12:00:00Z', NY)).toBe('2026-01-16T04:45:00.000Z')
  })

  it('weekly runs on the weekday and wraps the week', () => {
    // Wednesday 10 June 2026 → Monday 15 June 03:00 CEST.
    expect(
      next({ frequency: 'weekly', weekday: 1, time: '03:00' }, '2026-06-10T10:00:00Z', OSLO)
    ).toBe('2026-06-15T01:00:00.000Z')
    // Saturday → Sunday the next day.
    expect(
      next({ frequency: 'weekly', weekday: 0, time: '03:00' }, '2026-06-13T10:00:00Z', OSLO)
    ).toBe('2026-06-14T01:00:00.000Z')
    // Sunday after the time → the Sunday after.
    expect(
      next({ frequency: 'weekly', weekday: 0, time: '03:00' }, '2026-06-14T10:00:00Z', OSLO)
    ).toBe('2026-06-21T01:00:00.000Z')
    // Saturday 23:30 EST is Sunday in UTC.
    expect(
      next({ frequency: 'weekly', weekday: 6, time: '23:30' }, '2026-01-18T04:45:00Z', NY)
    ).toBe('2026-01-25T04:30:00.000Z')
    expect(
      next({ frequency: 'weekly', weekday: 6, time: '23:30' }, '2026-01-17T12:00:00Z', NY)
    ).toBe('2026-01-18T04:30:00.000Z')
  })

  it('monthly runs on the set day', () => {
    expect(
      next({ frequency: 'monthly', monthDay: '15', time: '02:00' }, '2026-01-20T00:00:00Z', NY)
    ).toBe('2026-02-15T07:00:00.000Z')
    expect(
      next({ frequency: 'monthly', monthDay: '1', time: '02:00' }, '2026-12-05T00:00:00Z', OSLO)
    ).toBe('2027-01-01T01:00:00.000Z')
  })

  it("monthly 'last' is the last day, 29 February in a leap year", () => {
    const last = { frequency: 'monthly' as const, monthDay: 'last', time: '02:00' }
    expect(next(last, '2028-02-10T00:00:00Z', OSLO)).toBe('2028-02-29T01:00:00.000Z')
    expect(next(last, '2027-02-10T00:00:00Z', OSLO)).toBe('2027-02-28T01:00:00.000Z')
    expect(next(last, '2026-01-31T01:00:00Z', OSLO)).toBe('2026-02-28T01:00:00.000Z')
    expect(next(last, '2026-04-01T00:00:00Z', NY)).toBe('2026-04-30T06:00:00.000Z')
  })
})

describe('nextRunAfter: DST', () => {
  it('spring forward: a time in the gap runs at the first instant after it (Oslo)', () => {
    // 29 March 2026, 02:00 CET jumps to 03:00 CEST at 01:00Z.
    expect(next({ time: '02:30' }, '2026-03-28T12:00:00Z', OSLO)).toBe('2026-03-29T01:00:00.000Z')
    expect(next({ time: '02:30' }, '2026-03-29T01:00:00Z', OSLO)).toBe('2026-03-30T00:30:00.000Z')
    expect(next({ time: '02:00' }, '2026-03-28T12:00:00Z', OSLO)).toBe('2026-03-29T01:00:00.000Z')
  })

  it('spring forward: a time in the gap runs at the first instant after it (New York)', () => {
    // 8 March 2026, 02:00 EST jumps to 03:00 EDT at 07:00Z.
    expect(next({ time: '02:30' }, '2026-03-07T12:00:00Z', NY)).toBe('2026-03-08T07:00:00.000Z')
    expect(next({ time: '02:30' }, '2026-03-08T07:00:00Z', NY)).toBe('2026-03-09T06:30:00.000Z')
  })

  it('spring forward: the times either side keep their wall clock', () => {
    expect(next({ time: '01:30' }, '2026-03-28T12:00:00Z', OSLO)).toBe('2026-03-29T00:30:00.000Z')
    expect(next({ time: '03:30' }, '2026-03-28T12:00:00Z', OSLO)).toBe('2026-03-29T01:30:00.000Z')
  })

  it('autumn repeat runs once (Oslo)', () => {
    // 25 October 2026, 03:00 CEST falls back to 02:00 CET at 01:00Z.
    const runs = runsBetween(
      { time: '02:30' },
      '2026-10-24T12:00:00Z',
      '2026-10-26T12:00:00Z',
      OSLO
    )
    expect(runs).toHaveLength(2)
    expect(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']).toContain(runs[0])
    expect(runs[1]).toBe('2026-10-26T01:30:00.000Z')
  })

  it('autumn repeat runs once (New York)', () => {
    // 1 November 2026, 02:00 EDT falls back to 01:00 EST at 06:00Z.
    const runs = runsBetween({ time: '01:30' }, '2026-10-31T12:00:00Z', '2026-11-02T12:00:00Z', NY)
    expect(runs).toHaveLength(2)
    expect(['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']).toContain(runs[0])
    expect(runs[1]).toBe('2026-11-02T06:30:00.000Z')
  })

  it('daily runs keep the wall clock across a change', () => {
    const runs = runsBetween(
      { time: '02:00' },
      '2026-10-23T12:00:00Z',
      '2026-10-27T12:00:00Z',
      OSLO
    )
    expect(runs).toHaveLength(4)
    expect(runs[0]).toBe('2026-10-24T00:00:00.000Z')
    // 02:00 happens twice on the 25th; either is fine, once.
    expect(['2026-10-25T00:00:00.000Z', '2026-10-25T01:00:00.000Z']).toContain(runs[1])
    expect(runs.slice(2)).toEqual(['2026-10-26T01:00:00.000Z', '2026-10-27T01:00:00.000Z'])
  })

  it('hourly runs every real hour through both changes', () => {
    expect(
      runsBetween({ frequency: 'hourly' }, '2026-10-24T22:30:00Z', '2026-10-25T03:30:00Z', OSLO)
    ).toHaveLength(5)
    expect(
      runsBetween({ frequency: 'hourly' }, '2026-03-28T22:30:00Z', '2026-03-29T03:30:00Z', OSLO)
    ).toHaveLength(5)
  })

  it('weekly on a spring-forward Sunday', () => {
    expect(
      next({ frequency: 'weekly', weekday: 0, time: '02:15' }, '2026-03-27T12:00:00Z', OSLO)
    ).toBe('2026-03-29T01:00:00.000Z')
  })
})

describe('nextRunAfter: offsets', () => {
  it('adds the offset to the slot', () => {
    expect(next({ time: '02:00' }, '2026-06-10T12:00:00Z', OSLO, 7)).toBe(
      '2026-06-11T00:07:00.000Z'
    )
  })

  it('counts the offset as part of the run time', () => {
    expect(next({ time: '02:00' }, '2026-06-11T00:03:00Z', OSLO, 7)).toBe(
      '2026-06-11T00:07:00.000Z'
    )
    expect(next({ time: '02:00' }, '2026-06-11T00:07:00Z', OSLO, 7)).toBe(
      '2026-06-12T00:07:00.000Z'
    )
  })

  it('works for hourly', () => {
    expect(next({ frequency: 'hourly' }, '2026-06-10T10:05:00Z', OSLO, 9)).toBe(
      '2026-06-10T10:09:00.000Z'
    )
    expect(next({ frequency: 'hourly' }, '2026-06-10T10:09:00Z', OSLO, 9)).toBe(
      '2026-06-10T11:09:00.000Z'
    )
  })
})

describe('isDue', () => {
  const daily = settings({ time: '02:00' })

  it('is due once the next slot after the last run has passed', () => {
    const last = new Date('2026-06-11T00:07:00Z')
    expect(isDue(daily, last, new Date('2026-06-12T00:06:00Z'), OSLO, 7)).toBe(false)
    expect(isDue(daily, last, new Date('2026-06-12T00:10:00Z'), OSLO, 7)).toBe(true)
  })

  it('a late run still counts for its slot', () => {
    const last = new Date('2026-06-11T00:12:00Z')
    expect(isDue(daily, last, new Date('2026-06-11T12:00:00Z'), OSLO, 7)).toBe(false)
  })

  it('a missed slot is caught up', () => {
    const last = new Date('2026-06-09T00:07:00Z')
    expect(isDue(daily, last, new Date('2026-06-11T12:00:00Z'), OSLO, 7)).toBe(true)
  })

  it('a new connection waits for the next slot', () => {
    expect(isDue(daily, null, new Date('2026-06-10T14:00:00Z'), OSLO, 0)).toBe(false)
    expect(isDue(daily, null, new Date('2026-06-11T00:05:00Z'), OSLO, 0)).toBe(true)
    expect(isDue(daily, null, new Date('2026-06-11T00:12:00Z'), OSLO, 0)).toBe(false)
  })
})

describe('spreadOffsetMinutes', () => {
  it('is stable and between 0 and 9', () => {
    const values = new Set<number>()
    for (let i = 0; i < 200; i++) {
      const id = `org_${i.toString(36)}_cm${i * 7919}`
      const v = spreadOffsetMinutes(id)
      expect(v).toBe(spreadOffsetMinutes(id))
      expect(Number.isInteger(v) && v >= 0 && v <= 9).toBe(true)
      values.add(v)
    }
    expect(values.size).toBeGreaterThanOrEqual(8)
  })
})

describe('intervalMs', () => {
  it('is one period of the frequency', () => {
    expect(intervalMs({ frequency: 'hourly' })).toBe(3_600_000)
    expect(intervalMs({ frequency: 'every4h' })).toBe(4 * 3_600_000)
    expect(intervalMs({ frequency: 'daily' })).toBe(24 * 3_600_000)
    expect(intervalMs({ frequency: 'weekly' })).toBe(7 * 24 * 3_600_000)
  })
})

describe('retentionFlags', () => {
  it('lists the keep flags in order', () => {
    expect(retentionFlags(BACKUP_SETTING_DEFAULTS)).toEqual([
      '--keep-hourly',
      '24',
      '--keep-daily',
      '14',
      '--keep-weekly',
      '8',
      '--keep-monthly',
      '12',
    ])
  })

  it('skips zeros', () => {
    expect(retentionFlags({ keepHourly: 0, keepDaily: 7, keepWeekly: 0, keepMonthly: 3 })).toEqual([
      '--keep-daily',
      '7',
      '--keep-monthly',
      '3',
    ])
    expect(retentionFlags({ keepHourly: 0, keepDaily: 0, keepWeekly: 0, keepMonthly: 0 })).toEqual(
      []
    )
  })
})

describe('readBackupSettings', () => {
  it('fills defaults', () => {
    expect(readBackupSettings({})).toEqual(BACKUP_SETTING_DEFAULTS)
  })

  it('keeps valid values, including strings from the form', () => {
    expect(
      readBackupSettings({
        frequency: 'weekly',
        time: '23:15',
        weekday: '3',
        monthDay: 15,
        contents: 'dataAndSecrets',
        includeFiles: 'false',
        keepHourly: '0',
        keepDaily: 30,
        keepWeekly: 4,
        keepMonthly: 24,
      })
    ).toEqual({
      frequency: 'weekly',
      time: '23:15',
      weekday: 3,
      monthDay: '15',
      contents: 'dataAndSecrets',
      includeFiles: false,
      keepHourly: 0,
      keepDaily: 30,
      keepWeekly: 4,
      keepMonthly: 24,
    })
    expect(readBackupSettings({ monthDay: 'last' }).monthDay).toBe('last')
  })

  it('rejects invalid values', () => {
    const s = readBackupSettings({
      frequency: 'yearly',
      time: '25:00',
      weekday: 9,
      monthDay: '29',
      contents: 'everything',
      includeFiles: 'maybe',
      keepHourly: 5000,
      keepDaily: -3,
      keepWeekly: 'lots',
      keepMonthly: 1.5,
    })
    expect(s).toEqual({
      ...BACKUP_SETTING_DEFAULTS,
      keepHourly: 1000,
      keepDaily: 0,
    })
    expect(readBackupSettings({ time: '2:00' }).time).toBe('02:00')
    expect(readBackupSettings({ monthDay: '0' }).monthDay).toBe('1')
    expect(readBackupSettings({ monthDay: '31' }).monthDay).toBe('1')
  })
})
