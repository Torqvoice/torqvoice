import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { db } from '@/lib/db'
import { resolveWorkshopTimeZone } from '@/lib/workshop-timezone'

/**
 * How a workshop wants inspection reminders and the booking link behind
 * them to behave. Every value has a default a workshop would accept
 * unchanged: an hour per inspection, book from tomorrow, a month ahead,
 * links good for a week.
 */
export interface InspectionReminderSettings {
  durationMinutes: number
  leadDays: number
  horizonWeeks: number
  walkInReserve: number
  linkValidDays: number
  bookingMode: 'direct' | 'request'
  phone: string | null
  workshopName: string
  templateSms: string | null
  templateEmailSubject: string | null
  templateEmailBody: string | null
  workingHours: { start: string; end: string; includeWeekends: boolean; timeZone: string }
  /** IANA zone every wall-clock time here is read in. */
  timeZone: string
  /** True when the zone came from the browser's detection rather than a choice. */
  timeZoneDetected: boolean
}

/** A link stays open at least this long, whatever the workshop typed. */
export const MIN_LINK_VALID_DAYS = 7
export const DEFAULT_DURATION_MINUTES = 60

function int(value: string | undefined, fallback: number, min = 0): number {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(min, Math.floor(n)) : fallback
}

export async function loadInspectionReminderSettings(
  organizationId: string
): Promise<InspectionReminderSettings> {
  const keys = [
    SETTING_KEYS.INSPECTION_DURATION_MINUTES,
    SETTING_KEYS.INSPECTION_BOOKING_LEAD_DAYS,
    SETTING_KEYS.INSPECTION_BOOKING_HORIZON_WEEKS,
    SETTING_KEYS.INSPECTION_BOOKING_RESERVE,
    SETTING_KEYS.INSPECTION_LINK_VALID_DAYS,
    SETTING_KEYS.INSPECTION_BOOKING_MODE,
    SETTING_KEYS.INSPECTION_CONTACT_PHONE,
    SETTING_KEYS.INSPECTION_TEMPLATE_SMS,
    SETTING_KEYS.INSPECTION_TEMPLATE_EMAIL_SUBJECT,
    SETTING_KEYS.INSPECTION_TEMPLATE_EMAIL_BODY,
    SETTING_KEYS.WORKSHOP_PHONE,
    'workboard.workDayStart',
    'workboard.workDayEnd',
    'workboard.showWeekends',
    SETTING_KEYS.TIMEZONE,
    SETTING_KEYS.TIMEZONE_DETECTED,
  ]
  const [rows, org] = await Promise.all([
    db.appSetting.findMany({
      where: { organizationId, key: { in: keys } },
      select: { key: true, value: true },
    }),
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ])
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const get = (k: string) => map.get(k)
  const mode = get(SETTING_KEYS.INSPECTION_BOOKING_MODE)
  const timeZone = resolveWorkshopTimeZone(
    get(SETTING_KEYS.TIMEZONE),
    get(SETTING_KEYS.TIMEZONE_DETECTED)
  )
  return {
    timeZone,
    timeZoneDetected: !get(SETTING_KEYS.TIMEZONE)?.trim(),
    durationMinutes: int(
      get(SETTING_KEYS.INSPECTION_DURATION_MINUTES),
      DEFAULT_DURATION_MINUTES,
      15
    ),
    leadDays: int(get(SETTING_KEYS.INSPECTION_BOOKING_LEAD_DAYS), 1, 1),
    horizonWeeks: int(get(SETTING_KEYS.INSPECTION_BOOKING_HORIZON_WEEKS), 4, 1),
    walkInReserve: int(get(SETTING_KEYS.INSPECTION_BOOKING_RESERVE), 0, 0),
    linkValidDays: int(
      get(SETTING_KEYS.INSPECTION_LINK_VALID_DAYS),
      MIN_LINK_VALID_DAYS,
      MIN_LINK_VALID_DAYS
    ),
    bookingMode: mode === 'request' ? 'request' : 'direct',
    phone:
      get(SETTING_KEYS.INSPECTION_CONTACT_PHONE)?.trim() ||
      get(SETTING_KEYS.WORKSHOP_PHONE)?.trim() ||
      null,
    workshopName: org?.name ?? '',
    templateSms: get(SETTING_KEYS.INSPECTION_TEMPLATE_SMS)?.trim() || null,
    templateEmailSubject: get(SETTING_KEYS.INSPECTION_TEMPLATE_EMAIL_SUBJECT)?.trim() || null,
    templateEmailBody: get(SETTING_KEYS.INSPECTION_TEMPLATE_EMAIL_BODY)?.trim() || null,
    workingHours: {
      start: get('workboard.workDayStart') || '07:00',
      end: get('workboard.workDayEnd') || '15:00',
      includeWeekends: get('workboard.showWeekends') === 'true',
      timeZone,
    },
  }
}
