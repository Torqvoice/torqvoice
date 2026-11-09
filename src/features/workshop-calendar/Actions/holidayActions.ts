'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { weekSpan } from '../Lib/calendar'
import {
  type HolidayFeed,
  feedRows,
  holidayRows,
  parseChoices,
  parseFeeds,
  parseHolidayCache,
  parseRegions,
  regionsOf,
} from '../Lib/holidays'
import { closuresEnabled, weekFromSettings } from '../Lib/loadCalendar.server'
import { fetchNagerCountries, syncPublicHolidays } from '../Lib/holidaySync.server'
import {
  FeedReadError,
  eventsFromText,
  readFeeds,
  refreshFeed,
  workshopYear,
  writeFeeds,
} from '../Lib/feedSync.server'
import { fetchIcs } from '../Lib/icsFetch.server'
import { readSettings, writeSetting } from '../Lib/settingsStore.server'
import {
  MAX_FEEDS,
  MAX_FEED_BYTES,
  feedUrlSchema,
  holidayCountrySchema,
  weekHoursSchema,
} from '../Schema/calendarSchema'

/**
 * Settings for when the workshop is open: hours per weekday, the switch for
 * closed days and time off, public holidays and holiday calendars.
 */

const READ = { action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }
const UPDATE = { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }

const SETTINGS_KEYS = [
  SETTING_KEYS.OPENING_HOURS,
  SETTING_KEYS.WORKBOARD_WORK_DAY_START,
  SETTING_KEYS.WORKBOARD_WORK_DAY_END,
  'workboard.showWeekends',
  SETTING_KEYS.CLOSURES_ENABLED,
  SETTING_KEYS.HOLIDAY_COUNTRY,
  SETTING_KEYS.HOLIDAY_REGIONS,
  SETTING_KEYS.HOLIDAY_CHOICES,
  SETTING_KEYS.HOLIDAY_CACHE,
  SETTING_KEYS.HOLIDAY_FEEDS,
]

function revalidate() {
  revalidatePath('/settings', 'layout')
  revalidatePath('/work-board')
  revalidatePath('/calendar')
}

/** A calendar as the settings page shows it, without the full list of events. */
function feedView(feed: HolidayFeed, year: number) {
  return {
    id: feed.id,
    name: feed.name,
    url: feed.url,
    fileName: feed.fileName,
    fetchedAt: feed.fetchedAt,
    error: feed.error,
    eventCount: feed.events.length,
    rows: feedRows(feed, `${year}-01-01`, `${year + 1}-12-31`),
  }
}

/** Everything the holidays page shows. */
export async function getHolidaySettings() {
  return withAuth(
    async ({ organizationId }) => {
      const map = await readSettings(organizationId, SETTINGS_KEYS)
      const year = await workshopYear(organizationId)
      const country = map.get(SETTING_KEYS.HOLIDAY_COUNTRY) || ''
      const regions = parseRegions(map.get(SETTING_KEYS.HOLIDAY_REGIONS))
      const choices = parseChoices(map.get(SETTING_KEYS.HOLIDAY_CHOICES))
      const stored = parseHolidayCache(map.get(SETTING_KEYS.HOLIDAY_CACHE))
      const cache = stored && stored.country === country ? stored : null
      return {
        enabled: closuresEnabled(map.get(SETTING_KEYS.CLOSURES_ENABLED)),
        week: weekFromSettings(map),
        year,
        country,
        regions,
        availableRegions: regionsOf(cache),
        fetchedAt: cache?.fetchedAt ?? null,
        fetchError: cache?.error ?? null,
        holidays: holidayRows(cache, regions, choices, [year, year + 1]),
        feeds: parseFeeds(map.get(SETTING_KEYS.HOLIDAY_FEEDS)).map((f) => feedView(f, year)),
      }
    },
    { requiredPermissions: [READ] }
  )
}

/** The countries public holidays can come from. Empty when Nager.Date cannot be reached. */
export async function listHolidayCountries() {
  return withAuth(
    async () => {
      try {
        return { countries: await fetchNagerCountries(), error: null as string | null }
      } catch (error) {
        return {
          countries: [] as string[],
          error: error instanceof Error ? error.message : 'Could not reach Nager.Date',
        }
      }
    },
    { requiredPermissions: [READ] }
  )
}

/** Turn closed days, holidays and time off on or off for the whole workshop. */
export async function setClosuresEnabled(enabled: boolean) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await writeSetting(
        organizationId,
        SETTING_KEYS.CLOSURES_ENABLED,
        z.boolean().parse(enabled) ? 'true' : 'false',
        userId
      )
      revalidate()
      return { enabled }
    },
    { requiredPermissions: [UPDATE] }
  )
}

/**
 * Save the hours for each weekday. The old single work day is kept in step
 * (earliest opening, latest closing) for what still reads it, such as the
 * work board's time range.
 */
export async function saveOpeningHours(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const week = weekHoursSchema.parse(input)
      const span = weekSpan(week)
      await writeSetting(organizationId, SETTING_KEYS.OPENING_HOURS, JSON.stringify(week), userId)
      await writeSetting(organizationId, SETTING_KEYS.WORKBOARD_WORK_DAY_START, span.start, userId)
      await writeSetting(organizationId, SETTING_KEYS.WORKBOARD_WORK_DAY_END, span.end, userId)
      revalidate()
      return { week }
    },
    { requiredPermissions: [UPDATE] }
  )
}

/**
 * Choose the country (and regions) whose public holidays close the workshop,
 * and fetch them. A different country starts with its own defaults: a
 * choice made for one country's "Labour Day" says nothing about another's.
 */
