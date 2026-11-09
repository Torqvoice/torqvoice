import { addDays, inYear, isDateKey } from './calendar'
import type { FeedEvent } from './holidays'

/**
 * Just enough of iCalendar (RFC 5545) to read a holiday calendar: Google's
 * public holiday calendars, government feeds, an export from Outlook.
 *
 * Holidays are whole days, so every event is read as the days it covers;
 * a timed event counts for the day it starts and the days it runs into. A
 * yearly repeat is expanded over the years asked for; any other repeat counts
 * once, which no holiday calendar needs.
 */

export interface ParsedCalendar {
  /** The calendar's own name (X-WR-CALNAME), when it gives one. */
  name: string | null
  events: FeedEvent[]
  /** Events the reader could not use (no date, a date it could not read). */
  skipped: number
}

interface Property {
  name: string
  params: Record<string, string>
  value: string
}

/** Lines with RFC 5545 folding undone: a line starting with a space continues the last. */
function unfold(text: string): string[] {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
}

function parseLine(line: string): Property | null {
  // The value starts at the first colon outside a quoted parameter value.
  let inQuotes = false
  let colon = -1
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ':' && !inQuotes) {
      colon = i
      break
    }
  }
  if (colon <= 0) return null
  const [rawName, ...rawParams] = line.slice(0, colon).split(';')
  const params: Record<string, string> = {}
  for (const p of rawParams) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name: rawName.toUpperCase(), params, value: line.slice(colon + 1) }
}

/** TEXT values escape commas, semicolons, backslashes and new lines. */
export function unescapeText(value: string): string {
  return value
    .replace(/\\([\\;,nN])/g, (_, ch: string) => (ch === 'n' || ch === 'N' ? ' ' : ch))
    .trim()
}

/** "20261225" or "20261225T090000Z" as "2026-12-25". */
function dateOf(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim())
  if (!m) return null
  const key = `${m[1]}-${m[2]}-${m[3]}`
  return isDateKey(key) ? key : null
}

function isDateOnly(prop: Property): boolean {
  return prop.params.VALUE === 'DATE' || /^\d{8}$/.test(prop.value.trim())
}

/** "P1D", "P2W", "PT12H" as whole days covered after the first, rounded down. */
function durationDays(value: string): number {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?/.exec(value.trim())
  if (!m) return 0
  return Number(m[1] ?? 0) * 7 + Number(m[2] ?? 0)
}

interface RawEvent {
  uid: string
  summary: string
  start: Property | null
  end: Property | null
  duration: string | null
  rrule: string | null
  cancelled: boolean
  /** The DESCRIPTION exactly as written, escapes and all. */
  description: string
}

/**
 * Google's holiday calendars mix observances in with public holidays
 * (Valentine's Day, the Sundays of Advent) and tell them apart only in the
 * description: an observance carries a second line on how to hide
 * observances, in the calendar's own language; a holiday has one line. A
 * workshop does not close for an observance, so those start open.
 */
function isGoogleObservance(event: RawEvent): boolean {
  return event.uid.endsWith('@google.com') && /\\n/i.test(event.description)
}

function lastDayOf(event: RawEvent, startDate: string): string | null {
  if (event.end) {
    const end = dateOf(event.end.value)
    if (!end) return null
    // An all-day end is the day after the last one; a timed end is the day it ends.
    const last = isDateOnly(event.end) ? addDays(end, -1) : end
    return last < startDate ? startDate : last
  }
  if (event.duration) {
    const days = durationDays(event.duration)
    return addDays(startDate, Math.max(0, event.start && isDateOnly(event.start) ? days - 1 : days))
  }
  return startDate
}

