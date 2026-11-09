/**
 * Public holidays and holiday calendars, read into closed days.
 *
 * Holiday sources list more than a workshop closes for (observances,
 * regional days elsewhere, bank days), so what matters is which days end up
 * closed by default, and that a workshop's choice sticks.
 */

import { describe, it, expect } from 'vitest'
import { parseIcs } from '@/features/workshop-calendar/Lib/ics'
import {
  type HolidayCache,
  type HolidayFeed,
  type NagerHoliday,
  feedClosures,
  feedRows,
  holidayRows,
  publicHolidayClosures,
  regionsOf,
} from '@/features/workshop-calendar/Lib/holidays'

const h = (over: Partial<NagerHoliday> & { date: string; name: string }): NagerHoliday => ({
  localName: over.name,
  countryCode: 'AU',
  global: true,
  counties: null,
  types: ['Public'],
  ...over,
})

const AU: HolidayCache = {
  country: 'AU',
  fetchedAt: '2026-11-09T00:00:00.000Z',
  years: {
    '2026': [
      h({ date: '2026-01-26', name: 'Australia Day' }),
      h({ date: '2026-03-02', name: 'Labour Day', global: false, counties: ['AU-WA'] }),
      h({ date: '2026-05-04', name: 'Labour Day', global: false, counties: ['AU-QLD'] }),
      h({ date: '2026-11-03', name: 'Melbourne Cup', global: false, counties: ['AU-VIC'] }),
      h({ date: '2026-12-25', name: 'Christmas Day' }),
      h({ date: '2026-12-24', name: 'Christmas Eve', types: ['Bank'] }),
    ],
    '2027': [h({ date: '2027-12-25', name: 'Christmas Day' })],
  },
}

describe('public holidays', () => {
  it('closes for nationwide public holidays and those of the chosen regions', () => {
    const closed = publicHolidayClosures(AU, ['AU-QLD'], {})
    expect(closed.map((c) => `${c.startDate} ${c.name}`)).toEqual([
      '2026-01-26 Australia Day',
      '2026-05-04 Labour Day',
      '2026-12-25 Christmas Day',
      '2027-12-25 Christmas Day',
    ])
  })

  it('counts only nationwide holidays when no region is chosen', () => {
    const names = publicHolidayClosures(AU, [], {}).map((c) => c.name)
    expect(names).not.toContain('Labour Day')
    expect(names).not.toContain('Melbourne Cup')
  })

  it('leaves bank and other non-public days open unless the workshop closes them', () => {
    expect(publicHolidayClosures(AU, [], {}).map((c) => c.name)).not.toContain('Christmas Eve')
    expect(publicHolidayClosures(AU, [], { 'Christmas Eve': true }).map((c) => c.name)).toContain(
      'Christmas Eve'
    )
  })

  it('stays open on a public holiday the workshop switched off, every year', () => {
    const closed = publicHolidayClosures(AU, [], { 'Christmas Day': false })
    expect(closed.map((c) => c.name)).not.toContain('Christmas Day')
  })

  it('lists each holiday once with all its dates, and the regions to choose from', () => {
    const rows = holidayRows(AU, ['AU-QLD'], { 'Australia Day': false }, [2026, 2027])
    const christmas = rows.find((r) => r.key === 'Christmas Day')
    expect(christmas?.dates).toEqual(['2026-12-25', '2027-12-25'])
    expect(rows.find((r) => r.key === 'Australia Day')?.closed).toBe(false)
    expect(rows.find((r) => r.key === 'Labour Day')).toMatchObject({ regional: true, closed: true })
    expect(rows.find((r) => r.key === 'Christmas Eve')).toMatchObject({
      closed: false,
      closedByDefault: false,
    })
    expect(regionsOf(AU)).toEqual(['AU-QLD', 'AU-VIC', 'AU-WA'])
  })
})

describe('holiday calendars', () => {
  const feed: HolidayFeed = {
    id: 'f1',
    name: 'Holidays in Australia',
    url: null,
    fileName: 'au.ics',
    events: [
      { uid: '1', name: 'Christmas Day', startDate: '2026-12-25', endDate: '2026-12-25' },
      { uid: '2', name: 'Valentine’s Day', startDate: '2026-02-14', endDate: '2026-02-14' },
      { uid: '3', name: 'Christmas Day', startDate: '2027-12-25', endDate: '2027-12-25' },
    ],
    choices: { 'Valentine’s Day': false },
    fetchedAt: null,
    error: null,
  }

  it('closes on every day of a calendar except those switched off', () => {
    expect(feedClosures([feed]).map((c) => `${c.startDate} ${c.name}`)).toEqual([
      '2026-12-25 Christmas Day',
      '2027-12-25 Christmas Day',
    ])
  })

  it('lists a calendar by name with its dates in the years shown', () => {
    expect(feedRows(feed, '2026-01-01', '2026-12-31')).toEqual([
      { name: 'Valentine’s Day', dates: ['2026-02-14'], closed: false },
      { name: 'Christmas Day', dates: ['2026-12-25'], closed: true },
    ])
  })
})

