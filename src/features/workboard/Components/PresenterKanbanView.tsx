'use client'

import { Wrench, ClipboardCheck } from 'lucide-react'
import type { Technician } from '../store/workboardStore'
import type { BoardAssignmentWithJob } from '../Actions/boardActions'

const STATUS_COLUMNS = [
  { key: 'pending', label: 'Pending', color: 'bg-yellow-500' },
  { key: 'in-progress', label: 'In Progress', color: 'bg-orange-500' },
  { key: 'waiting-parts', label: 'Waiting Parts', color: 'bg-red-500' },
  { key: 'completed', label: 'Completed', color: 'bg-emerald-500' },
] as const

function getAssignmentStatus(a: BoardAssignmentWithJob): string {
  if (a.serviceRecordId) return a.serviceRecord?.status ?? 'pending'
  if (a.inspectionId) return a.inspection?.status ?? 'pending'
  return 'pending'
}

function KanbanCard({ assignment }: { assignment: BoardAssignmentWithJob }) {
  const isServiceRecord = !!assignment.serviceRecordId
  const vehicle = isServiceRecord
    ? assignment.serviceRecord?.vehicle
    : assignment.inspection?.vehicle
  const title = isServiceRecord
    ? assignment.serviceRecord?.title
    : assignment.inspection?.template?.name

  return (
    <div className="rounded-lg border bg-card p-2.5 shadow-sm">
      <div className="flex items-center gap-1.5">
        {isServiceRecord ? (
          <Wrench className="h-4 w-4 shrink-0 text-blue-500" />
        ) : (
          <ClipboardCheck className="h-4 w-4 shrink-0 text-green-500" />
        )}
        <span className="truncate text-sm font-semibold">{title}</span>
      </div>
      {vehicle && (
        <p className="mt-1 truncate text-sm text-muted-foreground">
          {vehicle.year} {vehicle.make} {vehicle.model}
          {vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ''}
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
  assignments: BoardAssignmentWithJob[]
}) {
  const dayAssignments = assignments.filter((a) => a.date === date)

  if (technicians.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-lg text-muted-foreground">No technicians configured</p>
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
        {/* Status header row */}
        <div className="border-b p-2" />
        {STATUS_COLUMNS.map((col) => {
          const count = dayAssignments.filter((a) => getAssignmentStatus(a) === col.key).length
          return (
            <div key={col.key} className="flex items-center justify-center gap-2 border-b border-l p-2">
              <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
              <span className="text-sm font-semibold">{col.label}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{count}</span>
            </div>
          )
        })}

        {/* Tech rows */}
        {technicians.map((tech) => {
          const techJobs = dayAssignments.filter((a) => a.technicianId === tech.id)
          return (
            <div key={tech.id} className="contents">
              {/* Tech name */}
              <div className="flex items-center gap-2 border-b p-2">
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: tech.color }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{tech.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {techJobs.length} {techJobs.length === 1 ? 'job' : 'jobs'}
                  </p>
                </div>
              </div>

              {/* Status columns */}
              {STATUS_COLUMNS.map((col) => {
                const cellJobs = techJobs
                  .filter((a) => getAssignmentStatus(a) === col.key)
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                return (
                  <div key={`${tech.id}-${col.key}`} className="space-y-1.5 overflow-y-auto border-b border-l p-1.5">
                    {cellJobs.map((assignment) => (
                      <KanbanCard key={assignment.id} assignment={assignment} />
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
