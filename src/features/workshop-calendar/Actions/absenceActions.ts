'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { addDays, dateKeyOf, isDateKey } from '../Lib/calendar'
import { absenceInputSchema } from '../Schema/calendarSchema'

/**
 * Technicians' time off. Kept with the work board's rights rather than the
 * settings', because whoever plans the board is who books the holidays.
 */

const READ = { action: PermissionAction.READ, subject: PermissionSubject.WORK_BOARD }
const UPDATE = { action: PermissionAction.UPDATE, subject: PermissionSubject.WORK_BOARD }

const SELECT = {
  id: true,
  technicianId: true,
  startDate: true,
  endDate: true,
  startTime: true,
  endTime: true,
  reason: true,
  note: true,
  technician: { select: { name: true, color: true } },
} as const

type Row = {
  id: string
  technicianId: string
  startDate: Date
  endDate: Date
  startTime: string | null
  endTime: string | null
  reason: string
  note: string | null
  technician: { name: string; color: string }
}

function view(row: Row) {
  const { technician, ...rest } = row
  return {
    ...rest,
    startDate: dateKeyOf(row.startDate),
    endDate: dateKeyOf(row.endDate),
    technicianName: technician.name,
    technicianColor: technician.color,
  }
}

export type AbsenceView = ReturnType<typeof view>

function revalidate() {
  revalidatePath('/settings/holidays')
  revalidatePath('/work-board')
  revalidatePath('/calendar')
}

const asDate = (key: string) => new Date(`${key}T00:00:00Z`)

/** The technician has to be this workshop's: ids from the browser can name anyone's. */
async function assertTechnician(organizationId: string, technicianId: string) {
  const tech = await db.technician.findFirst({
    where: { id: technicianId, organizationId },
    select: { id: true },
  })
  if (!tech) throw new Error('Technician not found')
}

/**
 * Time off that ends on or after `from` (default: 30 days ago), soonest
 * first, for one technician or all.
 */
export async function listAbsences(input: { from?: string; technicianId?: string } = {}) {
  return withAuth(
    async ({ organizationId }) => {
      const today = new Date().toISOString().slice(0, 10)
      const from = input.from && isDateKey(input.from) ? input.from : addDays(today, -30)
      const rows = await db.technicianAbsence.findMany({
        where: {
          organizationId,
          endDate: { gte: asDate(from) },
          ...(input.technicianId ? { technicianId: input.technicianId } : {}),
        },
        select: SELECT,
        orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
      })
      return rows.map(view)
    },
    { requiredPermissions: [READ] }
  )
}

export async function createAbsence(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = absenceInputSchema.parse(input)
      await assertTechnician(organizationId, data.technicianId)
      const row = await db.technicianAbsence.create({
        data: {
          organizationId,
          technicianId: data.technicianId,
          startDate: asDate(data.startDate),
          endDate: asDate(data.endDate),
          startTime: data.startTime,
          endTime: data.endTime,
          reason: data.reason,
          note: data.note,
        },
        select: SELECT,
      })
      revalidate()
      return view(row)
    },
    { requiredPermissions: [UPDATE] }
  )
}

export async function updateAbsence(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const { id, ...rest } = (input ?? {}) as { id?: unknown }
      if (typeof id !== 'string') throw new Error('Time off not found')
      const data = absenceInputSchema.parse(rest)
      await assertTechnician(organizationId, data.technicianId)
      const result = await db.technicianAbsence.updateMany({
        where: { id, organizationId },
        data: {
          technicianId: data.technicianId,
          startDate: asDate(data.startDate),
          endDate: asDate(data.endDate),
          startTime: data.startTime,
          endTime: data.endTime,
          reason: data.reason,
          note: data.note,
        },
      })
      if (result.count === 0) throw new Error('Time off not found')
      revalidate()
      return { id }
    },
    { requiredPermissions: [UPDATE] }
  )
}

export async function deleteAbsence(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const result = await db.technicianAbsence.deleteMany({ where: { id, organizationId } })
      if (result.count === 0) throw new Error('Time off not found')
      revalidate()
      return { id }
    },
    { requiredPermissions: [UPDATE] }
  )
}