describe('reading an .ics calendar', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'X-WR-CALNAME:Queensland public holidays',
    'BEGIN:VEVENT',
    'UID:a',
    'DTSTART;VALUE=DATE:20261225',
    'DTEND;VALUE=DATE:20261226',
    'SUMMARY:Christmas Day',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:b',
    'DTSTART;VALUE=DATE:20261224',
    'DTEND;VALUE=DATE:20261228',
    // A folded line: the continuation starts with a space.
    'SUMMARY:Christmas shutdown\\, wor',
    ' kshop closed',
    'BEGIN:VALARM',
    'SUMMARY:Not the event',
    'END:VALARM',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:c',
    'DTSTART:20260814T090000Z',
    'DTEND:20260814T170000Z',
    'SUMMARY:Ekka show day',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:d',
    'DTSTART;VALUE=DATE:20200101',
    'RRULE:FREQ=YEARLY;COUNT=10',
    'SUMMARY:New Year',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:e',
    'DTSTART;VALUE=DATE:20260601',
    'SUMMARY:Cancelled day',
    'STATUS:CANCELLED',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:f',
    'SUMMARY:No date',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  const parsed = parseIcs(ics, { fromYear: 2026, toYear: 2027 })
  const byName = (name: string) => parsed.events.filter((e) => e.name === name)

  it('takes the calendar name and skips what it cannot use', () => {
    expect(parsed.name).toBe('Queensland public holidays')
    expect(parsed.skipped).toBe(1)
    expect(byName('Cancelled day')).toEqual([])
  })

  it('reads an all-day end as the day after the last one', () => {
    expect(byName('Christmas Day')[0]).toMatchObject({
      startDate: '2026-12-25',
      endDate: '2026-12-25',
    })
    expect(byName('Christmas shutdown, workshop closed')[0]).toMatchObject({
      startDate: '2026-12-24',
      endDate: '2026-12-27',
    })
  })

  it('counts a timed event for the day it is on', () => {
    expect(byName('Ekka show day')[0]).toMatchObject({
      startDate: '2026-08-14',
      endDate: '2026-08-14',
    })
  })

  it('repeats a yearly event in the years asked for, within its count', () => {
    expect(byName('New Year').map((e) => e.startDate)).toEqual(['2026-01-01', '2027-01-01'])
    const short = parseIcs(ics.replace('COUNT=10', 'COUNT=3'), { fromYear: 2026, toYear: 2027 })
    expect(short.events.filter((e) => e.name === 'New Year')).toEqual([])
  })
})

describe("Google's holiday calendars", () => {
  // As Google writes them: a holiday has one line of description, an
  // observance a second line on how to hide observances, in the calendar's
  // own language.
  const google = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:20261225_a@google.com',
    'DTSTART;VALUE=DATE:20261225',
    'DTEND;VALUE=DATE:20261226',
    'SUMMARY:Første juledag',
    'DESCRIPTION:Offentlig høytidsdag',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:20261129_b@google.com',
    'DTSTART;VALUE=DATE:20261129',
    'DTEND;VALUE=DATE:20261130',
    'SUMMARY:Første søndag i advent',
    'DESCRIPTION:Helligdag\\nDu kan skjule helligdager ved å gå til Google Kalender',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:20260214_c@google.com',
    'DTSTART;VALUE=DATE:20260214',
    'DTEND;VALUE=DATE:20260215',
    "SUMMARY:Valentine's Day",
    'DESCRIPTION:Observance\\nTo hide observances\\, go to Google Calendar Settings',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const parsed = parseIcs(google, { fromYear: 2026, toYear: 2026 })
  const feed: HolidayFeed = {
    id: 'g',
    name: 'Holidays',
    url: null,
    fileName: null,
    events: parsed.events,
    choices: {},
    fetchedAt: null,
    error: null,
  }

  it('closes for the holidays and stays open on observances', () => {
    expect(feedClosures([feed]).map((c) => c.name)).toEqual(['Første juledag'])
    expect(feedRows(feed, '2026-01-01', '2026-12-31').map((r) => `${r.name}: ${r.closed}`)).toEqual(
      ["Valentine's Day: false", 'Første søndag i advent: false', 'Første juledag: true']
    )
  })

  it('closes on an observance once the workshop says so', () => {
    const chosen = { ...feed, choices: { 'Første søndag i advent': true } }
    expect(feedClosures([chosen]).map((c) => c.name)).toEqual([
      'Første søndag i advent',
      'Første juledag',
    ])
  })

  it('reads a second line from any other calendar as just a description', () => {
    const other = parseIcs(google.replaceAll('@google.com', '@example.gov'), {
      fromYear: 2026,
      toYear: 2026,
    })
    expect(other.events.every((e) => !e.observance)).toBe(true)
  })
})
