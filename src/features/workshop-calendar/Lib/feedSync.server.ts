import 'server-only'
import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { resolveWorkshopTimeZone } from '@/lib/workshop-timezone'
import { zonedParts } from '@/lib/timezone'
import { type HolidayFeed, parseFeeds } from './holidays'
import { fetchIcs } from './icsFetch.server'
import { parseIcs } from './ics'
import { ownerOf, readSettings } from './settingsStore.server'

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

/**
 * A calendar's events from its text, or an error that says what was wrong.
 * A calendar being added must have days in it; one read again may have lost
 * its last one (removed or cancelled), and then it has none.
 */
export function eventsFromText(text: string, year: number, opts: { allowEmpty?: boolean } = {}) {
  const parsed = parseIcs(text, { fromYear: year - YEARS_BACK, toYear: year + YEARS_AHEAD })
  if (parsed.events.length === 0 && !opts.allowEmpty) {
    throw new FeedReadError('The calendar has no days in the coming years')
  }
  return parsed
}

export async function readFeeds(organizationId: string): Promise<HolidayFeed[]> {
  const settings = await readSettings(organizationId, [SETTING_KEYS.HOLIDAY_FEEDS])
  return parseFeeds(settings.get(SETTING_KEYS.HOLIDAY_FEEDS))
}

/**
 * Change the workshop's calendars: `change` gets the list as it is now and
 * returns the new list. Every write goes through here under one lock per
 * workshop, so a write never puts back a list someone else changed in the
 * meantime: a daily read that took seconds cannot bring back a calendar
 * removed while it ran, or undo a switch.
 */
export async function updateFeeds<T>(
  organizationId: string,
  change: (feeds: HolidayFeed[]) => { feeds: HolidayFeed[]; result: T },
  userId?: string
): Promise<T> {
  const writer = userId || (await ownerOf(organizationId))
  const key = SETTING_KEYS.HOLIDAY_FEEDS
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('holiday_feeds'), hashtext(${organizationId}))`
    const row = await tx.appSetting.findUnique({
      where: { organizationId_key: { organizationId, key } },
      select: { value: true },
    })
    const { feeds, result } = change(parseFeeds(row?.value))
    const value = JSON.stringify(feeds)
    await tx.appSetting.upsert({
      where: { organizationId_key: { organizationId, key } },
      create: { organizationId, key, value, userId: writer },
      update: { value },
    })
    return result
  })
}

/** What reading a linked calendar again found, to apply to the list as it is then. */
export type FeedRead =
  | { id: string; url: string; ok: true; events: HolidayFeed['events']; fetchedAt: string }
  | { id: string; url: string; ok: false; error: string }

/** Read a linked calendar again, outside any lock: it can take seconds. */
export async function readFeedAgain(
  feed: HolidayFeed & { url: string },
  year: number,
  now = new Date()
): Promise<FeedRead> {
  try {
    const parsed = eventsFromText(await fetchIcs(feed.url), year, { allowEmpty: true })
    return {
      id: feed.id,
      url: feed.url,
      ok: true,
      events: parsed.events,
      fetchedAt: now.toISOString(),
    }
  } catch (error) {
    return {
      id: feed.id,
      url: feed.url,
      ok: false,
      error: error instanceof Error ? error.message : 'Could not read the calendar',
    }
  }
}

/**
 * Apply what a read found to the calendars as they are now. Only the days
 * and the read status change; a calendar removed or relinked since is left
 * alone. A failed read keeps the days the calendar had and records why.
 */
export function applyFeedRead(feeds: HolidayFeed[], read: FeedRead): HolidayFeed[] {
  return feeds.map((feed) => {
    if (feed.id !== read.id || feed.url !== read.url) return feed
    return read.ok
      ? { ...feed, events: read.events, fetchedAt: read.fetchedAt, error: null }
      : { ...feed, error: read.error }
  })
}

/** Every linked calendar of the workshop, read again. Returns the feeds as stored. */
export async function refreshLinkedFeeds(
  organizationId: string,
  opts: { now?: Date; userId?: string } = {}
): Promise<HolidayFeed[]> {
  const linked = (await readFeeds(organizationId)).filter(
    (f): f is HolidayFeed & { url: string } => !!f.url
  )
  if (linked.length === 0) return readFeeds(organizationId)
  const year = await workshopYear(organizationId, opts.now)
  const reads = await Promise.all(linked.map((f) => readFeedAgain(f, year, opts.now)))
  return updateFeeds(
    organizationId,
    (feeds) => {
      const next = reads.reduce(applyFeedRead, feeds)
      return { feeds: next, result: next }
    },
    opts.userId
  )
}
