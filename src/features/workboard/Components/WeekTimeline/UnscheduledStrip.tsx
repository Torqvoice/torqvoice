'use client'

import { useDraggable } from '@dnd-kit/core'
import { CalendarClock, ClipboardCheck, Wrench } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { WorkBoardJob } from '../../Actions/boardActions'

/** Draggable id prefix, so the board's drop handler can tell these apart. */
export const UNSCHEDULED_DRAG_PREFIX = 'unscheduled-'

/**
 * Work that has a lane but no time.
 *
 * A job can be given to a technician without anyone saying when it happens, and
 * on a timeline there is nowhere to draw it. Rather than dropping it at the
 * start of the shift and implying a booking nobody made, it waits here until
 * someone drags it onto the week.
 */
export function UnscheduledStrip({
  jobs,
  onOpenJob,
}: {
  jobs: WorkBoardJob[]
  onOpenJob: (job: WorkBoardJob) => void
}) {
  const t = useTranslations('workBoard.week')
  if (jobs.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-dashed bg-muted/30 px-2 py-1.5">
      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5" />
        {t('unscheduled', { count: jobs.length })}
      </span>
      {jobs.map((job) => (
        <UnscheduledChip key={job.id} job={job} onOpen={onOpenJob} />
      ))}
    </div>
  )
}

function UnscheduledChip({
  job,
  onOpen,
}: {
  job: WorkBoardJob
  onOpen: (job: WorkBoardJob) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${UNSCHEDULED_DRAG_PREFIX}${job.id}`,
    data: { job, unscheduled: true },
  })

  const vehicleLabel = job.vehicle
    ? job.vehicle.licensePlate || `${job.vehicle.make} ${job.vehicle.model}`
    : null

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => onOpen(job)}
      className={cn(
        'flex max-w-[220px] cursor-grab items-center gap-1 rounded border bg-card px-1.5 py-0.5 text-[11px] shadow-sm touch-none active:cursor-grabbing',
        isDragging && 'opacity-50'
      )}
    >
      {job.type === 'serviceRecord' ? (
        <Wrench className="h-3 w-3 shrink-0 text-blue-500" />
      ) : (
        <ClipboardCheck className="h-3 w-3 shrink-0 text-green-500" />
      )}
      <span className="truncate font-medium">{job.title}</span>
      {vehicleLabel && <span className="truncate text-muted-foreground">{vehicleLabel}</span>}
    </button>
  )
}
