'use server'

import { db } from '@/lib/db'
import { atZonedTime } from '@/lib/timezone'
import { endOfWorkshopDay, shiftWorkshopTime } from '@/lib/workshop-datetime'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { withAuth } from '@/lib/with-auth'
import { demoGuard } from '@/lib/demo'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import {
  createReportScheduleSchema,
  updateReportScheduleSchema,
} from '../Schema/reportScheduleSchema'

/** The next run is 08:00 on the workshop's clock, one period on from `from`. */
function calculateNextRunDate(from: Date, frequency: string, timeZone: string): Date {
  let next = from
  switch (frequency) {
    case 'daily':
      next = shiftWorkshopTime(from, { days: 1 }, timeZone)
      break
    case 'weekly':
      next = shiftWorkshopTime(from, { days: 7 }, timeZone)
      break
    case 'biweekly':
      next = shiftWorkshopTime(from, { days: 14 }, timeZone)
      break
    case 'monthly':
      next = shiftWorkshopTime(from, { months: 1 }, timeZone)
      break
    case 'bimonthly':
      next = shiftWorkshopTime(from, { months: 2 }, timeZone)
      break
    case 'quarterly':
      next = shiftWorkshopTime(from, { months: 3 }, timeZone)
      break
    case 'semiannually':
      next = shiftWorkshopTime(from, { months: 6 }, timeZone)
      break
    case 'yearly':
      next = shiftWorkshopTime(from, { years: 1 }, timeZone)
      break
  }
  return atZonedTime(next, '08:00', timeZone)
}

export async function getReportSchedules() {
  return withAuth(
    async ({ organizationId }) => {
      const schedules = await db.reportSchedule.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      })

      return schedules.map((s) => ({
        ...s,
        sections: JSON.parse(s.sections) as string[],
        recipients: JSON.parse(s.recipients) as string[],
      }))
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.REPORTS }],
    }
  )
}

export async function getOrgMembers() {
  return withAuth(
    async ({ organizationId }) => {
      const members = await db.organizationMember.findMany({
        where: { organizationId },
        select: {
          user: { select: { id: true, name: true, email: true } },
        },
      })
      return members.map((m) => m.user)
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.REPORTS }],
    }
  )
}

export async function createReportSchedule(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const data = createReportScheduleSchema.parse(input)
      const timeZone = await workshopTimeZone(organizationId)
      const nextRunDate = calculateNextRunDate(new Date(), data.frequency, timeZone)

      const schedule = await db.reportSchedule.create({
        data: {
          name: data.name || 'Scheduled Report',
          frequency: data.frequency,
          dateRange: data.dateRange || 'last30d',
          sections: JSON.stringify(data.sections),
          recipients: JSON.stringify(data.recipients),
          nextRunDate,
          endDate: endOfWorkshopDay(data.endDate, timeZone) ?? null,
          organizationId,
          createdById: userId,
        },
      })

      revalidatePath('/settings/report-schedule')
      return schedule
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.CREATE,
          subject: PermissionSubject.REPORTS,
        },
      ],
    }
  )
}

export async function updateReportSchedule(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = updateReportScheduleSchema.parse(input)

      const existing = await db.reportSchedule.findFirst({
        where: { id: data.id, organizationId },
      })
      if (!existing) throw new Error('Schedule not found')

      const timeZone = await workshopTimeZone(organizationId)
      const frequencyChanged = data.frequency !== existing.frequency
      const nextRunDate = frequencyChanged
        ? calculateNextRunDate(new Date(), data.frequency, timeZone)
        : existing.nextRunDate

      const schedule = await db.reportSchedule.update({
        where: { id: data.id },
        data: {
          name: data.name || 'Scheduled Report',
          frequency: data.frequency,
          dateRange: data.dateRange || 'last30d',
          sections: JSON.stringify(data.sections),
          recipients: JSON.stringify(data.recipients),
          nextRunDate,
          endDate: endOfWorkshopDay(data.endDate, timeZone) ?? null,
          isActive: data.isActive ?? existing.isActive,
        },
      })

      revalidatePath('/settings/report-schedule')
      return schedule
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.REPORTS,
        },
      ],
    }
  )
}

export async function deleteReportSchedule(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const existing = await db.reportSchedule.findFirst({
        where: { id, organizationId },
      })
      if (!existing) throw new Error('Schedule not found')

      await db.reportSchedule.delete({ where: { id } })

      revalidatePath('/settings/report-schedule')
      return { deleted: true }
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.DELETE,
          subject: PermissionSubject.REPORTS,
        },
      ],
    }
  )
}

export async function sendReportNow(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      // processOneSchedule already returns early in demo mode, so without this
      // the visitor gets `{ sent: true }` for a report that was never built and
      // never left. Refusing out loud is the honest answer.
      demoGuard()
      const schedule = await db.reportSchedule.findFirst({
        where: { id, organizationId },
      })
      if (!schedule) throw new Error('Schedule not found')

      // Dynamically import and run the cron's processing logic for this single schedule
      const { processOneSchedule } = await import('@/lib/cron/report-schedules')
      await processOneSchedule(schedule)

      revalidatePath('/settings/report-schedule')
      return { sent: true }
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.REPORTS,
        },
      ],
    }
  )
}

export async function toggleReportSchedule(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const existing = await db.reportSchedule.findFirst({
        where: { id, organizationId },
      })
      if (!existing) throw new Error('Schedule not found')

      const isActive = !existing.isActive
      const nextRunDate = isActive
        ? calculateNextRunDate(
            new Date(),
            existing.frequency,
            await workshopTimeZone(organizationId)
          )
        : existing.nextRunDate

      const schedule = await db.reportSchedule.update({
        where: { id },
        data: { isActive, nextRunDate },
      })

      revalidatePath('/settings/report-schedule')
      return schedule
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.REPORTS,
        },
      ],
    }
  )
}
