/**
 * Lanes are what the board draws its columns from.
 *
 * A workshop plans by whichever resource is scarce: the person on some days,
 * the lift on others. Rather than hard-wiring technicians into the board, every
 * view asks for lanes under a grouping and gets back the same shape, so adding
 * a third way to slice the week later is a new `LaneGrouping` and nothing else.
 */

import type { WorkBay, WorkBoardJob } from '../Actions/boardActions'
import type { Technician } from '../store/workboardStore'

export type LaneGrouping = 'technician' | 'bay' | 'none'

export const LANE_GROUPINGS: LaneGrouping[] = ['technician', 'bay', 'none']

export function isLaneGrouping(value: unknown): value is LaneGrouping {
  return typeof value === 'string' && (LANE_GROUPINGS as string[]).includes(value)
}

/** Lane id for work that has no value for the current grouping. */
export const UNLANED = '__unlaned__'
/** Lane id when the board is not split at all. */
export const ALL_LANE = '__all__'

export type BoardLane = {
  id: string
  name: string
  color: string
  /** Bookable minutes per day. 0 means "do not show utilisation". */
  dailyCapacity: number
  grouping: LaneGrouping
  /** True for the catch-all lane, which nothing can be permanently assigned to. */
  isPlaceholder: boolean
}

/**
 * Which lane a job belongs in under a grouping.
 *
 * Pass `known` to fold work that points at a lane the board is not showing (a
 * technician since made inactive, a bay deleted in another tab) into the
 * catch-all lane. Without it such a job would be bucketed under an id nothing
 * renders and would quietly vanish from the week.
 */
export function laneIdForJob(
  job: WorkBoardJob,
  grouping: LaneGrouping,
  known?: ReadonlySet<string>
): string {
  if (grouping === 'none') return ALL_LANE
  const id = grouping === 'technician' ? job.technicianId : job.workBayId
  if (!id) return UNLANED
  return known && !known.has(id) ? UNLANED : id
}

/**
 * Whether a job is in this lane because the lane's technician is helping on
 * it, rather than because it is theirs.
 *
 * Only a board grouped by technician has such lanes. Grouped by bay, or not
 * at all, a job sits in one place and says who is on it on its own card.
 */
export function isHelperLane(job: WorkBoardJob, laneId: string, grouping: LaneGrouping): boolean {
  return grouping === 'technician' && job.technicianId !== laneId && job.helperIds.includes(laneId)
}

/**
 * Every lane a job is drawn in: its own first, then, on a board grouped by
 * technician, the lane of each person helping on it. The board plans a
 * person's day, so a job two people are on is in both their days.
 *
 * A helper the board is not showing (made inactive since) has no lane to be
 * in and is left out, rather than bucketed under an id nothing renders.
 */
export function laneIdsForJob(
  job: WorkBoardJob,
  grouping: LaneGrouping,
  known?: ReadonlySet<string>
): string[] {
  const own = laneIdForJob(job, grouping, known)
  if (grouping !== 'technician' || job.helperIds.length === 0) return [own]
  const ids = [own]
  for (const helperId of job.helperIds) {
    // Never twice in one lane: mid-drag a job can name a helper as its
    // technician before the server has swapped the two.
    if (helperId === job.technicianId || ids.includes(helperId)) continue
    if (known && !known.has(helperId)) continue
    ids.push(helperId)
  }
  return ids
}

/**
 * Who is helping once a job's technician changes, for drawing a drag before
 * the server answers. The same three rules the server applies when it writes
 * the change (Lib/jobTeam.ts `settleHelpers`), and a test holds the two
 * together: unassigned, the helpers go; a helper taking over swaps with the
 * technician; somebody new leaves the helpers as they were.
 */
export function helpersAfterTechnicianChange(
  job: Pick<WorkBoardJob, 'technicianId' | 'helperIds'>,
  nextId: string | null
): string[] {
  if (nextId === job.technicianId) return job.helperIds
  if (!nextId) return []
  if (!job.helperIds.includes(nextId)) return job.helperIds
  const rest = job.helperIds.filter((id) => id !== nextId)
  return job.technicianId ? [...rest, job.technicianId] : rest
}

/** The field a drop into a lane writes, ready to spread into `scheduleJob`. */
export function laneAssignment(
  laneId: string,
  grouping: LaneGrouping
): { technicianId?: string | null; workBayId?: string | null } {
  if (grouping === 'none' || laneId === ALL_LANE) return {}
  const value = laneId === UNLANED ? null : laneId
  return grouping === 'technician' ? { technicianId: value } : { workBayId: value }
}

export function buildLanes({
  grouping,
  technicians,
  workBays,
  jobs,
  labels,
}: {
  grouping: LaneGrouping
  technicians: Technician[]
  workBays: WorkBay[]
  jobs: WorkBoardJob[]
  labels: { unlaned: string; all: string }
}): BoardLane[] {
  if (grouping === 'none') {
    return [
      {
        id: ALL_LANE,
        name: labels.all,
        color: '#64748b',
        dailyCapacity: technicians.reduce((sum, t) => sum + t.dailyCapacity, 0),
        grouping,
        isPlaceholder: false,
      },
    ]
  }

  const lanes: BoardLane[] =
    grouping === 'technician'
      ? technicians.map((t) => ({
          id: t.id,
          name: t.name,
          color: t.color,
          dailyCapacity: t.dailyCapacity,
          grouping,
          isPlaceholder: false,
        }))
      : workBays.map((b) => ({
          id: b.id,
          name: b.name,
          color: b.color,
          dailyCapacity: b.dailyCapacity,
          grouping,
          isPlaceholder: false,
        }))

  // Grouping by bay in a shop that has only just added bays would otherwise
  // hide every job on the board. The catch-all lane appears only when it has
  // something in it, and disappears again once everything is placed.
  const known = new Set(lanes.map((lane) => lane.id))
  const hasUnlaned = jobs.some((job) => laneIdForJob(job, grouping, known) === UNLANED)
  if (hasUnlaned) {
    lanes.push({
      id: UNLANED,
      name: labels.unlaned,
      color: '#94a3b8',
      dailyCapacity: 0,
      grouping,
      isPlaceholder: true,
    })
  }

  return lanes
}

/**
 * Jobs bucketed by lane id, so a lane column never scans the whole week.
 *
 * A job with helpers is in more than one bucket on a board grouped by
 * technician: its own lane, and each helper's. `isHelperLane` tells a lane
 * which of its jobs are which.
 */
export function groupJobsByLane(
  jobs: WorkBoardJob[],
  grouping: LaneGrouping,
  known?: ReadonlySet<string>
): Map<string, WorkBoardJob[]> {
  const map = new Map<string, WorkBoardJob[]>()
  for (const job of jobs) {
    for (const laneId of laneIdsForJob(job, grouping, known)) {
      const bucket = map.get(laneId)
      if (bucket) bucket.push(job)
      else map.set(laneId, [job])
    }
  }
  return map
}
