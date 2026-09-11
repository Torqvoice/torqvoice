import { db } from '@/lib/db'
import type { SheetEntry } from './timesheet'

/** A row read with `entrySelect` from ./timeEntries. */
export interface EntryRow {
  id: string
  startedAt: Date
  endedAt: Date | null
  durationMinutes: number | null
  note: string | null
  source: string
  editedAt: Date | null
  editedByUserId: string | null
  technicianId: string
  technician: { id: string; name: string; color: string }
  serviceRecord: {
    id: string
    title: string
    status: string
    vehicleId: string | null
    vehicle: { make: string; model: string; licensePlate: string | null } | null
  }
}

/**
 * Rows to what the browser reads.
 *
 * Instants become ISO strings, the vehicle collapses to one label, and the
 * account that last corrected an entry is named rather than left as an id.
 * The names come from one query for the whole batch; a sheet of a hundred
 * rows must not cost a hundred lookups.
 */
export async function toSheetEntries(rows: EntryRow[]): Promise<SheetEntry[]> {
  const editorIds = [...new Set(rows.map((r) => r.editedByUserId).filter(Boolean))] as string[]
  const editors = editorIds.length
    ? await db.user.findMany({
        where: { id: { in: editorIds } },
        select: { id: true, name: true, email: true },
      })
    : []
  const editorName = new Map(editors.map((u) => [u.id, u.name || u.email]))

  return rows.map((r) => {
    const v = r.serviceRecord.vehicle
    const vehicleLabel = v ? [v.make, v.model].filter(Boolean).join(' ') || null : null
    return {
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt ? r.endedAt.toISOString() : null,
      durationMinutes: r.durationMinutes,
      note: r.note,
      source: r.source,
      editedAt: r.editedAt ? r.editedAt.toISOString() : null,
      editedByName: r.editedByUserId ? (editorName.get(r.editedByUserId) ?? null) : null,
      technicianId: r.technicianId,
      technicianName: r.technician.name,
      technicianColor: r.technician.color,
      job: {
        id: r.serviceRecord.id,
        title: r.serviceRecord.title,
        status: r.serviceRecord.status,
        vehicleId: r.serviceRecord.vehicleId,
        vehicleLabel,
        licensePlate: v?.licensePlate ?? null,
      },
    }
  })
}
