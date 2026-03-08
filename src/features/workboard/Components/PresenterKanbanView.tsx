'use client'

import { Wrench, ClipboardCheck } from 'lucide-react'
import type { Technician } from '../store/workboardStore'
import type { WorkBoardJob } from '../Actions/boardActions'
import { jobOverlapsDate } from '../utils/datetime'
import { useTranslations } from 'next-intl'

const STATUS_COLUMNS = [
  { key: 'pending', i18nKey: 'pending', color: 'bg-yellow-500' },
  { key: 'in-progress', i18nKey: 'inProgress', color: 'bg-orange-500' },
  { key: 'waiting-parts', i18nKey: 'waitingParts', color: 'bg-red-500' },
  { key: 'completed', i18nKey: 'completed', color: 'bg-emerald-500' },
] as const

function KanbanCard({ job }: { job: WorkBoardJob }) {
  const isServiceRecord = job.type === 'serviceRecord'

  return (
    <div className="rounded-lg border bg-card p-2.5 shadow-sm">
      <div className="flex items-center gap-1.5">
        {isServiceRecord ? (
          <Wrench className="h-4 w-4 shrink-0 text-blue-500" />
        ) : (
          <ClipboardCheck className="h-4 w-4 shrink-0 text-green-500" />
        )}
        <span className="truncate text-sm font-semibold">{job.title}</span>
      </div>
      {job.vehicle && (
        <p className="mt-1 truncate text-sm text-muted-foreground">
          {job.vehicle.year} {job.vehicle.make} {job.vehicle.model}
          {job.vehicle.licensePlate ? ` · ${job.vehicle.licensePlate}` : ''}
        </p>
      )}
    </div>
  )
}

export function PresenterKanbanView({
  date,
  technicians,
  assignments,
}: {
  date: string
  technicians: Technician[]
  assignments: WorkBoardJob[]
}) {
  const t = useTranslations('workBoard.presenter')
  const dayAssignments = assignments.filter((a) => jobOverlapsDate(a, date))

  if (technicians.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-lg text-muted-foreground">{t('noTechnicians')}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div
        className="grid h-full"
        style={{
          gridTemplateColumns: `140px repeat(${STATUS_COLUMNS.length}, 1fr)`,
          gridTemplateRows: `auto ${technicians.length > 0 ? `repeat(${technicians.length}, 1fr)` : '1fr'}`,
        }}
      >
        <div className="border-b p-2" />
        {STATUS_COLUMNS.map((col) => {
          const count = dayAssignments.filter((a) => a.status === col.key).length
          return (
            <div key={col.key} className="flex items-center justify-center gap-2 border-b border-l p-2">
              <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
              <span className="text-sm font-semibold">{t(`statusLabels.${col.i18nKey}`)}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{count}</span>
            </div>
          )
        })}

        {technicians.map((tech) => {
          const techJobs = dayAssignments.filter((a) => a.technicianId === tech.id)
          return (
            <div key={tech.id} className="contents">
              <div className="flex items-center gap-2 border-b p-2">
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: tech.color }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{tech.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {techJobs.length === 1 ? t('job', { count: techJobs.length }) : t('jobs', { count: techJobs.length })}
                  </p>
                </div>
              </div>

              {STATUS_COLUMNS.map((col) => {
                const cellJobs = techJobs
                  .filter((a) => a.status === col.key)
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                return (
                  <div key={`${tech.id}-${col.key}`} className="space-y-1.5 overflow-y-auto border-b border-l p-1.5">
                    {cellJobs.map((job) => (
                      <KanbanCard key={job.id} job={job} />
                    ))}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
