import { formatDate } from '@/lib/format'
import { safeTimeZone } from '@/lib/timezone'

/**
 * The day a status report was made, as the customer reads it on the share
 * page: on the workshop's clock and in the workshop's date format, the same
 * way the expiry date beside it is written, with any month name in the
 * page's language.
 *
 * Written on the server and sent down as text. Formatted in the browser it
 * was the phone's own day and the phone's own way of writing one, which is
 * neither, and differs from what the server had already rendered.
 */
export function formatReportDay(
  createdAt: Date,
  dateFormat: string,
  timeZone: string,
  locale?: string
): string {
  // A zone this runtime does not know: the day in UTC rather than no day.
  return formatDate(createdAt, dateFormat, safeTimeZone(timeZone), locale)
}
