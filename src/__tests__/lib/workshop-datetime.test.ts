import { describe, expect, it } from 'vitest'
import { parseWorkshopDateTime } from '@/lib/workshop-datetime'

describe('parseWorkshopDateTime', () => {
  it('reads a wall-clock time in the workshop zone, not the server zone', () => {
    expect(parseWorkshopDateTime('2026-09-07T18:00', 'Europe/Oslo').toISOString()).toBe(
      '2026-09-07T16:00:00.000Z'
    )
    expect(parseWorkshopDateTime('2026-01-07T18:00', 'Europe/Oslo').toISOString()).toBe(
      '2026-01-07T17:00:00.000Z'
    )
    expect(parseWorkshopDateTime('2026-09-07T18:00:30', 'America/New_York').toISOString()).toBe(
      '2026-09-07T22:00:00.000Z'
    )
  })

  it('treats a bare date as that day at midnight in the workshop', () => {
    expect(parseWorkshopDateTime('2026-09-07', 'Europe/Oslo').toISOString()).toBe(
      '2026-09-06T22:00:00.000Z'
    )
  })

  it('leaves a string with its own zone alone', () => {
    expect(parseWorkshopDateTime('2026-09-07T18:00:00Z', 'Europe/Oslo').toISOString()).toBe(
      '2026-09-07T18:00:00.000Z'
    )
  })

  it('rejects rubbish', () => {
    expect(() => parseWorkshopDateTime('soon', 'Europe/Oslo')).toThrow('Invalid send time')
  })
})

import {
  endOfWorkshopDay,
  shiftWorkshopTime,
  workshopDayRange,
  workshopMonthKey,
} from '@/lib/workshop-datetime'

describe('endOfWorkshopDay', () => {
  it('is the last millisecond of that day in the workshop', () => {
    expect(endOfWorkshopDay('2026-09-07', 'Europe/Oslo')?.toISOString()).toBe(
      '2026-09-07T21:59:59.999Z'
    )
    expect(endOfWorkshopDay('', 'Europe/Oslo')).toBeUndefined()
  })
})

describe('workshopDayRange', () => {
  it('covers whole workshop days, inclusive of the last', () => {
    const r = workshopDayRange('2026-09-01', '2026-09-30', 'America/Chicago', {
      start: new Date(0),
      end: new Date(0),
    })
    expect(r.gte.toISOString()).toBe('2026-09-01T05:00:00.000Z')
    expect(r.lt.toISOString()).toBe('2026-10-01T05:00:00.000Z')
  })

  it('falls back when a key is missing', () => {
    const fallback = {
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2026-01-31T12:00:00Z'),
    }
    const r = workshopDayRange(undefined, 'nope', 'UTC', fallback)
    expect(r.gte.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(r.lt.toISOString()).toBe('2026-02-01T00:00:00.000Z')
  })
})

describe('shiftWorkshopTime', () => {
  it('keeps the wall-clock time across a DST change', () => {
    // 18:00 Oslo on 20 Oct (CEST) plus 14 days is 18:00 Oslo on 3 Nov (CET)
    const start = new Date('2026-10-20T16:00:00Z')
    expect(shiftWorkshopTime(start, { days: 14 }, 'Europe/Oslo').toISOString()).toBe(
      '2026-11-03T17:00:00.000Z'
    )
  })

  it('clamps the day at the end of a shorter month', () => {
    const jan31 = new Date('2026-01-31T09:00:00Z')
    expect(shiftWorkshopTime(jan31, { months: 1 }, 'UTC').toISOString()).toBe(
      '2026-02-28T09:00:00.000Z'
    )
  })

  it('steps years', () => {
    expect(
      shiftWorkshopTime(new Date('2026-03-01T08:00:00Z'), { years: 1 }, 'UTC').toISOString()
    ).toBe('2027-03-01T08:00:00.000Z')
  })
})

describe('workshopMonthKey', () => {
  it('buckets by the workshop month, not the UTC one', () => {
    const lateEvening = new Date('2026-09-01T01:30:00Z') // 31 Aug 20:30 in Chicago
    expect(workshopMonthKey(lateEvening, 'America/Chicago')).toBe('2026-08')
    expect(workshopMonthKey(lateEvening, 'UTC')).toBe('2026-09')
  })
})
