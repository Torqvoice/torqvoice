'use client'

import { Wrench, ClipboardCheck } from 'lucide-react'
import type { Technician } from '../store/workboardStore'
import type { BoardAssignmentWithJob } from '../Actions/boardActions'
import { useTranslations } from 'next-intl'

function DayJobCard({ assignment }: { assignment: BoardAssignmentWithJob }) {
  const isServiceRecord = !!assignment.serviceRecordId
  const vehicle = isServiceRecord
    ? assignment.serviceRecord?.vehicle
    : assignment.inspection?.vehicle
  const title = isServiceRecord
    ? assignment.serviceRecord?.title
    : assignment.inspection?.template?.name
  const status = isServiceRecord ? assignment.serviceRecord?.status : assignment.inspection?.status

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3 shadow-sm">
      <div className="mt-0.5">
        {isServiceRecord ? (
          <Wrench className="h-5 w-5 text-blue-500" />
        ) : (
          <ClipboardCheck className="h-5 w-5 text-green-500" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold">{title}</p>
        {vehicle && (
          <p className="truncate text-sm text-muted-foreground">
            {vehicle.year} {vehicle.make} {vehicle.model}
            {vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ''}
          </p>
        )}
      </div>
      {status && (
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize">
          {status.replace(/_/g, ' ')}
        </span>
      )}
    </div>
  )
}

export function PresenterDayView({
  date,
  technicians,
  assignments,
}: {
  date: string
  technicians: Technician[]
  assignments: BoardAssignmentWithJob[]
}) {
  const t = useTranslations('workBoard.presenter')
  const dayAssignments = assignments.filter((a) => a.date === date)

  if (technicians.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-lg text-muted-foreground">{t('noTechnicians')}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="divide-y">
        {technicians.map((tech) => {
          const techJobs = dayAssignments
            .filter((a) => a.technicianId === tech.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)

          return (
            <div key={tech.id} className="flex gap-4 p-4">
              {/* Tech label */}
              <div className="flex w-36 shrink-0 items-start gap-2 pt-1">
                <div
                  className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tech.color }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{tech.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {techJobs.length === 1 ? t('job', { count: techJobs.length }) : t('jobs', { count: techJobs.length })}
                  </p>
                </div>
              </div>

              {/* Jobs */}
              <div className="flex flex-1 flex-wrap gap-2">
                {techJobs.length === 0 && (
                  <p className="py-2 text-sm text-muted-foreground/60">{t('noJobsToday')}</p>
                )}
                {techJobs.map((assignment) => (
                  <div key={assignment.id} className="w-72">
                    <DayJobCard assignment={assignment} />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
