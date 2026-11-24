/**
 * How the portal prints dates and times: on the workshop's clock, in the
 * portal's language. The workshop is in Auckland (UTC+13 in November), so a
 * moment that is still yesterday in UTC is already today there.
 */

import { describe, expect, it } from 'vitest'
import { buildPortalFormat } from '@/features/portal/Lib/portalFormat'

// 18 Nov 2026, 11:00 in Auckland; still 17 Nov in UTC.
const now = new Date('2026-11-17T22:00:00Z')

const make = (locale: string, timeFormat: '12h' | '24h', dateFormat = 'dd/MM/yyyy') =>
  buildPortalFormat({
    locale,
    timeZone: 'Pacific/Auckland',
    timeFormat,
    dateFormat,
    money: (amount) => `${amount} kr`,
    today: locale === 'nb' ? 'i dag' : 'today',
    tomorrow: locale === 'nb' ? 'i morgen' : 'tomorrow',
    now,
  })

// 08:12 on 18 Nov in Auckland.
const morning = '2026-11-17T19:12:00Z'
// 15:05 on 19 Nov in Auckland.
const tomorrowAfternoon = '2026-11-19T02:05:00Z'
// 09:00 on 3 Dec in Auckland, though 2 Dec in UTC.
const later = '2026-12-02T20:00:00Z'
// 10:00 on 4 Feb 2027 in Auckland.
const nextYear = '2027-02-03T21:00:00Z'

describe('portal dates and times, en-GB', () => {
  const f24 = make('en-GB', '24h')
  const f12 = make('en-GB', '12h')

  it("prints the day on the workshop calendar in the workshop's date format", () => {
    expect(f24.day(later)).toBe('03/12/2026')
    expect(f24.day(nextYear)).toBe('04/02/2027')
    // Still 17 Nov in UTC, already 18 Nov in Auckland.
    expect(f24.day(morning)).toBe('18/11/2026')
  })

  it('follows another date format the workshop chose', () => {
    const us = make('en-GB', '24h', 'MM/dd/yyyy')
    expect(us.day(later)).toBe('12/03/2026')
    expect(us.relativeDay(later)).toBe('12/03/2026')
  })

  it('prints the long day with its weekday', () => {
    expect(f24.dayLong(later)).toBe('Thursday 3 December')
  })

  it('prints a 24 hour time with a two-digit hour', () => {
    expect(f24.time(morning)).toBe('08:12')
    expect(f24.time(tomorrowAfternoon)).toBe('15:05')
  })

  it('prints a 12 hour time without the leading zero', () => {
    expect(f12.time(morning)).toMatch(/^8:12\sam$/i)
    expect(f12.time(tomorrowAfternoon)).toMatch(/^3:05\spm$/i)
  })

  it('names today and tomorrow on the workshop calendar, and any other day by date', () => {
    expect(f24.relativeDay(morning)).toBe('today')
    expect(f24.relativeDay(tomorrowAfternoon)).toBe('tomorrow')
    expect(f24.relativeDay(later)).toBe('03/12/2026')
  })

  it('prints a bare opening time as it stands, in either clock', () => {
    expect(f24.clock('07:00')).toBe('07:00')
    expect(f24.clock('16:30')).toBe('16:30')
    expect(f12.clock('07:00')).toMatch(/^7:00\sam$/i)
    expect(f12.clock('16:30')).toMatch(/^4:30\spm$/i)
  })
})

describe('portal dates and times, Norwegian', () => {
  const f24 = make('nb', '24h')

  it('prints the long day in Norwegian and the day in the workshop format', () => {
    expect(f24.day(later)).toBe('03/12/2026')
    expect(f24.dayLong(later)).toBe('torsdag 3. desember')
  })

  it('prints times with a two-digit hour', () => {
    expect(f24.time(morning)).toBe('08:12')
    expect(f24.clock('07:00')).toBe('07:00')
  })

  it('names today and tomorrow in the portal language', () => {
    expect(f24.relativeDay(morning)).toBe('i dag')
    expect(f24.relativeDay(tomorrowAfternoon)).toBe('i morgen')
    expect(f24.relativeDay(later)).toBe('03/12/2026')
  })
})

describe('tread depth', () => {
  const base = {
    timeZone: 'Pacific/Auckland',
    timeFormat: '24h' as const,
    dateFormat: 'dd/MM/yyyy',
    money: (amount: number) => `${amount} kr`,
    today: 'today',
    tomorrow: 'tomorrow',
    now,
  }

  it('is millimetres to one decimal, without a trailing zero, in the language of the page', () => {
    const en = buildPortalFormat({ ...base, locale: 'en-GB' })
    expect(en.tread(5)).toBe('5 mm')
    expect(en.tread(4.26)).toBe('4.3 mm')
    expect(buildPortalFormat({ ...base, locale: 'nb' }).tread(4.5)).toBe('4,5 mm')
  })

  it('is whole 32nds of an inch for a workshop that measures in inches', () => {
    const imperial = buildPortalFormat({ ...base, locale: 'en-US', imperial: true })
    expect(imperial.tread(4.8)).toBe('6/32″')
    expect(imperial.tread(1.6)).toBe('2/32″')
  })
})
