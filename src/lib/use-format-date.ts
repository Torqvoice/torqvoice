'use client'

import { useDateSettings } from '@/components/date-settings-context'
import {
  formatDate as fmtDate,
  formatDateTime as fmtDateTime,
  formatDayKey,
  formatTime as fmtTime,
} from '@/lib/format'

export function useFormatDate() {
  const { dateFormat, timeFormat, timezone } = useDateSettings()
  const tz = timezone || undefined

  return {
    formatDate: (date: Date | string) => fmtDate(date, dateFormat, tz),
    formatDateTime: (date: Date | string) => fmtDateTime(date, dateFormat, timeFormat, tz),
    formatTime: (date: Date | string) => fmtTime(date, timeFormat, tz),
    /**
     * A calendar day that is already a day, not an instant: a "YYYY-MM-DD"
     * key, or a date picker's local midnight. Written in the workshop's date
     * format without moving it through any zone. Any other string is an
     * instant, and is read on the workshop's clock like `formatDate`.
     */
    formatDay: (day: Date | string) =>
      typeof day !== 'string'
        ? fmtDate(day, dateFormat)
        : /^\d{4}-\d{2}-\d{2}$/.test(day)
          ? formatDayKey(day, dateFormat)
          : fmtDate(day, dateFormat, tz),
  }
}
