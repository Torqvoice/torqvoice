/**
 * Whose billed hours a job's labor is, when more than one person worked it.
 *
 * A job has one technician, and until a job could have helpers every hour on
 * its labor lines counted for that person. With an apprentice on the job as
 * well that reads wrong both ways: the technician looks as if they billed
 * five hours in the three they clocked, and the apprentice clocked three
 * hours and billed nothing.
 *
 * So a shared job's hours are shared by the time each person clocked on it.
 * Only when everybody on it clocked, though. If somebody did not, there is no
 * honest way to say how much of the work was theirs, and guessing would move
 * hours onto whoever happened to use the clock. Then the hours stay with the
 * technician, exactly as they do on a job with no helpers.
 */
export function shareBilledHours(args: {
  /** The hours on the job's labor lines. */
  hours: number
  technicianId: string
  helperIds: string[]
  /** Minutes each person has clocked on this job, by technician id. */
  clockedMinutes: ReadonlyMap<string, number>
}): Map<string, number> {
  const { hours, technicianId, helperIds, clockedMinutes } = args
  const team = [technicianId, ...helperIds.filter((id) => id !== technicianId)]
  const minutes = team.map((id) => clockedMinutes.get(id) ?? 0)
  const total = minutes.reduce((sum, m) => sum + m, 0)

  if (team.length === 1 || minutes.some((m) => m <= 0) || total <= 0) {
    return new Map([[technicianId, hours]])
  }
  return new Map(team.map((id, i) => [id, (hours * minutes[i]) / total]))
}
