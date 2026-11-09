import type { ClosedPeriod } from './calendar'
import { addDays, isDateKey } from './calendar'

/**
 * Public holidays and holiday calendars as closures.
 *
 * Two sources, both stored as settings: the public holidays of the
 * workshop's country (and its states or regions) from Nager.Date, and any
 * number of .ics calendars the workshop adds. Each lists more than a workshop
 * closes for, so every holiday can be switched on or off by name, and the
 * choice holds for every year it comes round.
 */

// ─── Nager.Date ──────────────────────────────────────────────────────────────

/** One holiday as date.nager.at returns it. */
export interface NagerHoliday {
  date: string
  /** In the country's own language. */
  localName: string
  /** In English; stable from year to year, so choices are keyed on it. */
  name: string
  countryCode: string
  /** Kept nationwide. When false, `counties` says where. */
  global: boolean
  /** ISO 3166-2 codes ("AU-QLD") where it is kept, or null when nationwide. */
  counties: string[] | null
  /** Public, Bank, School, Authorities, Optional, Observance. */
  types: string[]
}

/** The holidays of the workshop's country, by year, as last fetched. */
export interface HolidayCache {
  country: string
  /** ISO time of the last successful fetch. */
  fetchedAt: string | null
  years: Record<string, NagerHoliday[]>
  /** The last fetch's failure, kept until one succeeds. */
  error?: string | null
}

/** On or off for each holiday, by its key; one missing keeps its default. */
export type HolidayChoices = Record<string, boolean>

export function holidayKey(holiday: Pick<NagerHoliday, 'name'>): string {
  return holiday.name
}

/** Kept where the workshop is: nationwide, or in one of its regions. */
export function appliesTo(holiday: NagerHoliday, regions: readonly string[]): boolean {
  if (holiday.global || !holiday.counties || holiday.counties.length === 0) return true
  return holiday.counties.some((county) => regions.includes(county))
}

/**
 * A public holiday closes the workshop unless it says otherwise. Bank,
 * school, optional and observance days do not: many workshops open on them,
 * and the one that closes ticks it.
 */
export function closedByDefault(holiday: Pick<NagerHoliday, 'types'>): boolean {
  return holiday.types.includes('Public')
}

function isClosed(holiday: NagerHoliday, choices: HolidayChoices): boolean {
  return choices[holidayKey(holiday)] ?? closedByDefault(holiday)
}

/** The regions a country's holidays name, sorted, for the region picker. */
export function regionsOf(cache: HolidayCache | null): string[] {
  if (!cache) return []
  const all = new Set<string>()
  for (const list of Object.values(cache.years)) {
    for (const h of list) for (const c of h.counties ?? []) all.add(c)
  }
  return [...all].sort()
}

