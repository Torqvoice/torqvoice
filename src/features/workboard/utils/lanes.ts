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

/** Jobs bucketed by lane id, so a lane column never scans the whole week. */
export function groupJobsByLane(
  jobs: WorkBoardJob[],
  grouping: LaneGrouping,
  known?: ReadonlySet<string>
): Map<string, WorkBoardJob[]> {
  const map = new Map<string, WorkBoardJob[]>()
  for (const job of jobs) {
    const laneId = laneIdForJob(job, grouping, known)
    const bucket = map.get(laneId)
    if (bucket) bucket.push(job)
    else map.set(laneId, [job])
  }
  return map
}
