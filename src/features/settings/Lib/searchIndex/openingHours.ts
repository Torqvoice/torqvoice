import type { SettingsEntry } from './types'

/** Opening hours and holidays: one card each, reached by the cards' ids. */
export const openingHoursEntries: SettingsEntry[] = [
  {
    id: 'openingHours.hours',
    page: 'openingHours',
    title: 'openingHours.search.hours',
    anchor: 'opening-hours',
    keywords: [
      'opening hours',
      'opening time',
      'closing time',
      'business hours',
      'work day start',
      'work day end',
      'weekend',
      'saturday',
    ],
  },
  {
    id: 'openingHours.switch',
    page: 'openingHours',
    title: 'openingHours.search.switch',
    anchor: 'closures-switch',
    keywords: ['closed days', 'time off', 'turn off holidays', 'disable holidays'],
  },
  {
    id: 'openingHours.publicHolidays',
    page: 'openingHours',
    title: 'openingHours.search.publicHolidays',
    anchor: 'public-holidays',
    keywords: [
      'public holidays',
      'bank holidays',
      'national holidays',
      'state holidays',
      'country',
    ],
  },
  {
    id: 'openingHours.calendars',
    page: 'openingHours',
    title: 'openingHours.search.calendars',
    anchor: 'holiday-calendars',
    keywords: ['holiday calendar', 'ics', 'ical', 'webcal', 'google holidays', 'calendar feed'],
  },
  {
    id: 'openingHours.closedDays',
    page: 'openingHours',
    title: 'openingHours.search.closedDays',
    anchor: 'closed-days',
    keywords: ['closed days', 'closure', 'shutdown', 'close early', 'christmas'],
  },
  {
    id: 'openingHours.timeOff',
    page: 'openingHours',
    title: 'openingHours.search.timeOff',
    anchor: 'time-off',
    keywords: ['time off', 'leave', 'vacation', 'holiday', 'sick', 'absence', 'technician away'],
  },
]
