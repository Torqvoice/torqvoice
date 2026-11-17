import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CalendarSidebar, typeFiltersFrom } from '@/features/calendar/Components/CalendarSidebar'
import { useCalendarPreferences } from '@/features/calendar/Components/useCalendarPreferences'
import {
  CALENDAR_PREFERENCES_COOKIE,
  type CalendarPreferences,
  LEGACY_STORAGE_KEY,
  parseCalendarPreferences,
} from '@/features/calendar/Lib/calendar-preferences'
import type { CalendarEventType } from '@/features/calendar/Actions/calendarActions'

const counts: Record<CalendarEventType, number> = {
  service: 3,
  appointment: 1,
  reminder: 2,
  quote: 4,
  message: 0,
  external: 0,
  closure: 0,
  absence: 0,
}

/** The cookie as the calendar page reads it on the server. */
function cookieValue(): string | undefined {
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${CALENDAR_PREFERENCES_COOKIE}=`))
    ?.slice(CALENDAR_PREFERENCES_COOKIE.length + 1)
  return raw ? decodeURIComponent(raw) : undefined
}

function setCookie(value: string) {
  document.cookie = `${CALENDAR_PREFERENCES_COOKIE}=${encodeURIComponent(value)}; path=/`
}

/** The sidebar wired to the stored preferences the way the calendar wires it. */
function Calendar({ initial }: { initial: CalendarPreferences | null }) {
  const { preferences, setTypeShown } = useCalendarPreferences(initial)
  return (
    <CalendarSidebar
      selectedDate={new Date(2026, 10, 17)}
      month={new Date(2026, 10, 1)}
      busyDates={[]}
      filters={typeFiltersFrom(preferences.hiddenTypes)}
      counts={counts}
      total={10}
      onSelectDate={() => undefined}
      onMonthChange={() => undefined}
      onFilterChange={setTypeShown}
    />
  )
}

/** Opens the calendar the way the page does: preferences from the cookie. */
function openCalendar() {
  return render(<Calendar initial={parseCalendarPreferences(cookieValue())} />)
}

function checkbox(name: string) {
  return screen.getByRole('checkbox', { name })
}

const ALL = ['Work orders', 'Appointments', 'Reminders', 'Quotes']

describe('calendar type filters', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.cookie = `${CALENDAR_PREFERENCES_COOKIE}=; path=/; max-age=0`
  })

  it('keeps an unticked kind unticked after leaving the calendar and coming back', () => {
    const first = openCalendar()
    expect(checkbox('Quotes')).toHaveAttribute('data-state', 'checked')

    fireEvent.click(checkbox('Quotes'))
    expect(checkbox('Quotes')).toHaveAttribute('data-state', 'unchecked')
    first.unmount()

    // Unticked on the very first render: nothing ticked flashes before it.
    openCalendar()
    expect(checkbox('Quotes')).toHaveAttribute('data-state', 'unchecked')
    expect(checkbox('Work orders')).toHaveAttribute('data-state', 'checked')

    // Ticking it again is remembered too.
    fireEvent.click(checkbox('Quotes'))
    expect(checkbox('Quotes')).toHaveAttribute('data-state', 'checked')
    expect(parseCalendarPreferences(cookieValue())?.hiddenTypes).toEqual([])
  })

  it('ignores kinds it does not know and shows everything it does', () => {
    setCookie(JSON.stringify({ hiddenTypes: ['reminder', 'retired-kind', 42, null] }))
    openCalendar()
    expect(checkbox('Reminders')).toHaveAttribute('data-state', 'unchecked')
    for (const name of ['Work orders', 'Appointments', 'Quotes']) {
      expect(checkbox(name)).toHaveAttribute('data-state', 'checked')
    }
  })

  it.each([
    ['not JSON', '{oops'],
    ['not a list', JSON.stringify({ hiddenTypes: 'quote' })],
    ['not an object', JSON.stringify('quote')],
  ])('shows every kind when the stored value is %s', async (_label, raw) => {
    setCookie(raw)
    window.localStorage.setItem(LEGACY_STORAGE_KEY, raw)
    openCalendar()
    // Let the mount effect run before asserting nothing changed.
    await new Promise((resolve) => setTimeout(resolve, 0))
    for (const name of ALL) {
      expect(checkbox(name)).toHaveAttribute('data-state', 'checked')
    }
  })

  it('carries over kinds hidden before the preferences moved to a cookie', async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ hiddenTypes: ['quote'] }))
    openCalendar()
    await waitFor(() => expect(checkbox('Quotes')).toHaveAttribute('data-state', 'unchecked'))
    expect(parseCalendarPreferences(cookieValue())?.hiddenTypes).toEqual(['quote'])
  })
})
