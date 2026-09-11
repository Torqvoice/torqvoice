'use server'

import { z } from 'zod'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import {
  getOpenEntry,
  listJobEntries,
  startEntry,
  stopEntry,
  technicianIdsForUser,
  TimeEntryError,
} from '../Lib/timeEntries'
import { toSheetEntries } from '../Lib/serialize'
import { canEditTimeEntries } from '../Lib/canEdit'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import type { SheetEntry } from '../Lib/timesheet'

/**
 * The signed-in person's own clock, from the browser.
 *
 * Same rules as the technician app, same functions underneath; only the way
 * in differs. A workshop whose technicians carry iPhones gets a clock this
 * way today rather than when an iOS app exists.
 */

export interface MyClock {
  /** Empty when the account is not linked to a technician row. */
  technicianIds: string[]
  open: {
    id: string
    startedAt: string
    serviceRecordId: string
    jobTitle: string
    vehicleId: string | null
  } | null
}

export async function getMyClock() {
  return withAuth(async (ctx): Promise<MyClock> => {
    const technicianIds = await technicianIdsForUser(ctx.organizationId, ctx.userId)
    if (technicianIds.length === 0) return { technicianIds, open: null }
    const open = await getOpenEntry(ctx.organizationId, technicianIds)
    return {
      technicianIds,
      open: open
        ? {
            id: open.id,
            startedAt: open.startedAt.toISOString(),
            serviceRecordId: open.serviceRecordId,
            jobTitle: open.serviceRecord.title,
            vehicleId: open.serviceRecord.vehicleId,
          }
        : null,
    }
  })
}

const startSchema = z.object({ serviceRecordId: z.string().min(1) })

export async function startMyClock(input: { serviceRecordId: string }) {
  return withAuth(
    async (ctx) => {
      const { serviceRecordId } = startSchema.parse(input)
      const technicianIds = await technicianIdsForUser(ctx.organizationId, ctx.userId)
      if (technicianIds.length === 0) {
        throw new TimeEntryError('job_not_found', 'This account is not set up as a technician.')
      }
      const result = await startEntry({
        organizationId: ctx.organizationId,
        technicianId: technicianIds[0],
        technicianIds,
        serviceRecordId,
        source: 'web',
      })
      return {
        startedAt: result.entry.startedAt.toISOString(),
        closed: result.closed
          ? {
              serviceRecordId: result.closed.serviceRecordId,
              minutes: result.closed.durationMinutes,
            }
          : null,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}

const stopSchema = z.object({ note: z.string().max(500).optional() })

export async function stopMyClock(input: { note?: string } = {}) {
  return withAuth(
    async (ctx) => {
      const { note } = stopSchema.parse(input)
      const technicianIds = await technicianIdsForUser(ctx.organizationId, ctx.userId)
      if (technicianIds.length === 0) {
        throw new TimeEntryError('not_running', 'No clock is running.')
      }
      const entry = await stopEntry({ organizationId: ctx.organizationId, technicianIds, note })
      return { serviceRecordId: entry.serviceRecordId, minutes: entry.durationMinutes ?? 0 }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}

/** What the work order page shows: every stretch on one job, by anyone. */
export interface JobClock {
  entries: SheetEntry[]
  /** Whether the viewer can clock themselves onto this job. */
  viewerTechnicianIds: string[]
  /** Whether the viewer may correct, stop or delete entries here. */
  canEdit: boolean
  /** The workshop's zone, for the correction dialog's wall-clock fields. */
  timeZone: string
}

export async function getJobClock(serviceRecordId: string) {
  return withAuth(
    async (ctx): Promise<JobClock> => {
      const [rows, viewerTechnicianIds, canEdit, timeZone] = await Promise.all([
        listJobEntries(ctx.organizationId, serviceRecordId),
        technicianIdsForUser(ctx.organizationId, ctx.userId),
        canEditTimeEntries(ctx),
        workshopTimeZone(ctx.organizationId),
      ])
      return { entries: await toSheetEntries(rows), viewerTechnicianIds, canEdit, timeZone }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}
