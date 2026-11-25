/**
 * The observations list's status filter. With no `?status=` in the address
 * the list shows open observations, and the status dropdown says "Open":
 * the page, every batch of the list and the dropdown read the default here.
 * "All statuses" is then an explicit `?status=all`.
 */
export const OBSERVATION_DEFAULT_STATUS = 'open'

/** The status the list filters by: the one asked for, or the default. */
export function observationStatusFilter(status: string | undefined | null) {
  return status || OBSERVATION_DEFAULT_STATUS
}
