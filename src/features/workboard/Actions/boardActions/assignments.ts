'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import { notificationBus } from '@/lib/notification-bus'
import { pushToTechnician } from '@/features/notifications/Lib/pushToTechnician'
import {
  assignTechnicianSchema,
  moveJobSchema,
  unassignJobSchema,
} from '../../Schema/workboardSchema'
import {
  INSPECTION_JOB_SELECT,
  ON_BOARD,
  SERVICE_JOB_SELECT,
  VEHICLE_SELECT,
  inspectionToJob,
  serviceRecordToJob,
} from './mappers'
import type { WorkBoardJob, WorkBoardSettings } from './types'

export async function getBoardJobs(weekStart: string) {
  return withAuth(
    async ({ organizationId }) => {
      const start = new Date(weekStart)
      const end = new Date(start)
      end.setDate(end.getDate() + 7)

      const [serviceRecords, inspections] = await Promise.all([
        db.serviceRecord.findMany({
          where: {
            organizationId,
            AND: [
              ON_BOARD,
              {
                OR: [
                  { startDateTime: { gte: start, lt: end } },
                  { endDateTime: { gt: start, lte: end } },
                  { startDateTime: { lte: start }, endDateTime: { gte: end } },
                  { startDateTime: null },
                ],
              },
            ],
          },
          select: SERVICE_JOB_SELECT,
          orderBy: { sortOrder: 'asc' },
        }),
        db.inspection.findMany({
          where: {
            organizationId,
            AND: [
              ON_BOARD,
              {
                OR: [
                  { startDateTime: { gte: start, lt: end } },
                  { endDateTime: { gt: start, lte: end } },
                  { startDateTime: { lte: start }, endDateTime: { gte: end } },
                  { startDateTime: null },
                ],
              },
            ],
          },
          select: INSPECTION_JOB_SELECT,
          orderBy: { sortOrder: 'asc' },
        }),
      ])

      const jobs: WorkBoardJob[] = [
        ...serviceRecords.map(serviceRecordToJob),
        ...inspections.map(inspectionToJob),
      ]
      jobs.sort((a, b) => a.sortOrder - b.sortOrder)

      return jobs
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_BOARD },
      ],
    }
  )
}

export async function getUnassignedJobs() {
  return withAuth(
    async ({ organizationId }) => {
      const [serviceRecords, inspections] = await Promise.all([
        db.serviceRecord.findMany({
          where: {
            organizationId,
            technicianId: null,
            workBayId: null,
            status: { in: ['pending', 'in-progress', 'waiting-parts', 'scheduled'] },
          },
          select: {
            id: true,
            title: true,
            status: true,
            vehicle: { select: VEHICLE_SELECT },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        db.inspection.findMany({
          where: {
            organizationId,
            technicianId: null,
            workBayId: null,
            status: { in: ['in_progress', 'pending'] },
          },
          select: {
            id: true,
            status: true,
            vehicle: { select: VEHICLE_SELECT },
            template: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      ])

      return { serviceRecords, inspections }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_BOARD },
      ],
    }
  )
}

export async function assignTechnician(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = assignTechnicianSchema.parse(input)

      const tech = await db.technician.findFirst({
        where: { id: data.technicianId, organizationId },
      })
      if (!tech) throw new Error('Technician not found')

      let job: WorkBoardJob

      const timeData =
        data.startDateTime && data.endDateTime
          ? { startDateTime: data.startDateTime, endDateTime: data.endDateTime }
          : {}

      if (data.type === 'serviceRecord') {
        const owned = await db.serviceRecord.findFirst({
          where: { id: data.id, organizationId },
          select: { id: true },
        })
        if (!owned) throw new Error('Service record not found')

        const sr = await db.serviceRecord.update({
          where: { id: data.id },
          data: { technicianId: data.technicianId, techName: tech.name, ...timeData },
          select: SERVICE_JOB_SELECT,
        })
        job = serviceRecordToJob(sr)
      } else {
        const owned = await db.inspection.findFirst({
          where: { id: data.id, organizationId },
          select: { id: true },
        })
        if (!owned) throw new Error('Inspection not found')

        const insp = await db.inspection.update({
          where: { id: data.id },
          data: { technicianId: data.technicianId, ...timeData },
          select: INSPECTION_JOB_SELECT,
        })
        job = inspectionToJob(insp)
      }

      notificationBus.emit('workboard', {
        type: 'job_assigned',
        organizationId,
        job,
      })

      // Tells the technician's phone. Not awaited: assigning a job succeeded
      // the moment the row was written, and a push service having a bad minute
      // must not turn that into an error on the board.
      void pushToTechnician({
        organizationId,
        technicianId: data.technicianId,
        message: {
          title: 'New job assignment',
          // Plate and job together, matching the running-clock notification.
          // A plate says which car without saying what to do to it; a title
          // says the opposite. On a lock screen the technician gets one look.
          body: [job.vehicle?.licensePlate?.trim(), job.title].filter(Boolean).join(' · '),
          // Read by the app to open the job rather than just the job list.
          data: data.type === 'serviceRecord' ? { jobId: data.id } : {},
        },
      })

      revalidatePath('/work-board')
      return job
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.WORK_BOARD },
      ],
    }
  )
}

