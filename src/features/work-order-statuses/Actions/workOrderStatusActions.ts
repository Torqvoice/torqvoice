'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { isStage, type WorkOrderStatusOption } from '../Lib/stages'
import {
  reorderWorkOrderStatusesSchema,
  updateWorkOrderStatusSchema,
  workOrderStatusSchema,
} from '../Schema/workOrderStatusSchema'

/** A workshop needs a handful. The cap only stops a runaway script. */
const MAX_PER_STAGE = 12

const SELECT = {
  id: true,
  name: true,
  stage: true,
  color: true,
  notifyCustomer: true,
  messageTemplate: true,
  sortOrder: true,
} as const

const MANAGE = [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }]

function revalidate() {
  revalidatePath('/settings/work-order-statuses')
  revalidatePath('/work-orders')
}

/**
 * The workshop's statuses, for the menus on a work order. Read with the
 * permission to read work orders, not settings: a technician choosing "Ready
 * for pickup" must be able to see that it exists, and the settings table
 * holds secrets a Member is never given.
 */
export async function listWorkOrderStatuses() {
  return withAuth(
    async ({ organizationId }): Promise<WorkOrderStatusOption[]> => {
      const rows = await db.workOrderStatus.findMany({
        where: { organizationId, archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: SELECT,
      })
      // A stage the app no longer has would be a status nobody can reach.
      return rows
        .filter((row) => isStage(row.stage))
        .map((row) => ({ ...row, stage: row.stage as WorkOrderStatusOption['stage'] }))
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}

export async function createWorkOrderStatus(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = workOrderStatusSchema.parse(input)
      const inStage = await db.workOrderStatus.count({
        where: { organizationId, stage: data.stage, archivedAt: null },
      })
      if (inStage >= MAX_PER_STAGE)
        throw new Error('That stage has as many statuses as it can take')

      const created = await db.workOrderStatus.create({
        data: {
          organizationId,
          name: data.name,
          stage: data.stage,
          color: data.color,
          notifyCustomer: data.notifyCustomer,
          messageTemplate: data.messageTemplate || null,
          // Last in its stage.
          sortOrder: inStage,
        },
        select: SELECT,
      })
      revalidate()
      return created
    },
    {
      requiredPermissions: MANAGE,
      audit: ({ result }) => ({
        action: 'settings.workOrderStatus.create',
        entity: 'WorkOrderStatus',
        entityId: result.id,
        message: `Added the work order status "${result.name}"`,
        metadata: { stage: result.stage },
      }),
    }
  )
}

export async function updateWorkOrderStatus(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = updateWorkOrderStatusSchema.parse(input)
      const existing = await db.workOrderStatus.findFirst({
        where: { id: data.id, organizationId, archivedAt: null },
        select: { id: true, stage: true },
      })
      if (!existing) throw new Error('Status not found')

      const updated = await db.$transaction(async (tx) => {
        // Moved to another stage: the jobs that carry it are at the old
        // stage, where it no longer belongs, so they let go of it. Their
        // stage, which is what the app reads, does not move.
        if (existing.stage !== data.stage) {
          await tx.serviceRecord.updateMany({
            where: { organizationId, customStatusId: existing.id },
            data: { customStatusId: null, customStatusSince: null },
          })
        }
        return tx.workOrderStatus.update({
          where: { id: existing.id },
          data: {
            name: data.name,
            stage: data.stage,
            color: data.color,
            notifyCustomer: data.notifyCustomer,
            messageTemplate: data.messageTemplate || null,
          },
          select: SELECT,
        })
      })
      revalidate()
      return updated
    },
    {
      requiredPermissions: MANAGE,
      audit: ({ result }) => ({
        action: 'settings.workOrderStatus.update',
        entity: 'WorkOrderStatus',
        entityId: result.id,
        message: `Changed the work order status "${result.name}"`,
        metadata: { stage: result.stage },
      }),
    }
  )
}

/**
 * Takes a status out of the menus. Archived rather than deleted: a job that
 * carries it keeps saying what it was, and the history of a finished job
 * should not change because the workshop tidied its settings.
 */
export async function archiveWorkOrderStatus(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const existing = await db.workOrderStatus.findFirst({
        where: { id, organizationId, archivedAt: null },
        select: { id: true, name: true },
      })
      if (!existing) throw new Error('Status not found')
      await db.workOrderStatus.update({
        where: { id: existing.id },
        data: { archivedAt: new Date() },
      })
      revalidate()
      return existing
    },
    {
      requiredPermissions: MANAGE,
      audit: ({ result }) => ({
        action: 'settings.workOrderStatus.archive',
        entity: 'WorkOrderStatus',
        entityId: result.id,
        message: `Removed the work order status "${result.name}"`,
      }),
    }
  )
}

export async function reorderWorkOrderStatuses(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = reorderWorkOrderStatusesSchema.parse(input)
      const rows = await db.workOrderStatus.findMany({
        where: { organizationId, stage: data.stage, archivedAt: null },
        select: { id: true },
      })
      const known = new Set(rows.map((row) => row.id))
      const ordered = data.ids.filter((id) => known.has(id))
      await db.$transaction(
        ordered.map((id, index) =>
          db.workOrderStatus.update({ where: { id }, data: { sortOrder: index } })
        )
      )
      revalidate()
      return { stage: data.stage, count: ordered.length }
    },
    { requiredPermissions: MANAGE }
  )
}
