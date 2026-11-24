import { getLocale, getTranslations } from 'next-intl/server'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { MM_PER_32ND } from '@/features/tire-hotel/Lib/tireConstants'
import { addDays } from '@/features/workshop-calendar/Lib/calendar'
import { db } from '@/lib/db'
import { DEFAULT_DATE_FORMAT, formatDate } from '@/lib/format'
import { zonedDayKey } from '@/lib/timezone'
import { workshopMoneyFormatter } from '@/lib/workshop-currency'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import type { PortalHomeFormat } from './homeTypes'

/**
 * Dates, times and money as the portal prints them: on the workshop's clock,
 * in its date format and its currency, in the language the portal is being
 * read in.
 *
 * The portal's language is already the workshop's when it forces one for its
 * customers, and the customer's browser language otherwise (see
 * `src/i18n/request.ts`), so `getLocale()` is the right one here. A date
 * printed with `toLocaleDateString(undefined)` on the server is in neither.
 */
export async function portalFormat(organizationId: string): Promise<PortalHomeFormat> {
  const [locale, timeZone, money, rows, t] = await Promise.all([
    getLocale(),
    workshopTimeZone(organizationId),
    workshopMoneyFormatter(organizationId),
    db.appSetting.findMany({
      where: {
        organizationId,
        key: {
          in: [SETTING_KEYS.TIME_FORMAT, SETTING_KEYS.DATE_FORMAT, SETTING_KEYS.UNIT_SYSTEM],
        },
      },
      select: { key: true, value: true },
    }),
    getTranslations('portal.format'),
  ])
  const value = (key: string) => rows.find((row) => row.key === key)?.value
  const timeFormat = value(SETTING_KEYS.TIME_FORMAT) === '24h' ? '24h' : '12h'
  return buildPortalFormat({
    locale,
    timeZone,
    timeFormat,
    dateFormat: value(SETTING_KEYS.DATE_FORMAT) || DEFAULT_DATE_FORMAT,
    imperial: value(SETTING_KEYS.UNIT_SYSTEM) === 'imperial',
    money,
    today: t('today'),
    tomorrow: t('tomorrow'),
  })
}

/** The formatter itself, apart from where its settings come from, for tests. */
export function buildPortalFormat(options: {
  locale: string
  timeZone: string
  timeFormat: '12h' | '24h'
  /** The workshop's date format (Settings, Localization), such as "dd/MM/yyyy". */
  dateFormat: string
  money: (amount: number) => string
  today: string
  tomorrow: string
  /** The workshop measures in inches: tread reads in 32nds. */
  imperial?: boolean
  /** The moment "today" is judged from; now when left out. */
  now?: Date
}): PortalHomeFormat {
  const { locale, timeZone, timeFormat, dateFormat, money } = options
  const todayKey = () => zonedDayKey(options.now ?? new Date(), timeZone)
  const long = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  // 24 hour times carry a two-digit hour ("08:12"), like opening hours do
  // everywhere else; 12 hour times read "8:12 AM" in the locale's own words.
  // h23, not hour12: false, so midnight is 00:00 and never 24:00.
  const timeOptions: Intl.DateTimeFormatOptions =
    timeFormat === '24h'
      ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
      : { hour: 'numeric', minute: '2-digit', hour12: true }
  const clockTime = new Intl.DateTimeFormat(locale, { timeZone, ...timeOptions })
  // A bare "HH:mm" is already on the workshop's clock, so it is printed as
  // that moment in UTC to keep it from being shifted.
  const wallTime = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...timeOptions })
  // A calendar day is written the way the workshop writes it on its invoices
  // and share pages, year included: "24/11/2026", never the language's own
  // "24 Nov" beside a "24/11/2026" on the invoice it opens.
  const day = (iso: string) => formatDate(new Date(iso), dateFormat, timeZone, locale)
  return {
    money,
    day,
    dayLong: (iso) => long.format(new Date(iso)),
    time: (iso) => clockTime.format(new Date(iso)),
    relativeDay: (iso) => {
      const key = zonedDayKey(new Date(iso), timeZone)
      const today = todayKey()
      if (key === today) return options.today
      if (key === addDays(today, 1)) return options.tomorrow
      return day(iso)
    },
    clock: (hhmm) => {
      const [h, m] = hhmm.split(':').map(Number)
      return wallTime.format(new Date(Date.UTC(2000, 0, 1, h, m)))
    },
    isPast: (iso) => zonedDayKey(new Date(iso), timeZone) < todayKey(),
    // Whole 32nds, as a gauge reads; millimetres to one decimal, without a
    // trailing ".0", in the language's own decimal mark.
    tread: (mm) =>
      options.imperial
        ? `${Math.round(mm / MM_PER_32ND)}/32″`
        : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(mm)} mm`,
  }
}
