'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { dateKeyOf } from '../Lib/calendar'
import { closureInputSchema } from '../Schema/calendarSchema'

/** Days the whole workshop is closed, entered by hand. */

const READ = { action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }
const UPDATE = { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }

const SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  startTime: true,
  endTime: true,
  repeatsYearly: true,
} as const

type Row = {
  id: string
  name: string
  startDate: Date
  endDate: Date
  startTime: string | null
  endTime: string | null
  repeatsYearly: boolean
}

function view(row: Row) {
  return { ...row, startDate: dateKeyOf(row.startDate), endDate: dateKeyOf(row.endDate) }
}

export type ClosureView = ReturnType<typeof view>

function revalidate() {
  revalidatePath('/settings/holidays')
  revalidatePath('/work-board')
  revalidatePath('/calendar')
}

const asDate = (key: string) => new Date(`${key}T00:00:00Z`)

export async function listClosures() {
  return withAuth(
    async ({ organizationId }) => {
      const rows = await db.workshopClosure.findMany({
        where: { organizationId },
        select: SELECT,
        orderBy: { startDate: 'asc' },
      })
      return rows.map(view)
    },
    { requiredPermissions: [READ] }
  )
}

export async function createClosure(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = closureInputSchema.parse(input)
      const row = await db.workshopClosure.create({
        data: {
          organizationId,
          name: data.name,
          startDate: asDate(data.startDate),
          endDate: asDate(data.endDate),
          startTime: data.startTime,
          endTime: data.endTime,
          repeatsYearly: data.repeatsYearly,
        },
        select: SELECT,
      })
      revalidate()
      return view(row)
    },
    { requiredPermissions: [UPDATE] }
  )
}

export async function updateClosure(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const { id, ...rest } = (input ?? {}) as { id?: unknown }
      if (typeof id !== 'string') throw new Error('Closure not found')
      const data = closureInputSchema.parse(rest)
      const result = await db.workshopClosure.updateMany({
        where: { id, organizationId },
        data: {
          name: data.name,
          startDate: asDate(data.startDate),
          endDate: asDate(data.endDate),
          startTime: data.startTime,
          endTime: data.endTime,
          repeatsYearly: data.repeatsYearly,
        },
      })
      if (result.count === 0) throw new Error('Closure not found')
      revalidate()
      return { id }
    },
    { requiredPermissions: [UPDATE] }
  )
}

export async function deleteClosure(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const result = await db.workshopClosure.deleteMany({ where: { id, organizationId } })
      if (result.count === 0) throw new Error('Closure not found')
      revalidate()
      return { id }
    },
    { requiredPermissions: [UPDATE] }
  )
}
