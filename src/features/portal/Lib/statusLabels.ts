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
  },
  request: { pending: 'pending', converted: 'converted', dismissed: 'dismissed' },
  inspection: { in_progress: 'inProgress', completed: 'completed' },
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
