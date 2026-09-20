'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import {
  createFieldDefinitionSchema,
  entityTypes,
  type EntityType,
  updateFieldDefinitionSchema,
} from '../Schema/customFieldSchema'
import { revalidatePath } from 'next/cache'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { requireFeature } from '@/lib/features'
import { clearedToNull } from '@/lib/clearable'

/**
 * Whose permission a record's custom fields fall under: the record's own.
 *
 * Every one of these used to need the Settings permission, because defining a
 * field is a setting. But filling one in is not: it is part of the work order
 * or the quote, the same as its title. A Member who may edit a work order saw
 * none of the workshop's custom fields on it and could not have saved one,
 * and was refused on every page load besides. Defining fields stays behind
 * Settings; reading and filling them follows the record.
 */
const RECORD_SUBJECT: Record<EntityType, PermissionSubject> = {
  service_record: PermissionSubject.SERVICES,
  quote: PermissionSubject.QUOTES,
}

function isEntityType(value: unknown): value is EntityType {
  return typeof value === 'string' && (entityTypes as readonly string[]).includes(value)
}

/** The permission a call about one record's fields needs. An unknown kind needs Settings. */
function recordPermission(entityType: unknown, action: PermissionAction) {
  return [
    {
      action,
      subject: isEntityType(entityType) ? RECORD_SUBJECT[entityType] : PermissionSubject.SETTINGS,
    },
  ]
}

/**
 * The record has to be this workshop's. These actions are handed a bare id,
 * and a value row is keyed by it, so without this a caller could attach
 * values to a record that is not theirs.
 */
async function assertOwnRecord(entityId: string, entityType: EntityType, organizationId: string) {
  const found =
    entityType === 'quote'
      ? await db.quote.count({ where: { id: entityId, organizationId } })
      : await db.serviceRecord.count({ where: { id: entityId, organizationId } })
  if (found === 0) throw new Error('Record not found')
}

export async function getFieldDefinitions(entityType?: string) {
  return withAuth(
    async ({ organizationId }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { organizationId }
      if (entityType) where.entityType = entityType

      return db.customFieldDefinition.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      })
    },
    {
      // The fields of one kind of record are read to draw that record's form.
      // The whole list, across kinds, is the settings screen.
      requiredPermissions: entityType
        ? recordPermission(entityType, PermissionAction.READ)
        : [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}

export async function createFieldDefinition(input: unknown) {
  return withAuth(
    async ({ userId, organizationId }) => {
      await requireFeature(organizationId, 'customFields')

      const data = createFieldDefinitionSchema.parse(input)

      const existing = await db.customFieldDefinition.findFirst({
        where: { organizationId, name: data.name, entityType: data.entityType },
      })
      if (existing) throw new Error('A field with this name already exists for this entity type')

      const field = await db.customFieldDefinition.create({
        data: {
          ...data,
          options: clearedToNull(data.options),
          defaultValue: clearedToNull(data.defaultValue),
          userId,
          organizationId,
        },
      })

      revalidatePath('/settings/custom-fields')
      return field
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'customField.create',
        entity: 'CustomFieldDefinition',
        entityId: result.id,
        details: { key: 'customField_create', params: { name: result.name } },
        metadata: { fieldId: result.id, fieldName: result.name, entityType: result.entityType },
      }),
    }
  )
}

export async function updateFieldDefinition(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customFields')
      const data = updateFieldDefinitionSchema.parse(input)
      const { id, ...rest } = data

      const existing = await db.customFieldDefinition.findFirst({
        where: { id, organizationId },
      })
      if (!existing) throw new Error('Field not found')

      const field = await db.customFieldDefinition.update({
        where: { id },
        data: {
          ...rest,
          options: clearedToNull(rest.options),
          defaultValue: clearedToNull(rest.defaultValue),
        },
      })

      revalidatePath('/settings/custom-fields')
      return field
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'customField.update',
        entity: 'CustomFieldDefinition',
        entityId: result.id,
        details: { key: 'customField_update', params: { name: result.name } },
        metadata: { fieldId: result.id, fieldName: result.name },
      }),
    }
  )
}

export async function deleteFieldDefinition(fieldId: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customFields')
      const field = await db.customFieldDefinition.findFirst({
        where: { id: fieldId, organizationId },
      })
      if (!field) throw new Error('Field not found')

      await db.$transaction([
        db.customFieldValue.deleteMany({ where: { fieldId } }),
        db.customFieldDefinition.delete({ where: { id: fieldId } }),
      ])

      revalidatePath('/settings/custom-fields')
      return { fieldId, fieldName: field.name }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'customField.delete',
        entity: 'CustomFieldDefinition',
        entityId: result.fieldId,
        details: { key: 'customField_delete', params: { name: result.fieldName } },
        metadata: { fieldId: result.fieldId, fieldName: result.fieldName },
      }),
    }
  )
}

export async function getCustomFieldValues(entityId: string, entityType: string) {
  return withAuth(
    async ({ organizationId }) => {
      if (!isEntityType(entityType)) throw new Error('Unknown record type')
      await assertOwnRecord(entityId, entityType, organizationId)
      const definitions = await db.customFieldDefinition.findMany({
        where: { organizationId, entityType, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      })

      const values = await db.customFieldValue.findMany({
        where: {
          entityId,
          entityType,
          fieldId: { in: definitions.map((d) => d.id) },
        },
      })

      const valuesMap: Record<string, string> = {}
      for (const v of values) {
        valuesMap[v.fieldId] = v.value
      }

      // No stored row -> definition default; a stored '' means the user cleared it.
      return definitions.map((def) => ({
        ...def,
        value: valuesMap[def.id] !== undefined ? valuesMap[def.id] : (def.defaultValue ?? ''),
      }))
    },
    { requiredPermissions: recordPermission(entityType, PermissionAction.READ) }
  )
}

export async function saveCustomFieldValues(
  entityId: string,
  entityType: string,
  values: Record<string, string>
) {
  return withAuth(
    async ({ organizationId }) => {
      if (!isEntityType(entityType)) throw new Error('Unknown record type')
      await assertOwnRecord(entityId, entityType, organizationId)
      const definitions = await db.customFieldDefinition.findMany({
        where: { organizationId, entityType, isActive: true },
      })

      const validFieldIds = new Set(definitions.map((d) => d.id))

      const ops = Object.entries(values)
        .filter(([fieldId]) => validFieldIds.has(fieldId))
        .map(([fieldId, value]) =>
          db.customFieldValue.upsert({
            where: {
              fieldId_entityId: { fieldId, entityId },
            },
            create: { fieldId, entityId, entityType, value },
            update: { value },
          })
        )

      await db.$transaction(ops)
      return { saved: true }
    },
    { requiredPermissions: recordPermission(entityType, PermissionAction.UPDATE) }
  )
}
