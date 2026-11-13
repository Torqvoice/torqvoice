/** How long a booked job's name may be before it is cut, as on a portal request. */
const TITLE_LENGTH = 60

/**
 * What the customer asked for, one concern per line and in the order given.
 * Each prints under "work requested" on the work order and is answered on
 * its own when the car is in.
 */
export function appointmentConcerns(work: string): string[] {
  return work
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * The job's name on the calendar and the work board: the first thing asked
 * for, which is what the person reading the day needs to see.
 */
export function appointmentTitle(work: string): string {
  const first = appointmentConcerns(work)[0] ?? work.trim()
  return first.length > TITLE_LENGTH ? `${first.slice(0, TITLE_LENGTH - 3)}...` : first
}
