import 'server-only'
import { z } from 'zod'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { resolveWorkshopTimeZone } from '@/lib/workshop-timezone'
import { zonedParts } from '@/lib/timezone'
import { type HolidayCache, type NagerHoliday, parseHolidayCache } from './holidays'
import { readSettings, writeSetting } from './settingsStore.server'

/**
 * Public holidays from Nager.Date (https://date.nager.at, MIT licensed, no key).
 *
 * Fetched for last year, this year and next, and kept in the workshop's
 * settings so nothing that books a slot ever waits on the network. Refreshed
 * when the country changes, from the settings page, and once a day by the
 * cron. A failed fetch keeps the holidays already held and records why.
 */

const API = 'https://date.nager.at/api/v3'
const TIMEOUT_MS = 10_000
/** One fetch of a country's year serves every workshop in it for this long. */
const MEMO_MS = 6 * 60 * 60 * 1000

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  localName: z.string(),
  name: z.string(),
  countryCode: z.string(),
  global: z.boolean(),
  counties: z.array(z.string()).nullable().optional(),
  types: z.array(z.string()).default([]),
})

const memo = new Map<string, { at: number; holidays: NagerHoliday[] }>()

export class HolidayFetchError extends Error {}

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    // Nager answers 204 (no content) or 404 for a country it does not cover.
    if (res.status === 204 || res.status === 404) return { status: res.status, body: null }
    if (!res.ok) throw new HolidayFetchError(`Nager.Date answered ${res.status}`)
    return { status: res.status, body: await res.json() }
  } catch (error) {
    if (error instanceof HolidayFetchError) throw error
    throw new HolidayFetchError(
      controller.signal.aborted ? 'Nager.Date did not answer in time' : 'Could not reach Nager.Date'
    )
  } finally {
    clearTimeout(timer)
  }
}

/** One country's holidays for one year. An unsupported country has none. */
export async function fetchNagerYear(country: string, year: number): Promise<NagerHoliday[]> {
  const id = `${country}-${year}`
  const hit = memo.get(id)
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.holidays
  const { body } = await getJson(`${API}/PublicHolidays/${year}/${encodeURIComponent(country)}`)
  const parsed = z.array(holidaySchema).safeParse(body ?? [])
  if (!parsed.success) throw new HolidayFetchError('Nager.Date sent holidays this app cannot read')
  const holidays: NagerHoliday[] = parsed.data.map((h) => ({ ...h, counties: h.counties ?? null }))
  memo.set(id, { at: Date.now(), holidays })
  return holidays
}

let countriesMemo: { at: number; codes: string[] } | null = null

/** The countries Nager.Date has holidays for, as ISO codes. */
export async function fetchNagerCountries(): Promise<string[]> {
  if (countriesMemo && Date.now() - countriesMemo.at < 24 * MEMO_MS) return countriesMemo.codes
  const { body } = await getJson(`${API}/AvailableCountries`)
  const parsed = z.array(z.object({ countryCode: z.string() })).safeParse(body ?? [])
  if (!parsed.success)
    throw new HolidayFetchError('Nager.Date sent a country list this app cannot read')
  const codes = parsed.data.map((c) => c.countryCode.toUpperCase()).sort()
  countriesMemo = { at: Date.now(), codes }
  return codes
}

/** The years held: last, this and next, on the workshop's calendar. */
export function yearsAround(now: Date, timeZone: string): number[] {
  const year = zonedParts(now, timeZone).year
  return [year - 1, year, year + 1]
}

/**
 * Fetch the workshop's country's holidays and store them. Returns the cache
 * as stored, with `error` set when the fetch failed (the holidays held from
 * before are kept). No country clears the cache.
 */
export async function syncPublicHolidays(
  organizationId: string,
  opts: { now?: Date; userId?: string } = {}
): Promise<HolidayCache | null> {
  const settings = await readSettings(organizationId, [
    SETTING_KEYS.HOLIDAY_COUNTRY,
    SETTING_KEYS.HOLIDAY_CACHE,
    SETTING_KEYS.TIMEZONE,
    SETTING_KEYS.TIMEZONE_DETECTED,
  ])
  const country = (settings.get(SETTING_KEYS.HOLIDAY_COUNTRY) || '').toUpperCase()
  const previous = parseHolidayCache(settings.get(SETTING_KEYS.HOLIDAY_CACHE))
  if (!country) {
    if (previous) await writeSetting(organizationId, SETTING_KEYS.HOLIDAY_CACHE, '', opts.userId)
    return null
  }
  const timeZone = resolveWorkshopTimeZone(
    settings.get(SETTING_KEYS.TIMEZONE),
    settings.get(SETTING_KEYS.TIMEZONE_DETECTED)
  )
  const years = yearsAround(opts.now ?? new Date(), timeZone)
  // Holidays held for this country survive a failed fetch; another
  // country's never do.
  const kept = previous?.country === country ? previous.years : {}

  let cache: HolidayCache
  try {
    const fetched = await Promise.all(years.map((y) => fetchNagerYear(country, y)))
    cache = {
      country,
      fetchedAt: (opts.now ?? new Date()).toISOString(),
      years: Object.fromEntries(years.map((y, i) => [String(y), fetched[i]])),
      error: null,
    }
  } catch (error) {
    cache = {
      country,
      fetchedAt: previous?.country === country ? previous.fetchedAt : null,
      years: kept,
      error: error instanceof Error ? error.message : 'Could not fetch holidays',
    }
  }
  await writeSetting(organizationId, SETTING_KEYS.HOLIDAY_CACHE, JSON.stringify(cache), opts.userId)
  return cache
}