/** The years a yearly rule repeats in, within `from`..`to`. */
function yearlyRepeats(
  rrule: string,
  startDate: string,
  fromYear: number,
  toYear: number
): number[] {
  const parts = Object.fromEntries(
    rrule.split(';').map((p) => {
      const [k, v] = p.split('=')
      return [k.toUpperCase(), v ?? '']
    })
  )
  if (parts.FREQ !== 'YEARLY') return []
  const firstYear = Number(startDate.slice(0, 4))
  const interval = Math.max(1, Number(parts.INTERVAL) || 1)
  const count = parts.COUNT ? Number(parts.COUNT) : Number.POSITIVE_INFINITY
  const until = parts.UNTIL ? dateOf(parts.UNTIL) : null
  const years: number[] = []
  for (let n = 0, year = firstYear; year <= toYear && n < count; n++, year += interval) {
    const date = inYear(startDate, year)
    if (until && date > until) break
    if (year >= fromYear && year !== firstYear) years.push(year)
  }
  return years
}

export function parseIcs(
  text: string,
  { fromYear, toYear, maxEvents = 2000 }: { fromYear: number; toYear: number; maxEvents?: number }
): ParsedCalendar {
  const lines = unfold(text)
  let name: string | null = null
  const raws: RawEvent[] = []
  let current: RawEvent | null = null
  let depth = 0

  for (const line of lines) {
    if (!line.trim()) continue
    const prop = parseLine(line)
    if (!prop) continue
    if (prop.name === 'BEGIN') {
      if (prop.value.toUpperCase() === 'VEVENT' && !current) {
        current = {
          uid: '',
          summary: '',
          start: null,
          end: null,
          duration: null,
          rrule: null,
          cancelled: false,
          description: '',
        }
        depth = 0
      } else if (current) {
        // An alarm or other block inside the event: its lines are not the event's.
        depth++
      }
      continue
    }
    if (prop.name === 'END') {
      if (current && depth > 0) depth--
      else if (current && prop.value.toUpperCase() === 'VEVENT') {
        raws.push(current)
        current = null
      }
      continue
    }
    if (!current) {
      if (prop.name === 'X-WR-CALNAME' && !name) name = unescapeText(prop.value) || null
      continue
    }
    if (depth > 0) continue
    switch (prop.name) {
      case 'UID':
        current.uid = prop.value.trim()
        break
      case 'SUMMARY':
        current.summary = unescapeText(prop.value)
        break
      case 'DESCRIPTION':
        current.description = prop.value
        break
      case 'DTSTART':
        current.start = prop
        break
      case 'DTEND':
        current.end = prop
        break
      case 'DURATION':
        current.duration = prop.value
        break
      case 'RRULE':
        current.rrule = prop.value
        break
      case 'STATUS':
        current.cancelled = prop.value.trim().toUpperCase() === 'CANCELLED'
        break
    }
  }

  const from = `${fromYear}-01-01`
  const to = `${toYear}-12-31`
  const events: FeedEvent[] = []
  const seen = new Set<string>()
  let skipped = 0

  const add = (event: FeedEvent) => {
    if (event.endDate < from || event.startDate > to) return
    const id = `${event.name}|${event.startDate}`
    if (seen.has(id)) return
    seen.add(id)
    events.push(event)
  }

  for (const raw of raws) {
    if (raw.cancelled) continue
    const startDate = raw.start ? dateOf(raw.start.value) : null
    const name = raw.summary
    if (!startDate || !name) {
      skipped++
      continue
    }
    const endDate = lastDayOf(raw, startDate)
    if (!endDate) {
      skipped++
      continue
    }
    const uid = raw.uid || `${startDate}-${name}`
    const observance = isGoogleObservance(raw) ? { observance: true } : {}
    add({ uid, name, startDate, endDate, ...observance })
    if (raw.rrule) {
      const length = Math.round(
        (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000
      )
      for (const year of yearlyRepeats(raw.rrule, startDate, fromYear, toYear)) {
        const repeatStart = inYear(startDate, year)
        add({
          uid: `${uid}/${year}`,
          name,
          startDate: repeatStart,
          endDate: addDays(repeatStart, length),
          ...observance,
        })
      }
    }
  }

  events.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name))
  return { name, events: events.slice(0, maxEvents), skipped }
}
