import 'server-only'

import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import type { RecordEntityType } from '../Schema/customFieldSchema'
import { kindOffered } from './customFieldRecords.server'
import { type CustomFieldError, judgeCustomFieldValues } from './customFieldValueRules'

/**
 * A vehicle's or a customer's save stopped by the workshop's own fields.
 * Thrown before anything is written, or inside the transaction that writes
 * the record, so the record is not created or changed either. `withAuth`
 * hands the fields to the page, which marks each one on the form.
 */
export class CustomFieldsRefusedError extends Error {
  readonly fieldErrors: CustomFieldError[]

  constructor(message: string, fieldErrors: CustomFieldError[]) {
    super(message)
    this.name = 'CustomFieldsRefusedError'
    this.fieldErrors = fieldErrors
  }
}

/** Either the database client or a transaction on it. */
interface ValueWriter {
  customFieldValue: {
    upsert: (args: {
      where: { fieldId_entityId: { fieldId: string; entityId: string } }
      create: { fieldId: string; entityId: string; entityType: string; value: string }
      update: { value: string }
    }) => PromiseLike<unknown>
  }
}

/** Writes the checked values under the record, in the caller's transaction. */
export type RecordCustomFieldsWrite = (store: ValueWriter, entityId: string) => Promise<void>

/**
 * Checks the custom field values a vehicle's or a customer's form sent with
 * its save, and hands back the write that goes in the same transaction as
 * the record.
 *
 * Null when there is nothing to do: the form sent no values (a tab opened
 * before forms sent them, or a quick create from another form, which makes
 * the record without them; its full form asks for them on its next save), or
 * the workshop's plan has no custom fields. Throws `CustomFieldsRefusedError`
 * when a required field is empty or a value does not suit its field, naming
 * the fields with the sentence the form shows.
 *
 * A vehicle or customer is never locked, so unlike a work order there is no
 * lock to ask about.
 */
export async function prepareRecordCustomFields(
  organizationId: string,
  entityType: RecordEntityType,
  entityId: string | null,
  values: Record<string, string> | undefined
): Promise<RecordCustomFieldsWrite | null> {
  if (values === undefined) return null
  if (!(await kindOffered(entityType, organizationId))) return null

  const definitions = await db.customFieldDefinition.findMany({
    where: { organizationId, entityType, isActive: true },
    // The order the form draws them in, so the first error is the first field.
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  if (definitions.length === 0) return null
  const stored = entityId
    ? await db.customFieldValue.findMany({
        where: { entityId, entityType, fieldId: { in: definitions.map((d) => d.id) } },
        select: { fieldId: true, value: true },
      })
    : []
  const storedValue = new Map(stored.map((row) => [row.fieldId, row.value]))

  const { fieldErrors, changed } = judgeCustomFieldValues(definitions, storedValue, values)
  if (fieldErrors.length > 0) {
    const t = await getTranslations('settings.customFields')
    const fields = fieldErrors.map((error) => error.label).join(', ')
    const message = fieldErrors.every((error) => error.issue === 'required')
      ? t('notSavedMissing', { fields })
      : t('notSavedInvalid', { fields })
    throw new CustomFieldsRefusedError(message, fieldErrors)
  }

  return async (store, savedId) => {
    for (const { fieldId, value } of changed) {
      await store.customFieldValue.upsert({
        where: { fieldId_entityId: { fieldId, entityId: savedId } },
        create: { fieldId, entityId: savedId, entityType, value },
        update: { value },
      })
    }
  }
}
