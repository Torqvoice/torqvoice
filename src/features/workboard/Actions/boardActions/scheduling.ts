'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import { notificationBus } from '@/lib/notification-bus'
import { scheduleJobSchema, updateServiceTimesSchema } from '../../Schema/workboardSchema'
import {
  INSPECTION_JOB_SELECT,
  SERVICE_JOB_SELECT,
  inspectionToJob,
  serviceRecordToJob,
} from './mappers'
import type { WorkBoardJob } from './types'

export async function updateServiceTimes(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = updateServiceTimesSchema.parse(input)

      if (data.endDateTime <= data.startDateTime) {
        throw new Error('End time must be after start time')
      }

      const record = await db.serviceRecord.findFirst({
        where: { id: data.id, organizationId },
      })
      if (!record) throw new Error('Service record not found')

      await db.serviceRecord.update({
        where: { id: data.id },
        data: {
          startDateTime: data.startDateTime,
          endDateTime: data.endDateTime,
        },
      })

      notificationBus.emit('workboard', {
        type: 'service_times_updated',
        organizationId,
        serviceRecordId: data.id,
        startDateTime: data.startDateTime.toISOString(),
        endDateTime: data.endDateTime.toISOString(),
      })

      revalidatePath('/work-board')
      revalidatePath('/vehicles')
      return {
        id: data.id,
        startDateTime: data.startDateTime.toISOString(),
        endDateTime: data.endDateTime.toISOString(),
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.WORK_BOARD },
      ],
    }
  )
}

export async function updateInspectionTimes(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = updateServiceTimesSchema.parse(input)

      if (data.endDateTime <= data.startDateTime) {
        throw new Error('End time must be after start time')
      }

      const inspection = await db.inspection.findFirst({
        where: { id: data.id, organizationId },
      })
      if (!inspection) throw new Error('Inspection not found')

      await db.inspection.update({
        where: { id: data.id },
        data: {
          startDateTime: data.startDateTime,
          endDateTime: data.endDateTime,
        },
      })

      notificationBus.emit('workboard', {
        type: 'inspection_times_updated',
        organizationId,
        inspectionId: data.id,
        startDateTime: data.startDateTime.toISOString(),
        endDateTime: data.endDateTime.toISOString(),
      })

      revalidatePath('/work-board')
      return {
        id: data.id,
        startDateTime: data.startDateTime.toISOString(),
        endDateTime: data.endDateTime.toISOString(),
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.WORK_BOARD },
      ],
    }
  )
}

/**
 * The single write behind every board drag: lane, bay and time in one update.
 *
 * Fields left out are untouched; an explicit `null` clears the lane. One
 * database write means one websocket event, so a second viewer never sees the
 * job land in its new lane a beat before it lands at its new time.
 */
export async function scheduleJob(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = scheduleJobSchema.parse(input)

      // Resolve the lane targets first: pointing a job at another
      // organisation's technician or bay must fail before anything is written.
      let technicianName: string | null | undefined
      if (data.technicianId !== undefined) {
        if (data.technicianId === null) {
          technicianName = null
        } else {
          const tech = await db.technician.findFirst({
            where: { id: data.technicianId, organizationId },
            select: { name: true },
          })
          if (!tech) throw new Error('Technician not found')
          technicianName = tech.name
        }
      }

      if (data.workBayId) {
        const bay = await db.workBay.findFirst({
          where: { id: data.workBayId, organizationId },
          select: { id: true },
        })
        if (!bay) throw new Error('Work bay not found')
      }

      const times =
        data.startDateTime && data.endDateTime
          ? { startDateTime: data.startDateTime, endDateTime: data.endDateTime }
          : {}
      const lane = {
        ...(data.technicianId !== undefined ? { technicianId: data.technicianId } : {}),
        ...(data.workBayId !== undefined ? { workBayId: data.workBayId } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      }

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
            ...lane,
            ...times,
            // techName is the printed-invoice copy of the technician's name and
            // has to follow the assignment, including when it is cleared.
            ...(technicianName !== undefined ? { techName: technicianName } : {}),
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
          data: { ...lane, ...times },
          select: INSPECTION_JOB_SELECT,
        })
        job = inspectionToJob(insp)
      }

      notificationBus.emit('workboard', {
        type: 'job_scheduled',
        organizationId,
        job,
      })

      revalidatePath('/work-board')
      revalidatePath('/vehicles')
      return job
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.WORK_BOARD },
      ],
    }
  )
}
