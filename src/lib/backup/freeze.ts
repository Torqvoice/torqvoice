/**
 * The short read-only state a workshop is in while a restore replaces its
 * rows. Server actions refuse to change anything for the workshop until the
 * restore has finished, so a work order saved halfway through is not lost
 * under the restore, and the restore's transaction does not fight live
 * writes for the same rows.
 *
 * Kept in this process, like the backup lock: the restore runs here, and so
 * do the actions. A restart clears both together.
 */

const g = globalThis as unknown as { __torqvoiceRestoring?: Map<string, number> }

function map(): Map<string, number> {
  if (!g.__torqvoiceRestoring) g.__torqvoiceRestoring = new Map()
  return g.__torqvoiceRestoring
}

/**
 * The net for a restore whose process died without unfreezing: a freeze not
 * renewed for eight hours (the same eight hours after which the scheduler
 * gives a run up as crashed) lapses on its own. A live restore renews its
 * freeze every few minutes, so a long one stays frozen to the end.
 */
const MAX_FREEZE_MS = 8 * 60 * 60 * 1000

export const RESTORE_IN_PROGRESS_MESSAGE =
  'A restore of this workshop is in progress. Try again in a few minutes.'

export class RestoreInProgressError extends Error {
  constructor() {
    super(RESTORE_IN_PROGRESS_MESSAGE)
    this.name = 'RestoreInProgressError'
  }
}

export function freezeOrganization(organizationId: string): void {
  map().set(organizationId, Date.now())
}

export function unfreezeOrganization(organizationId: string): void {
  map().delete(organizationId)
}

/** Starts the freeze's eight hours over, if the workshop is frozen at all. */
export function renewFreeze(organizationId: string): void {
  if (map().has(organizationId)) map().set(organizationId, Date.now())
}

export function isRestoring(organizationId: string, now = Date.now()): boolean {
  const since = map().get(organizationId)
  if (since === undefined) return false
  if (now - since > MAX_FREEZE_MS) {
    map().delete(organizationId)
    return false
  }
  return true
}

/** Throws RestoreInProgressError while the workshop is being restored. */
export function assertNotRestoring(organizationId: string): void {
  if (isRestoring(organizationId)) throw new RestoreInProgressError()
}

/**
 * Every workshop frozen right now, for queries that should leave their rows
 * alone until the restore is done.
 */
export function frozenOrganizationIds(now = Date.now()): string[] {
  return [...map().keys()].filter((id) => isRestoring(id, now))
}
