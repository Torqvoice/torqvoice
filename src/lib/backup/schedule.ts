import type {
  BackupContents,
  BackupFrequency,
  BackupSettings,
} from '@/features/integrations/Lib/backup-types'
import { zonedDate, zonedParts } from '@/lib/timezone'

/**
 * When a workshop's backups run, on the workshop's own clock. Pure functions:
 * no I/O, no server-local time. Calendar steps (next day, last day of the
 * month) are done on UTC calendar dates, which carry no zone; every instant
 * comes from `zonedDate` in the workshop's zone.
 */

export const BACKUP_SETTING_DEFAULTS: BackupSettings = {
  frequency: 'daily',
  time: '02:00',
  weekday: 0,
  monthDay: '1',
  contents: 'data',
  includeFiles: true,
  keepHourly: 24,
  keepDaily: 14,
  keepWeekly: 8,
  keepMonthly: 12,
}

const FREQUENCIES: readonly BackupFrequency[] = ['hourly', 'every4h', 'daily', 'weekly', 'monthly']
const CONTENTS: readonly BackupContents[] = ['data', 'dataAndSecrets']
const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** Roughly one period of each frequency; used for the first-run window and alerts. */
export const FREQUENCY_INTERVAL_MS: Record<BackupFrequency, number> = {
  hourly: HOUR,
  every4h: 4 * HOUR,
  daily: 24 * HOUR,
  weekly: 7 * 24 * HOUR,
  monthly: 31 * 24 * HOUR,
}

/** One period of the settings' frequency, in ms. */
export function intervalMs(settings: Pick<BackupSettings, 'frequency'>): number {
  return FREQUENCY_INTERVAL_MS[settings.frequency] ?? FREQUENCY_INTERVAL_MS.daily
}

/** How far back a never-run connection looks for a slot: two cron ticks. */
export const FIRST_RUN_WINDOW_MS = 10 * MINUTE

function toInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim())
  return null
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function keep(value: unknown, fallback: number): number {
  const n = toInt(value)
  if (n === null) return fallback
  return Math.min(1000, Math.max(0, n))
}

/** Saved connection settings, validated, with defaults for anything missing or wrong. */
export function readBackupSettings(raw: Record<string, unknown>): BackupSettings {
  const d = BACKUP_SETTING_DEFAULTS
  const frequency = FREQUENCIES.includes(raw.frequency as BackupFrequency)
    ? (raw.frequency as BackupFrequency)
    : d.frequency
  const time =
    typeof raw.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time.trim())
      ? raw.time.trim()
      : d.time
  const weekdayInt = toInt(raw.weekday)
  const weekday = weekdayInt !== null && weekdayInt >= 0 && weekdayInt <= 6 ? weekdayInt : d.weekday
  const monthDayRaw = typeof raw.monthDay === 'number' ? String(raw.monthDay) : raw.monthDay
  const monthDayInt = toInt(monthDayRaw)
  const monthDay =
    monthDayRaw === 'last'
      ? 'last'
      : monthDayInt !== null && monthDayInt >= 1 && monthDayInt <= 28
        ? String(monthDayInt)
        : d.monthDay
  const contents = CONTENTS.includes(raw.contents as BackupContents)
    ? (raw.contents as BackupContents)
    : d.contents
  return {
    frequency,
    time,
    weekday,
    monthDay,
    contents,
    includeFiles: toBool(raw.includeFiles, d.includeFiles),
    keepHourly: keep(raw.keepHourly, d.keepHourly),
    keepDaily: keep(raw.keepDaily, d.keepDaily),
    keepWeekly: keep(raw.keepWeekly, d.keepWeekly),
    keepMonthly: keep(raw.keepMonthly, d.keepMonthly),
  }
}

interface CalendarDay {
  year: number
  month: number
  day: number
  /** 0 = Sunday. */
  weekday: number
}

/** A calendar day `offset` days from the given one; zone-free. */
function calendarDay(year: number, month: number, day: number, offset = 0): CalendarDay {
  const d = new Date(Date.UTC(year, month - 1, day + offset))
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function wallKey(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  return (((p.year * 100 + p.month) * 100 + p.day) * 100 + p.hour) * 100 + p.minute
}

/**
 * The instant the workshop clock reads this date and time. Once per wall
 * time, so an autumn repeat yields one instant. A time that does not exist
 * (spring forward) gives the first instant after the gap, e.g. 03:00 for 02:30.
 */
function slotInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const instant = zonedDate(year, month, day, hour, minute, timeZone)
  const want = (((year * 100 + month) * 100 + day) * 100 + hour) * 100 + minute
  if (wallKey(instant, timeZone) === want) return instant
  // Every zone in use shifts on a 15-minute UTC boundary; scan around the guess.
  const step = 15 * MINUTE
  const start = Math.floor((instant.getTime() - 4 * HOUR) / step) * step
  for (let t = start; t <= instant.getTime() + 4 * HOUR; t += step) {
    if (wallKey(new Date(t), timeZone) >= want) return new Date(t)
  }
  return instant
}

