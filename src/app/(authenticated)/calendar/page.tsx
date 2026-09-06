import { getCalendarEvents } from '@/features/calendar/Actions/calendarActions'
import { getVehicles } from '@/features/vehicles/Actions/vehicleActions'
import { getCustomersList } from '@/features/customers/Actions/customerActions'
import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { PageHeader } from '@/components/page-header'
import { getAuthContext } from '@/lib/get-auth-context'
import { getAvailableChannels } from '@/features/scheduled-messages/Lib/availableChannels'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { zonedDayKey } from '@/lib/timezone'
import CalendarClient from '@/features/calendar/Components/CalendarClient'
import {
  getMonthGridDays,
  isCalendarView,
  parseDateKey,
  toLocalDateStr,
  visibleRange,
  type CalendarView,
} from '@/features/calendar/Lib/calendar-range'

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>
}) {
  const params = await searchParams
  const ctx = await getAuthContext()
  const timeZone = ctx ? await workshopTimeZone(ctx.organizationId) : 'UTC'
  // "Today" is the workshop's today, not the server's: a box in UTC must not
  // ring in the next day at 01:00 Oslo time.
  const todayStr = zonedDayKey(new Date(), timeZone)

  const view: CalendarView = isCalendarView(params.view) ? params.view : 'month'
  const date = parseDateKey(params.date) ?? parseDateKey(todayStr) ?? new Date()

  const messageChannels = ctx ? await getAvailableChannels(ctx.organizationId) : []
  const settingsResult = await getSettings([
    SETTING_KEYS.CURRENCY_CODE,
    SETTING_KEYS.WORKBOARD_WEEK_START_DAY,
  ])
  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {}
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || 'USD'
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

  const [eventsResult, vehiclesResult, customersResult] = await Promise.all([
    getCalendarEvents(rangeKeys),
    getVehicles(),
    getCustomersList(),
  ])

  const events = eventsResult.success && eventsResult.data ? eventsResult.data : []
  const vehicles =
    vehiclesResult.success && vehiclesResult.data
      ? vehiclesResult.data.map((v) => ({
          id: v.id,
          make: v.make,
          model: v.model,
          year: v.year,
          licensePlate: v.licensePlate,
          customer: v.customer,
        }))
      : []
  const customers = customersResult.success && customersResult.data ? customersResult.data : []

  return (
    <>
      <PageHeader />
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 pt-0">
        <CalendarClient
          initialEvents={events}
          initialRange={rangeKeys}
          initialView={view}
          initialDate={toLocalDateStr(date)}
          todayStr={todayStr}
          vehicles={vehicles}
          customers={customers}
          currencyCode={currencyCode}
          messageChannels={messageChannels}
        />
      </div>
    </>
  )
}
