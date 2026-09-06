/** Format a Date as YYYY-MM-DD in local time (avoids UTC shift from toISOString) */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Where an event points: the quote itself, otherwise the vehicle it belongs
 * to. External events have no page here; they open a dialog, or the vendor's
 * calendar, and only land on the integrations list as a last resort.
 */
export function getEventLink(event: {
  id: string
  type: 'service' | 'reminder' | 'quote' | 'message' | 'external'
  vehicleId: string | null
}): string {
  if (event.type === 'external') return '/settings/integrations'
  if (event.type === 'quote') return `/quotes/${event.id}`
  if (event.type === 'message') return '/messages?tab=scheduled'
  if (!event.vehicleId) return event.type === 'reminder' ? '/reminders' : `/sales/${event.id}`
  return `/vehicles/${event.vehicleId}`
}

export function formatDateHeader(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}
