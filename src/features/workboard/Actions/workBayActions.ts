'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import { notificationBus } from '@/lib/notification-bus'
import {
  createWorkBaySchema,
  deleteWorkBaySchema,
  updateWorkBaySchema,
} from '../Schema/workboardSchema'

const BAY_SELECT = {
  id: true,
  name: true,
  color: true,
  isActive: true,
  sortOrder: true,
  dailyCapacity: true,
  organizationId: true,
} as const

export async function getWorkBays() {
  return withAuth(
    async ({ organizationId }) => {
      return db.workBay.findMany({
        where: { organizationId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: BAY_SELECT,
      })
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_BOARD },
      ],
    }
  )
}

export async function createWorkBay(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = createWorkBaySchema.parse(input)

      const maxOrder = await db.workBay.aggregate({
        where: { organizationId },
        _max: { sortOrder: true },
      })

      const bay = await db.workBay.create({
        data: {
          name: data.name,
          color: data.color,
          dailyCapacity: data.dailyCapacity ?? 480,
          sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
          organizationId,
        },
        select: BAY_SELECT,
      })

      notificationBus.emit('workboard', {
        type: 'work_bay_created',
        organizationId,
        workBay: bay,
      })

      revalidatePath('/work-board')
      return bay
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.WORK_BOARD },
      ],
      audit: ({ result }) => ({
        action: 'work_bay.create',
        entity: 'WorkBay',
        entityId: result.id,
        details: { key: 'work_bay_create', params: { name: result.name } },
        metadata: { workBayId: result.id, workBayName: result.name },
      }),
    }
  )
}

export async function updateWorkBay(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const { id, ...updates } = updateWorkBaySchema.parse(input)

      const owned = await db.workBay.findFirst({
        where: { id, organizationId },
        select: { id: true },
      })
      if (!owned) throw new Error('Work bay not found')

      const bay = await db.workBay.update({
        where: { id },
        data: updates,
        select: BAY_SELECT,
      })

      notificationBus.emit('workboard', {
        type: 'work_bay_updated',
        organizationId,
        workBay: bay,
      })

      revalidatePath('/work-board')
      return bay
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.WORK_BOARD },
      ],
      audit: ({ result }) => ({
        action: 'work_bay.update',
        entity: 'WorkBay',
        entityId: result.id,
        details: { key: 'work_bay_update', params: { name: result.name } },
        metadata: { workBayId: result.id },
      }),
    }
  )
}

/**
 * Deleting a bay leaves its jobs where they are: the schema clears `workBayId`
 * (SetNull), so the work stays scheduled and simply drops into the "no bay"
 * lane rather than disappearing along with the bay.
 */
export async function deleteWorkBay(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const { id } = deleteWorkBaySchema.parse(input)

      const deleted = await db.workBay.deleteMany({ where: { id, organizationId } })
      if (deleted.count === 0) throw new Error('Work bay not found')

      notificationBus.emit('workboard', {
        type: 'work_bay_removed',
        organizationId,
        workBayId: id,
      })

      revalidatePath('/work-board')
      return { success: true, workBayId: id }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.WORK_BOARD },
      ],
      audit: ({ result }) => ({
        action: 'work_bay.delete',
        entity: 'WorkBay',
        entityId: result.workBayId,
        details: { key: 'work_bay_delete', params: { id: result.workBayId } },
        metadata: { workBayId: result.workBayId },
      }),
    }
  )
}
