'use client'

import {
  type AwayByLaneDay,
  type BoardAway,
  type ClosedByDay,
  awayKey,
} from '../hooks/useBoardCalendar'
import { useDroppable } from '@dnd-kit/core'
import { ClipboardCheck, Users, Wrench } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { WorkBoardJob } from '../Actions/boardActions'
import { getDurationMinutes, getJobDateRange, jobOverlapsDate } from '../utils/datetime'
import type { ClockFormat } from '../utils/clock'
import { type BoardLane, isHelperLane } from '../utils/lanes'
import { interactiveRow } from '@/lib/interactive-row'
import { BoardJobCard, TeamCount } from './BoardJobCard'
import { formatDuration } from './DurationSlider'
import { JobTooltip } from './JobTooltip'
import { LaneHeaderTooltip } from './LaneHeaderTooltip'

/**
 * The week as a list per lane per day.
 *
 * The timeline answers "when and for how long"; this answers "who has what",
 * and it is the layout that survives a big team: fifteen technicians is fifteen
 * rows and five columns, which fits a screen, where the timeline would be
 * seventy-five columns and three screens of sideways scrolling.
 */
export function WeekCardGrid({
  days,
  lanes,
  jobsByLane,
  todayStr,
  timeFormat,
  lookup,
  readOnly = false,
  onOpenJob,
  onLaneClick,
  closedByDay,
  awayByLaneDay,
}: {
  days: string[]
  lanes: BoardLane[]
  jobsByLane: Map<string, WorkBoardJob[]>
  todayStr: string
  timeFormat: ClockFormat
  /** Technicians and bays by id, for naming both in a job's tooltip. */
  lookup?: Map<string, { name: string; color: string }>
  /** Wall-display mode: the same grid, with nothing to pick up. */
  readOnly?: boolean
  onOpenJob: (job: WorkBoardJob) => void
  onLaneClick?: (lane: BoardLane) => void
  /** Closed days from the workshop calendar, by day. */
  closedByDay?: ClosedByDay
  /** Technicians away, by `awayKey(lane, day)`. */
  awayByLaneDay?: AwayByLaneDay
}) {
  const t = useTranslations('workBoard.board')

  const gridTemplateColumns = `minmax(120px, 160px) repeat(${days.length}, minmax(140px, 1fr))`

  return (
    // `isolate` so the sticky row and column stack against each other only,
    // never against the app's top bar when the page scrolls under it.
    <div className="isolate min-h-0 min-w-0 flex-1 overflow-auto rounded-md border">
      <div className="grid min-w-full gap-px bg-border/60" style={{ gridTemplateColumns }}>
        <div className="sticky left-0 top-0 z-30 bg-background" />
        {days.map((day) => {
          const date = new Date(`${day}T12:00:00`)
          const isToday = day === todayStr
          const closed = closedByDay?.[day]
          return (
            <div
              key={`head-${day}`}
              className={cn(
                'sticky top-0 z-20 truncate bg-background px-2 py-1 text-center text-xs font-medium',
                isToday ? 'text-primary' : 'text-muted-foreground'
              )}
              title={closed?.label ?? undefined}
            >
              {t(`days.${DAY_KEYS[date.getDay()]}`)} {date.getDate()}
              {closed?.label && (
                <span className="block truncate text-[10px] font-normal" data-testid="day-closed">
                  {closed.label}
                </span>
              )}
            </div>
          )
        })}

        {lanes.map((lane) => {
          const laneJobs = jobsByLane.get(lane.id) ?? []
          return (
            <div key={lane.id} className="contents">
              <LaneHeaderTooltip
                lane={lane}
                jobs={laneJobs}
                days={days}
                capacityMinutes={lane.dailyCapacity * days.length}
                periodLabel={t('lanes.thisWeek')}
              >
                <button
                  type="button"
                  disabled={lane.isPlaceholder || readOnly || !onLaneClick}
                  onClick={() => onLaneClick?.(lane)}
                  className="sticky left-0 z-10 flex flex-col justify-center gap-1 bg-background p-2 text-left disabled:cursor-default"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: lane.color }}
                    />
                    <span className="truncate text-sm font-medium">{lane.name}</span>
                  </span>
                </button>
              </LaneHeaderTooltip>

              {days.map((day) => (
                <DayCell
                  key={`${lane.id}-${day}`}
                  lane={lane}
                  date={day}
                  jobs={laneJobs.filter((job) => jobOverlapsDate(job, day))}
                  isToday={day === todayStr}
                  closedAllDay={!!closedByDay?.[day]?.allDay}
                  away={awayByLaneDay?.[awayKey(lane.id, day)]}
                  readOnly={readOnly}
                  timeFormat={timeFormat}
                  lookup={lookup}
                  onOpenJob={onOpenJob}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function DayCell({
  lane,
  date,
  jobs,
  isToday,
  closedAllDay,
  away,
  readOnly,
  timeFormat,
  lookup,
  onOpenJob,
}: {
  lane: BoardLane
  date: string
  jobs: WorkBoardJob[]
  isToday: boolean
  /** The workshop is closed the whole day. */
  closedAllDay?: boolean
  /** The lane's technician is away that day. */
  away?: BoardAway
  readOnly?: boolean
  timeFormat: ClockFormat
  lookup?: Map<string, { name: string; color: string }>
  onOpenJob: (job: WorkBoardJob) => void
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `card::${lane.id}::${date}`,
    data: { laneId: lane.id, date, week: true },
    disabled: readOnly,
  })

  const booked = jobs.reduce((sum, job) => {
    const { start, end } = getJobDateRange(job)
    return start && end ? sum + getDurationMinutes(start, end) : sum
  }, 0)
  const pct = lane.dailyCapacity > 0 ? (booked / lane.dailyCapacity) * 100 : 0

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[84px] flex-col gap-1 bg-background p-1.5 transition-colors',
        isToday && 'bg-primary/[0.04]',
        closedAllDay && 'bg-muted/70',
        isOver && 'bg-primary/10'
      )}
    >
      {away && (
        <p
          className="truncate rounded-sm border border-dashed border-muted-foreground/40 px-1 text-[10px] font-medium text-muted-foreground"
          data-testid="lane-away"
        >
          {away.label}
        </p>
      )}
      {jobs.map((job) => {
        const technician = job.technicianId ? lookup?.get(job.technicianId) : null
        return (
          <JobTooltip
            key={job.id}
            job={job}
            timeFormat={timeFormat}
            ownerName={technician?.name}
            ownerColor={technician?.color}
            helperNames={job.helperIds
              .map((id) => lookup?.get(id)?.name)
              .filter((name): name is string => !!name)}
            bayName={job.workBayId ? lookup?.get(job.workBayId)?.name : null}
          >
            <div>
              {isHelperLane(job, lane.id, lane.grouping) ? (
                // Here because this lane's technician is helping on it. It
                // opens the job and cannot be picked up: the card that moves
                // the job is the one in its own technician's lane.
                <ShadowJobCard
                  job={job}
                  technicianName={technician?.name ?? null}
                  onClick={readOnly ? undefined : () => onOpenJob(job)}
                />
              ) : readOnly ? (
                <StaticJobCard job={job} />
              ) : (
                <BoardJobCard job={job} onClick={() => onOpenJob(job)} />
              )}
            </div>
          </JobTooltip>
        )
      })}

      {booked > 0 && (
        <div className="mt-auto space-y-0.5 pt-1">
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full',
                pct > 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
              )}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <p
            className={cn(
              'text-center text-[10px] font-medium tabular-nums',
              pct > 100 ? 'text-red-500' : 'text-muted-foreground'
            )}
          >
            {formatDuration(booked)}
            {lane.dailyCapacity > 0 ? ` / ${formatDuration(lane.dailyCapacity)}` : ''}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * The same card without a grip or a drag listener.
 *
 * A wall display should not offer to pick anything up: the grip appearing on
 * hover invites a drag that would do nothing, because the presenter wires no
 * drop handlers at all.
 */
function StaticJobCard({ job }: { job: WorkBoardJob }) {
  return (
    <div className="rounded-md border bg-card p-1.5 text-xs shadow-sm">
      <div className="flex items-center gap-1">
        {job.type === 'serviceRecord' ? (
          <Wrench className="h-3 w-3 shrink-0 text-blue-500" />
        ) : (
          <ClipboardCheck className="h-3 w-3 shrink-0 text-green-500" />
        )}
        <span className="truncate font-medium">{job.title}</span>
      </div>
      {job.vehicle && (
        <p className="truncate text-muted-foreground">
          {job.vehicle.year} {job.vehicle.make} {job.vehicle.model}
          {job.vehicle.licensePlate ? ` · ${job.vehicle.licensePlate}` : ''}
        </p>
      )}
      <TeamCount count={job.helperIds.length} />
    </div>
  )
}

/**
 * A job as it sits in the day of somebody helping on it: an outline rather
 * than a card, saying whose job it is.
 */
function ShadowJobCard({
  job,
  technicianName,
  onClick,
}: {
  job: WorkBoardJob
  technicianName: string | null
  onClick?: () => void
}) {
  const t = useTranslations('workBoard.job')
  return (
    <div
      data-testid="job-shadow"
      className={cn(
        'rounded-md border border-dashed border-foreground/40 bg-background/80 p-1.5 text-xs',
        onClick && 'cursor-pointer hover:bg-muted/60'
      )}
      {...(onClick ? interactiveRow(onClick) : {})}
    >
      <div className="flex items-center gap-1">
        <Users className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{job.title}</span>
      </div>
      {job.vehicle && (
        <p className="truncate text-muted-foreground">
          {job.vehicle.year} {job.vehicle.make} {job.vehicle.model}
          {job.vehicle.licensePlate ? ` · ${job.vehicle.licensePlate}` : ''}
        </p>
      )}
      <p className="truncate text-[10px] font-medium text-muted-foreground">
        {technicianName ? t('with', { name: technicianName }) : t('helping')}
      </p>
    </div>
  )
}
