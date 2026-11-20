'use server'

import { getTranslations } from 'next-intl/server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireFeature } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import {
  createEquipmentTypeSchema,
  reorderEquipmentTypesSchema,
  updateEquipmentTypeSchema,
} from '../Schema/equipmentSchema'

const SETTINGS_UPDATE = [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }]

const folded = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

/** "Crane" and "crane " are one type twice; the database's own check would let both in. */
async function refuseDuplicateName(organizationId: string, name: string, exceptId?: string) {
  const others = await db.equipmentType.findMany({
    where: { organizationId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  })
  if (!others.some((other) => folded(other.name) === folded(name))) return
  throw new Error((await getTranslations('equipment.types'))('duplicateName'))
}

function isDuplicate(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && (error as { code?: string }).code === 'P2002'
  )
}

function refresh() {
  revalidatePath('/settings/custom-fields')
}

/** Every type the workshop has defined, shown or hidden, with how many items each has. */
export async function getEquipmentTypes() {
  return withAuth(
    async ({ organizationId }) =>
      db.equipmentType.findMany({
        where: { organizationId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, isActive: true, _count: { select: { items: true } } },
      }),
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}

export async function createEquipmentType(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customFields')
      const data = createEquipmentTypeSchema.parse(input)
      await refuseDuplicateName(organizationId, data.name)
      const last = await db.equipmentType.aggregate({
        where: { organizationId },
        _max: { sortOrder: true },
      })
      try {
        const type = await db.equipmentType.create({
          data: { name: data.name, sortOrder: (last._max.sortOrder ?? -1) + 1, organizationId },
          select: { id: true, name: true },
        })
        refresh()
        return type
      } catch (error) {
        if (isDuplicate(error)) {
          throw new Error((await getTranslations('equipment.types'))('duplicateName'))
        }
        throw error
      }
    },
    {
      requiredPermissions: SETTINGS_UPDATE,
      audit: ({ result }) => ({
        action: 'equipmentType.create',
        entity: 'EquipmentType',
        entityId: result.id,
        details: { key: 'equipmentType_create', params: { name: result.name } },
        metadata: { equipmentTypeId: result.id, name: result.name },
      }),
    }
  )
}

/** Renames a type, or hides it from new items and pickers (its items stay and still show). */
export async function updateEquipmentType(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customFields')
      const { id, ...data } = updateEquipmentTypeSchema.parse(input)
      if (data.name !== undefined) await refuseDuplicateName(organizationId, data.name, id)
      try {
        const result = await db.equipmentType.updateMany({ where: { id, organizationId }, data })
        if (result.count === 0) throw new Error('Equipment type not found')
      } catch (error) {
        if (isDuplicate(error)) {
          throw new Error((await getTranslations('equipment.types'))('duplicateName'))
        }
        throw error
      }
      const type = await db.equipmentType.findFirstOrThrow({
        where: { id, organizationId },
        select: { id: true, name: true, isActive: true },
      })
      refresh()
      return type
    },
    {
      requiredPermissions: SETTINGS_UPDATE,
      audit: ({ result }) => ({
        action: 'equipmentType.update',
        entity: 'EquipmentType',
        entityId: result.id,
        details: { key: 'equipmentType_update', params: { name: result.name } },
        metadata: { equipmentTypeId: result.id, isActive: result.isActive },
      }),
    }
  )
}

/** Puts the types in the order given, which is the order every list and document uses. */
export async function reorderEquipmentTypes(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customFields')
      const { ids } = reorderEquipmentTypesSchema.parse(input)
      const known = await db.equipmentType.findMany({
        where: { organizationId },
        select: { id: true },
      })
      const knownIds = new Set(known.map((t) => t.id))
      if (ids.length !== knownIds.size || new Set(ids).size !== ids.length) {
        throw new Error('The list of types does not match')
      }
      if (ids.some((id) => !knownIds.has(id))) throw new Error('The list of types does not match')
      await db.$transaction(
        ids.map((id, sortOrder) =>
          db.equipmentType.updateMany({ where: { id, organizationId }, data: { sortOrder } })
        )
      )
      refresh()
      return { count: ids.length }
    },
    {
      requiredPermissions: SETTINGS_UPDATE,
      audit: () => ({
        action: 'equipmentType.reorder',
        entity: 'EquipmentType',
        entityId: 'list',
        details: { key: 'equipmentType_reorder', params: {} },
      }),
    }
  )
}

/**
 * Deletes a type nothing uses. A type with items, even removed ones still in
 * a vehicle's history, can only be hidden: deleting it would take them along.
 */
export async function deleteEquipmentType(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customFields')
      const type = await db.equipmentType.findFirst({
        where: { id, organizationId },
        select: { id: true, name: true, _count: { select: { items: true } } },
      })
      if (!type) throw new Error('Equipment type not found')
      if (type._count.items > 0) {
        throw new Error((await getTranslations('equipment.types'))('hasItems'))
      }
      await db.equipmentType.deleteMany({ where: { id, organizationId } })
      refresh()
      return { id: type.id, name: type.name }
    },
    {
      requiredPermissions: SETTINGS_UPDATE,
      audit: ({ result }) => ({
        action: 'equipmentType.delete',
        entity: 'EquipmentType',
        entityId: result.id,
        details: { key: 'equipmentType_delete', params: { name: result.name } },
        metadata: { equipmentTypeId: result.id },
      }),
    }
  )
}
