import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { resolveCurrencyCode } from '@/lib/currencies'
import { getCalendarEvents } from '@/features/calendar/Actions/calendarActions'
import { getDisplaySettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { PageHeader } from '@/components/page-header'
import { getAuthContext } from '@/lib/get-auth-context'
import { getAvailableChannels } from '@/features/scheduled-messages/Lib/availableChannels'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { zonedDayKey } from '@/lib/timezone'
import CalendarClient from '@/features/calendar/Components/CalendarClient'
import { getTechnicians } from '@/features/workboard/Actions/technicianActions'
import { canEditTimeOff } from '@/features/workshop-calendar/Lib/access.server'
import { calendarEnabled } from '@/features/workshop-calendar/Lib/loadCalendar.server'
import {
  getMonthGridDays,
  isCalendarView,
  parseDateKey,
  toLocalDateStr,
  visibleRange,
  type CalendarView,
} from '@/features/calendar/Lib/calendar-range'
import { pageTitle } from '@/lib/page-title'
import {
  CALENDAR_PREFERENCES_COOKIE,
  parseCalendarPreferences,
} from '@/features/calendar/Lib/calendar-preferences'

export function generateMetadata() {
  return pageTitle('calendar')
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; appointment?: string }>
}) {
  const params = await searchParams
  const ctx = await getAuthContext()
  const timeZone = ctx ? await workshopTimeZone(ctx.organizationId) : 'UTC'
  // "Today" is the workshop's today, not the server's: a box in UTC must not
  // ring in the next day at 01:00 Oslo time.
  const todayStr = zonedDayKey(new Date(), timeZone)

  // A link to one appointment (from search, a vehicle's page) opens its day
  // with its card up. Only this workshop's: any other id, or one since
  // deleted, opens the calendar as if the link had no appointment at all.
  const linked =
    ctx && typeof params.appointment === 'string' && params.appointment
      ? await db.appointment.findFirst({
          where: { id: params.appointment, organizationId: ctx.organizationId },
          select: { id: true, startAt: true },
        })
      : null
  const linkedDay = linked ? zonedDayKey(linked.startAt, timeZone) : null

  const view: CalendarView = isCalendarView(params.view) ? params.view : linked ? 'day' : 'month'
  const date = parseDateKey(linkedDay ?? params.date) ?? parseDateKey(todayStr) ?? new Date()

  const messageChannels = ctx ? await getAvailableChannels(ctx.organizationId) : []
  const settingsResult = await getDisplaySettings([
    SETTING_KEYS.CURRENCY_CODE,
    SETTING_KEYS.WORKBOARD_WEEK_START_DAY,
  ])
  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {}
  const currencyCode = resolveCurrencyCode(settings[SETTING_KEYS.CURRENCY_CODE])
  // The same week start the layout hands the client, so the grid the server
  // fetched for is the grid the client draws.
  const weekStartRaw = parseInt(settings[SETTING_KEYS.WORKBOARD_WEEK_START_DAY] || '1', 10)
  const weekStartDay = weekStartRaw >= 0 && weekStartRaw <= 6 ? weekStartRaw : 1

  // The month grid around the date, widened to what the view shows; the
  // client asks for the same shape when it moves, so the first paint and
  // the first navigation agree on what is already loaded.
  const visible = visibleRange(view, date, weekStartDay)
  const grid = getMonthGridDays(date.getFullYear(), date.getMonth(), weekStartDay)
  const range =
    view === 'year'
      ? visible
      : {
          start: grid[0] < visible.start ? grid[0] : visible.start,
          end: grid[grid.length - 1] > visible.end ? grid[grid.length - 1] : visible.end,
        }
  const rangeKeys = { start: toLocalDateStr(range.start), end: toLocalDateStr(range.end) }

  const eventsResult = await getCalendarEvents(rangeKeys)

  // Who can be set on leave, offered only to people who may edit the work
  // board and only while the workshop tracks time off at all.
  const timeOffAllowed =
    ctx !== null &&
    (await calendarEnabled(ctx.organizationId)) &&
    (await canEditTimeOff(ctx.userId, ctx.role))
  const technicians = timeOffAllowed ? await getTechnicians() : null
  const timeOff =
    technicians?.success && technicians.data
      ? {
          technicians: technicians.data
            .filter((tech) => tech.isActive)
            .map((tech) => ({ id: tech.id, name: tech.name, color: tech.color })),
        }
      : null

  // Read here so the first paint already has the kinds this person hid.
  const preferences = parseCalendarPreferences(
    (await cookies()).get(CALENDAR_PREFERENCES_COOKIE)?.value
  )

  const events = eventsResult.success && eventsResult.data ? eventsResult.data : []

  return (
    <>
      <PageHeader />
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 pt-0">
        <CalendarClient
          // A new link while the calendar is open starts it over on that day.
          key={linked?.id ?? 'calendar'}
          openAppointmentId={linked?.id ?? null}
          initialEvents={events}
          initialRange={rangeKeys}
          initialView={view}
          initialDate={toLocalDateStr(date)}
          todayStr={todayStr}
          currencyCode={currencyCode}
          messageChannels={messageChannels}
          timeOff={timeOff}
          initialPreferences={preferences}
        />
      </div>
    </>
  )
}