/** The public holidays the workshop closes for, as closures. */
export function publicHolidayClosures(
  cache: HolidayCache | null,
  regions: readonly string[],
  choices: HolidayChoices
): ClosedPeriod[] {
  if (!cache) return []
  const out: ClosedPeriod[] = []
  const seen = new Set<string>()
  for (const list of Object.values(cache.years)) {
    for (const h of list) {
      if (!isDateKey(h.date) || !appliesTo(h, regions) || !isClosed(h, choices)) continue
      // A holiday listed twice for different regions on one day is one closure.
      const id = `${h.date}|${holidayKey(h)}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push({
        name: h.localName || h.name,
        source: 'holiday',
        startDate: h.date,
        endDate: h.date,
      })
    }
  }
  return out.sort((a, b) => a.startDate.localeCompare(b.startDate))
}

/** One holiday in the settings list, with every date it falls on. */
export interface HolidayRow {
  key: string
  name: string
  localName: string
  dates: string[]
  types: string[]
  /** Only kept in some regions. */
  regional: boolean
  counties: string[]
  closed: boolean
  closedByDefault: boolean
}

/** The holidays kept where the workshop is, in the given years, one row per holiday. */
export function holidayRows(
  cache: HolidayCache | null,
  regions: readonly string[],
  choices: HolidayChoices,
  years: readonly number[]
): HolidayRow[] {
  if (!cache) return []
  const rows = new Map<string, HolidayRow>()
  for (const year of years) {
    for (const h of cache.years[String(year)] ?? []) {
      if (!appliesTo(h, regions)) continue
      const key = holidayKey(h)
      const row = rows.get(key)
      if (row) {
        if (!row.dates.includes(h.date)) row.dates.push(h.date)
        for (const c of h.counties ?? []) if (!row.counties.includes(c)) row.counties.push(c)
        continue
      }
      rows.set(key, {
        key,
        name: h.name,
        localName: h.localName,
        dates: [h.date],
        types: h.types,
        regional: !h.global && (h.counties?.length ?? 0) > 0,
        counties: [...(h.counties ?? [])],
        closed: isClosed(h, choices),
        closedByDefault: closedByDefault(h),
      })
    }
  }
  for (const row of rows.values()) row.dates.sort()
  return [...rows.values()].sort((a, b) => a.dates[0].localeCompare(b.dates[0]))
}

/** A cache read back from settings, or null when it is missing or not one. */
export function parseHolidayCache(raw: string | null | undefined): HolidayCache | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as HolidayCache
    if (!value || typeof value.country !== 'string' || typeof value.years !== 'object') return null
    return value
  } catch {
    return null
  }
}

export function parseChoices(raw: string | null | undefined): HolidayChoices {
  if (!raw) return {}
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === 'boolean'
      )
    )
  } catch {
    return {}
  }
}

export function parseRegions(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

// ─── Holiday calendars (.ics) ────────────────────────────────────────────────

export interface FeedEvent {
  uid: string
  name: string
  /** First and last day, both included. */
  startDate: string
  endDate: string
}

/** A calendar of holidays added by link or file. */
export interface HolidayFeed {
  id: string
  name: string
  /** Read again every day when set; a file upload has none. */
  url: string | null
  fileName: string | null
  events: FeedEvent[]
  /** On or off by event name; a name missing closes the workshop. */
  choices: HolidayChoices
  fetchedAt: string | null
  error: string | null
}

/** A calendar's events the workshop closes for, as closures. */
export function feedClosures(feeds: readonly HolidayFeed[]): ClosedPeriod[] {
  const out: ClosedPeriod[] = []
  for (const feed of feeds) {
    for (const event of feed.events) {
      if (feed.choices[event.name] === false) continue
      out.push({
        name: event.name,
        source: 'feed',
        startDate: event.startDate,
        endDate: event.endDate,
      })
    }
  }
  return out.sort((a, b) => a.startDate.localeCompare(b.startDate))
}

/** One name in a calendar, with its dates, for the settings list. */
export interface FeedRow {
  name: string
  dates: string[]
  closed: boolean
}

export function feedRows(feed: HolidayFeed, from: string, to: string): FeedRow[] {
  const rows = new Map<string, FeedRow>()
  for (const event of feed.events) {
    if (event.endDate < from || event.startDate > to) continue
    const row = rows.get(event.name) ?? {
      name: event.name,
      dates: [],
      closed: feed.choices[event.name] !== false,
    }
    row.dates.push(event.startDate)
    rows.set(event.name, row)
  }
  for (const row of rows.values()) row.dates.sort()
  return [...rows.values()].sort((a, b) => a.dates[0].localeCompare(b.dates[0]))
}

export function parseFeeds(raw: string | null | undefined): HolidayFeed[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.filter(
      (f): f is HolidayFeed =>
        !!f && typeof f.id === 'string' && typeof f.name === 'string' && Array.isArray(f.events)
    )
  } catch {
    return []
  }
}

/** Days an event covers, for a quick count. */
export function eventDays(event: Pick<FeedEvent, 'startDate' | 'endDate'>): number {
  let n = 0
  for (let key = event.startDate; key <= event.endDate && n < 366; key = addDays(key, 1)) n++
  return n
}
