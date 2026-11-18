/**
 * The calendar opened on one appointment: its day, with its card open. An
 * appointment has no page of its own, so this is how anything else links to one.
 */
export function appointmentHref(id: string): string {
  return `/calendar?appointment=${encodeURIComponent(id)}`
}
