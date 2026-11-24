/**
 * Statuses as a customer reads them in the portal.
 *
 * The portal used to print the stored value, so a customer read
 * "in-progress" or "in_progress" in English whatever their language. The words
 * live under `portal.status` in every locale; a status this list does not know
 * yet is shown tidied up rather than as a missing message.
 */

export type PortalStatusKind = 'job' | 'request' | 'inspection'

/** Stored value to message key, per kind. */
const KEYS: Record<PortalStatusKind, Record<string, string>> = {
  job: {
    pending: 'pending',
    scheduled: 'scheduled',
    'in-progress': 'inProgress',
    'waiting-parts': 'waitingParts',
    completed: 'completed',
    cancelled: 'cancelled',
  },
  request: {
    pending: 'pending',
    converted: 'converted',
    dismissed: 'dismissed',
    // A customer who cancels an online inspection booking cancels its request.
    cancelled: 'cancelled',
  },
  inspection: { in_progress: 'inProgress', 'in-progress': 'inProgress', completed: 'completed' },
}

export function portalStatusLabel(
  kind: PortalStatusKind,
  status: string,
  t: (key: string) => string
): string {
  const key = KEYS[kind][status]
  if (key) return t(`${kind}.${key}`)
  const words = status.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * How a request's status is drawn. Requests are not work orders, quotes or
 * inspections, so they have no colour in src/lib/status-colors.ts; each state
 * gets its own look from the portal theme instead, so the four never read
 * alike: waiting is outlined, booked is filled with the workshop's colour,
 * closed is a quiet fill and cancelled is a quiet dashed outline.
 */
export function portalRequestBadge(status: string): {
  tone: 'neutral' | 'accent' | 'outline'
  className: string
} {
  switch (status) {
    case 'converted':
      return { tone: 'accent', className: '' }
    case 'dismissed':
      return { tone: 'neutral', className: 'p-muted' }
    case 'cancelled':
      return { tone: 'outline', className: 'border-dashed p-muted' }
    default:
      return { tone: 'outline', className: '' }
  }
}
