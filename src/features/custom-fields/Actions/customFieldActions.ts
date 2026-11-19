'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { z } from 'zod'
import {
  createFieldDefinitionSchema,
  updateFieldDefinitionSchema,
} from '../Schema/customFieldSchema'
import { revalidatePath } from 'next/cache'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { requireFeature } from '@/lib/features'
import { clearedToNull } from '@/lib/clearable'
import {
  assertOwnRecord,
  assertRecordEditable,
  isEntityType,
  recordSubject,
} from '../Lib/customFieldRecords.server'
import {
  customFieldTypeIssue,
  isMissingRequiredValue,
  type CustomFieldIssue,
} from '../Lib/customFieldValueRules'

/**
 * Whose permission a record's custom fields fall under: the record's own.
 *
 * Every one of these used to need the Settings permission, because defining a
 * field is a setting. But filling one in is not: it is part of the work order
 * or the quote, the same as its title. A Member who may edit a work order saw
 * none of the workshop's custom fields on it and could not have saved one,
 * and was refused on every page load besides. Defining fields stays behind
 * Settings; reading and filling them follows the record. An unknown kind of
 * record needs Settings.
 */
function recordPermission(entityType: unknown, action: PermissionAction) {
  return [{ action, subject: recordSubject(entityType) }]
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

const saveValuesSchema = z.object({
  entityId: z.string().min(1),
  values: z.record(z.string(), z.string()),
})

/**
 * One refused field: which, what the workshop calls it, and what is wrong.
 * The label comes from the server so a form that has never heard of the
 * field (it was added while the form was open) can still name it.
 */
export interface CustomFieldError {
  fieldId: string
  label: string
  issue: CustomFieldIssue
}

/** What a save of a record's values comes back with. */
export type SaveCustomFieldValuesResult =
  | { saved: true }
  /** Nothing was written. The refused fields, in the order the form shows them. */
  | { saved: false; fieldErrors: CustomFieldError[] }

/**
 * Saves a record's custom field values, checked against the fields'
 * definitions. All of them are written or none is.
 *
 * This replaces the action that wrote whatever it was sent, under a new
 * name on purpose: a tab opened before the change still calls the old one,
 * finds nothing there and is asked to reload, instead of saving values
 * nobody checked.
 *
 * - A locked work order or quote refuses the save, as it refuses every other
 *   edit to what it prints.
 * - A required field refuses an empty value. One the request leaves out is
 *   judged by what the record shows for it (the stored value, else the
 *   field's default), so leaving a field out is no way around the rule, and
 *   a form opened before the field became required is told about it. Only
 *   here: nothing else that writes to the record (its status, a payment, a
 *   line added from a phone) looks at custom fields, so a record made before
 *   a field became required keeps working and is asked for the value when
 *   its form is next saved, which is what the form has always done.
 * - A value has to suit its type, unless it is the value already stored for
 *   that field. That one is left alone and not written again: a choice whose
 *   option was since removed, or a date an import wrote in another shape,
 *   must not stop the rest of the record from being saved.
 * - A field that is unknown or switched off is skipped, as before. It may
 *   have been switched off while the form was open.
 */
export async function saveValidatedCustomFieldValues(
  entityId: string,
  entityType: string,
  values: Record<string, string>
) {
  return withAuth(
    async ({ organizationId }): Promise<SaveCustomFieldValuesResult> => {
      if (!isEntityType(entityType)) throw new Error('Unknown record type')
      const input = saveValuesSchema.parse({ entityId, values })
      await assertOwnRecord(input.entityId, entityType, organizationId)
      await assertRecordEditable(input.entityId, entityType, organizationId)

      const definitions = await db.customFieldDefinition.findMany({
        where: { organizationId, entityType, isActive: true },
        // The order the form draws them in, so the first error is the first field.
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      })
      const stored = await db.customFieldValue.findMany({
        where: {
          entityId: input.entityId,
          entityType,
          fieldId: { in: definitions.map((d) => d.id) },
        },
        select: { fieldId: true, value: true },
      })
      const storedValue = new Map(stored.map((row) => [row.fieldId, row.value]))

      const fieldErrors: CustomFieldError[] = []
      const refuse = (definition: { id: string; label: string }, issue: CustomFieldIssue) =>
        fieldErrors.push({ fieldId: definition.id, label: definition.label, issue })
      const changed: { fieldId: string; value: string }[] = []
      for (const definition of definitions) {
        // Only own keys: the object came through JSON and zod, so it has no
        // inherited ones a field id could collide with.
        const value: string | undefined = input.values[definition.id]
        if (value === undefined) {
          // Not sent, so nothing is written. What the record shows for it
          // still has to satisfy "required".
          const shown = storedValue.get(definition.id) ?? definition.defaultValue ?? ''
          if (isMissingRequiredValue(definition, shown)) refuse(definition, 'required')
          continue
        }

        if (isMissingRequiredValue(definition, value)) {
          refuse(definition, 'required')
          continue
        }
        if (storedValue.get(definition.id) === value) continue

        const issue = customFieldTypeIssue(definition, value)
        if (issue) refuse(definition, issue)
        else changed.push({ fieldId: definition.id, value })
      }

      if (fieldErrors.length > 0) return { saved: false, fieldErrors }

      if (changed.length > 0) {
        await db.$transaction(
          changed.map(({ fieldId, value }) =>
            db.customFieldValue.upsert({
              where: { fieldId_entityId: { fieldId, entityId: input.entityId } },
              create: { fieldId, entityId: input.entityId, entityType, value },
              update: { value },
            })
          )
        )
      }
      return { saved: true }
    },
    { requiredPermissions: recordPermission(entityType, PermissionAction.UPDATE) }
  )
}
