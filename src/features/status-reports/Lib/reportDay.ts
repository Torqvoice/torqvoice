/**
 * The day a status report was made, as the customer reads it on the share
 * page: on the workshop's clock and in the page's language.
 *
 * Written on the server and sent down as text. Formatted in the browser it
 * was the phone's own day and the phone's own way of writing one, which is
 * neither, and differs from what the server had already rendered.
 */
export function formatReportDay(createdAt: Date, locale: string, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' }
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(createdAt)
  } catch {
    // A zone this runtime does not know: the day in UTC rather than no day.
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(createdAt)
  }
}