export async function saveHolidayCountry(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const { country, regions } = holidayCountrySchema.parse(input)
      const map = await readSettings(organizationId, [SETTING_KEYS.HOLIDAY_COUNTRY])
      const changed = (map.get(SETTING_KEYS.HOLIDAY_COUNTRY) || '') !== country
      await writeSetting(organizationId, SETTING_KEYS.HOLIDAY_COUNTRY, country, userId)
      await writeSetting(
        organizationId,
        SETTING_KEYS.HOLIDAY_REGIONS,
        JSON.stringify(regions.filter((r) => r.startsWith(`${country}-`))),
        userId
      )
      if (changed) await writeSetting(organizationId, SETTING_KEYS.HOLIDAY_CHOICES, '{}', userId)
      const cache = await syncPublicHolidays(organizationId, { userId })
      revalidate()
      return { country, error: cache?.error ?? null }
    },
    { requiredPermissions: [UPDATE] }
  )
}

/** Fetch the country's holidays again now. */
export async function refreshPublicHolidays() {
  return withAuth(
    async ({ organizationId, userId }) => {
      const cache = await syncPublicHolidays(organizationId, { userId })
      revalidate()
      return { error: cache?.error ?? null }
    },
    { requiredPermissions: [UPDATE] }
  )
}

/**
 * Close for one public holiday, stay open on it, or (null) go back to its
 * default: closed for public holidays, open for the rest.
 */
export async function setHolidayChoice(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const { key, closed } = z
        .object({ key: z.string().min(1).max(200), closed: z.boolean().nullable() })
        .parse(input)
      const map = await readSettings(organizationId, [SETTING_KEYS.HOLIDAY_CHOICES])
      const choices = parseChoices(map.get(SETTING_KEYS.HOLIDAY_CHOICES))
      if (closed === null) delete choices[key]
      else choices[key] = closed
      await writeSetting(
        organizationId,
        SETTING_KEYS.HOLIDAY_CHOICES,
        JSON.stringify(choices),
        userId
      )
      revalidate()
      return { key, closed }
    },
    { requiredPermissions: [UPDATE] }
  )
}

const addFeedSchema = z.union([
  z.object({ url: feedUrlSchema, name: z.string().trim().max(80).optional() }),
  z.object({
    fileName: z.string().trim().min(1).max(200),
    text: z.string().max(MAX_FEED_BYTES, 'The file is too large'),
    name: z.string().trim().max(80).optional(),
  }),
])

/** Add a holiday calendar from a link (read again every day) or a file. */
export async function addHolidayFeed(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const data = addFeedSchema.parse(input)
      const feeds = await readFeeds(organizationId)
      if (feeds.length >= MAX_FEEDS)
        throw new Error(`A workshop can add up to ${MAX_FEEDS} calendars`)
      const year = await workshopYear(organizationId)
      const url = 'url' in data ? data.url : null
      if (url && feeds.some((f) => f.url === url)) throw new Error('That calendar is already added')

      let text: string
      try {
        text = url ? await fetchIcs(url) : (data as { text: string }).text
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Could not read the calendar')
      }
      if (!url && !/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) {
        throw new Error('The file is not a calendar (.ics) file')
      }
      let parsed: ReturnType<typeof eventsFromText>
      try {
        parsed = eventsFromText(text, year)
      } catch (error) {
        throw new Error(
          error instanceof FeedReadError ? error.message : 'Could not read the calendar'
        )
      }

      const feed: HolidayFeed = {
        id: randomUUID(),
        name:
          data.name ||
          parsed.name ||
          ('fileName' in data
            ? data.fileName.replace(/\.ics$/i, '')
            : new URL(url as string).hostname),
        url,
        fileName: 'fileName' in data ? data.fileName : null,
        events: parsed.events,
        choices: {},
        fetchedAt: new Date().toISOString(),
        error: null,
      }
      await writeFeeds(organizationId, [...feeds, feed], userId)
      revalidate()
      return feedView(feed, year)
    },
    { requiredPermissions: [UPDATE] }
  )
}

/** Read a linked calendar again now. */
export async function refreshHolidayFeed(feedId: string) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const feeds = await readFeeds(organizationId)
      const index = feeds.findIndex((f) => f.id === feedId)
      if (index < 0) throw new Error('Calendar not found')
      const year = await workshopYear(organizationId)
      feeds[index] = await refreshFeed(feeds[index], year)
      await writeFeeds(organizationId, feeds, userId)
      revalidate()
      return feedView(feeds[index], year)
    },
    { requiredPermissions: [UPDATE] }
  )
}

export async function removeHolidayFeed(feedId: string) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const feeds = await readFeeds(organizationId)
      await writeFeeds(
        organizationId,
        feeds.filter((f) => f.id !== feedId),
        userId
      )
      revalidate()
      return { removed: feedId }
    },
    { requiredPermissions: [UPDATE] }
  )
}

/**
 * Close or stay open for days in a calendar, by name: one name, or every
 * name at once (`name` left out).
 */
export async function setHolidayFeedChoice(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const { feedId, name, closed } = z
        .object({ feedId: z.string(), name: z.string().max(300).optional(), closed: z.boolean() })
        .parse(input)
      const feeds = await readFeeds(organizationId)
      const feed = feeds.find((f) => f.id === feedId)
      if (!feed) throw new Error('Calendar not found')
      const names = name === undefined ? [...new Set(feed.events.map((e) => e.name))] : [name]
      // Written down either way: closed is the default for a holiday but not
      // for an observance, so leaving a name out does not say which it was.
      for (const n of names) feed.choices[n] = closed
      await writeFeeds(organizationId, feeds, userId)
      revalidate()
      return { feedId, closed }
    },
    { requiredPermissions: [UPDATE] }
  )
}