export async function moveJob(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = moveJobSchema.parse(input)

      const tech = await db.technician.findFirst({
        where: { id: data.technicianId, organizationId },
      })
      if (!tech) throw new Error('Technician not found')

      let job: WorkBoardJob

      if (data.type === 'serviceRecord') {
        const owned = await db.serviceRecord.findFirst({
          where: { id: data.id, organizationId },
          select: { id: true },
        })
        if (!owned) throw new Error('Service record not found')

        const sr = await db.serviceRecord.update({
          where: { id: data.id },
          data: {
            technicianId: data.technicianId,
            sortOrder: data.sortOrder,
            techName: tech.name,
          },
          select: SERVICE_JOB_SELECT,
        })
        job = serviceRecordToJob(sr)
      } else {
        const owned = await db.inspection.findFirst({
          where: { id: data.id, organizationId },
          select: { id: true },
        })
        if (!owned) throw new Error('Inspection not found')

        const insp = await db.inspection.update({
          where: { id: data.id },
          data: {
            technicianId: data.technicianId,
            sortOrder: data.sortOrder,
          },
          select: INSPECTION_JOB_SELECT,
        })
        job = inspectionToJob(insp)
      }

      notificationBus.emit('workboard', {
        type: 'job_moved',
        organizationId,
        job,
      })

      revalidatePath('/work-board')
      return job
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.WORK_BOARD },
      ],
    }
  )
}

export async function unassignJob(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = unassignJobSchema.parse(input)

      if (data.type === 'serviceRecord') {
        const sr = await db.serviceRecord.findFirst({
          where: { id: data.id, organizationId },
        })
        if (!sr) throw new Error('Service record not found')

        await db.serviceRecord.update({
          where: { id: data.id },
          data: { technicianId: null, techName: null, workBayId: null, sortOrder: 0 },
        })
      } else {
        const insp = await db.inspection.findFirst({
          where: { id: data.id, organizationId },
        })
        if (!insp) throw new Error('Inspection not found')

        await db.inspection.update({
          where: { id: data.id },
          data: { technicianId: null, workBayId: null, sortOrder: 0 },
        })
      }

      notificationBus.emit('workboard', {
        type: 'job_unassigned',
        organizationId,
        jobId: data.id,
        jobType: data.type,
      })

      revalidatePath('/work-board')
      return { success: true }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.WORK_BOARD },
      ],
    }
  )
}

export async function getWorkBoardSettings() {
  return withAuth(
    async ({ organizationId }) => {
      const settings = await db.appSetting.findMany({
        where: {
          organizationId,
          key: { in: ['workboard.weekStartDay', 'workboard.workDayStart', 'workboard.workDayEnd'] },
        },
      })

      const map: Record<string, string> = {}
      for (const s of settings) {
        map[s.key] = s.value
      }

      // Clamp so a corrupt stored value can never produce NaN week starts downstream
      const parsedWeekStart = parseInt(map['workboard.weekStartDay'] || '1', 10)

      return {
        weekStartDay:
          Number.isInteger(parsedWeekStart) && parsedWeekStart >= 0 && parsedWeekStart <= 6
            ? parsedWeekStart
            : 1,
        workDayStart: map['workboard.workDayStart'] || '07:00',
        workDayEnd: map['workboard.workDayEnd'] || '15:00',
      } as WorkBoardSettings
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_BOARD },
      ],
    }
  )
}
