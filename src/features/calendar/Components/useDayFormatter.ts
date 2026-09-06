'use client'

import { useMemo } from 'react'
import { type DateTimeFormatOptions, useFormatter } from 'next-intl'

/**
 * next-intl formats in the zone the server configured (or its own), which
 * is not the zone the calendar's dates are built in: every day here is a
 * local-midnight Date of whatever runtime made it. Formatting such a date
 * in UTC from an Oslo browser turns Monday into Sunday and "Sep 1" into
 * "Aug 31". So the calendar formats in the runtime's own zone, on both
 * sides of hydration: the server's dates in the server's zone, the
 * browser's in the browser's, and each reads its own dates back correctly.
 */
export function useDayFormatter() {
  const format = useFormatter()
  return useMemo(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return {
      dateTime: (date: Date, options: DateTimeFormatOptions) =>
        format.dateTime(date, { ...options, timeZone }),
    }
  }, [format])
}
