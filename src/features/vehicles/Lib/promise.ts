/**
 * The promise made to the customer: when they were told the vehicle would be
 * ready (`ServiceRecord.promisedAt`).
 *
 * It is not the booking. `startDateTime`/`endDateTime` say when the work is
 * planned to run; this is what somebody said on the phone, and it is usually
 * later. A promise is broken when that moment has passed and the job is not
 * finished, which is the one rule the job's own header, the work order list
 * and the board card all read from here, so a job cannot be late in one place
 * and fine in another.
 */

/** A job that is done cannot be late, however long ago it was promised. */
const FINISHED = 'completed'

export function isPromiseOverdue(
  promisedAt: Date | string | null | undefined,
  status: string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!promisedAt || status === FINISHED) return false
  const promised = promisedAt instanceof Date ? promisedAt : new Date(promisedAt)
  const at = promised.getTime()
  return Number.isFinite(at) && at < now
}