function parseTime(time: string): { hour: number; minute: number } {
  const m = /^(\d{2}):(\d{2})$/.exec(time)
  if (!m) return { hour: 2, minute: 0 }
  return { hour: Number(m[1]), minute: Number(m[2]) }
}

/** First slot strictly after `threshold`, without the offset. */
function nextSlot(settings: BackupSettings, threshold: number, timeZone: string): Date {
  if (settings.frequency === 'hourly') {
    // Every real hour the workshop clock shows :00, both hours of an autumn repeat included.
    const step = 15 * MINUTE
    for (let t = Math.floor(threshold / step) * step + step; ; t += step) {
      if (zonedParts(new Date(t), timeZone).minute === 0) return new Date(t)
    }
  }

  const p = zonedParts(new Date(threshold), timeZone)
  // Start a day early: a gap-resolved slot can land on the next wall day.
  const first = calendarDay(p.year, p.month, p.day, -1)

  if (settings.frequency === 'monthly') {
    const { hour, minute } = parseTime(settings.time)
    for (let i = 0; i < 26; i++) {
      const monthIndex = first.month - 1 + i
      const year = first.year + Math.floor(monthIndex / 12)
      const month = (monthIndex % 12) + 1
      const day =
        settings.monthDay === 'last' ? daysInMonth(year, month) : Number(settings.monthDay) || 1
      const slot = slotInstant(year, month, day, hour, minute, timeZone)
      if (slot.getTime() > threshold) return slot
    }
    throw new Error('No monthly backup slot found')
  }

  const times =
    settings.frequency === 'every4h'
      ? [0, 4, 8, 12, 16, 20].map((hour) => ({ hour, minute: 0 }))
      : [parseTime(settings.time)]
  for (let i = 0; i < 16; i++) {
    const day = calendarDay(first.year, first.month, first.day, i)
    if (settings.frequency === 'weekly' && day.weekday !== settings.weekday) continue
    for (const { hour, minute } of times) {
      const slot = slotInstant(day.year, day.month, day.day, hour, minute, timeZone)
      if (slot.getTime() > threshold) return slot
    }
  }
  throw new Error('No backup slot found')
}

/**
 * The first scheduled run strictly after `after`: the slot on the workshop
 * clock plus `offsetMinutes`. The offset counts as part of the run time, so a
 * run at 02:00 + 3 is still ahead at 02:01.
 */
export function nextRunAfter(
  settings: BackupSettings,
  after: Date,
  timeZone: string,
  offsetMinutes = 0
): Date {
  const offset = offsetMinutes * MINUTE
  return new Date(nextSlot(settings, after.getTime() - offset, timeZone).getTime() + offset)
}

/**
 * Whether a run is due now. A connection that has never run looks back only
 * FIRST_RUN_WINDOW_MS, so connecting waits for the next slot instead of
 * running at once; pass the connection's activation time for an exact answer.
 */
export function isDue(
  settings: BackupSettings,
  lastRunAt: Date | null,
  now: Date,
  timeZone: string,
  offsetMinutes = 0
): boolean {
  const from = lastRunAt ?? new Date(now.getTime() - FIRST_RUN_WINDOW_MS)
  return nextRunAfter(settings, from, timeZone, offsetMinutes).getTime() <= now.getTime()
}

/** A stable 0..9 minute offset per organisation, so workshops do not all start at :00. */
export function spreadOffsetMinutes(organizationId: string): number {
  // FNV-1a, 32 bit.
  let hash = 0x811c9dc5
  for (let i = 0; i < organizationId.length; i++) {
    hash ^= organizationId.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash % 10
}

/** The `--keep-*` flags for `restic forget`, in order, skipping zeros. */
export function retentionFlags(
  settings: Pick<BackupSettings, 'keepHourly' | 'keepDaily' | 'keepWeekly' | 'keepMonthly'>
): string[] {
  const flags: string[] = []
  const pairs: [string, number][] = [
    ['--keep-hourly', settings.keepHourly],
    ['--keep-daily', settings.keepDaily],
    ['--keep-weekly', settings.keepWeekly],
    ['--keep-monthly', settings.keepMonthly],
  ]
  for (const [flag, value] of pairs) {
    if (Number.isInteger(value) && value > 0) flags.push(flag, String(value))
  }
  return flags
}
