import 'server-only'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { resolveWorkshopTimeZone } from '@/lib/workshop-timezone'
import { zonedParts } from '@/lib/timezone'
import { type HolidayFeed, parseFeeds } from './holidays'
import { fetchIcs } from './icsFetch.server'
import { parseIcs } from './ics'
import { readSettings, writeSetting } from './settingsStore.server'

/**
 * Holiday calendars (.ics) kept in the workshop's settings. Events are read
 * for last year through five years ahead, enough for any holiday calendar and
 * small enough to keep in a setting.
 */

const YEARS_BACK = 1
const YEARS_AHEAD = 5

export class FeedReadError extends Error {}

export async function workshopYear(organizationId: string, now = new Date()): Promise<number> {
  const settings = await readSettings(organizationId, [
    SETTING_KEYS.TIMEZONE,
    SETTING_KEYS.TIMEZONE_DETECTED,
  ])
  const zone = resolveWorkshopTimeZone(
    settings.get(SETTING_KEYS.TIMEZONE),
    settings.get(SETTING_KEYS.TIMEZONE_DETECTED)
  )
  return zonedParts(now, zone).year
}

/** A calendar's events from its text, or an error that says what was wrong. */
export function eventsFromText(text: string, year: number) {
  const parsed = parseIcs(text, { fromYear: year - YEARS_BACK, toYear: year + YEARS_AHEAD })
  if (parsed.events.length === 0) {
    throw new FeedReadError('The calendar has no days in the coming years')
  }
  return parsed
}

export async function readFeeds(organizationId: string): Promise<HolidayFeed[]> {
  const settings = await readSettings(organizationId, [SETTING_KEYS.HOLIDAY_FEEDS])
  return parseFeeds(settings.get(SETTING_KEYS.HOLIDAY_FEEDS))
}

export async function writeFeeds(
  organizationId: string,
  feeds: HolidayFeed[],
  userId?: string
): Promise<void> {
  await writeSetting(organizationId, SETTING_KEYS.HOLIDAY_FEEDS, JSON.stringify(feeds), userId)
}

/**
 * Read a linked calendar again. Its events are replaced only when the read
 * succeeds; a failure keeps the days it had and records why.
 */
export async function refreshFeed(
  feed: HolidayFeed,
  year: number,
  now = new Date()
): Promise<HolidayFeed> {
  if (!feed.url) return feed
  try {
    const parsed = eventsFromText(await fetchIcs(feed.url), year)
    return { ...feed, events: parsed.events, fetchedAt: now.toISOString(), error: null }
  } catch (error) {
    return {
      ...feed,
      error: error instanceof Error ? error.message : 'Could not read the calendar',
    }
  }
}

/** Every linked calendar of the workshop, read again. Returns the feeds as stored. */
export async function refreshLinkedFeeds(
  organizationId: string,
  opts: { now?: Date; userId?: string } = {}
): Promise<HolidayFeed[]> {
  const feeds = await readFeeds(organizationId)
  if (!feeds.some((f) => f.url)) return feeds
  const year = await workshopYear(organizationId, opts.now)
  const refreshed = await Promise.all(feeds.map((f) => refreshFeed(f, year, opts.now)))
  await writeFeeds(organizationId, refreshed, opts.userId)
  return refreshed
}
