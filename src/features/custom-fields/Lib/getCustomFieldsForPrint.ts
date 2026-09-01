import { db } from '@/lib/db'

export interface PrintCustomField {
  fieldId: string
  label: string
  value: string
  fieldType: string
}

/**
 * Custom fields for a printed/shared document, definitions-first so a field
 * with a default value prints even when no value row was ever saved.
 * A stored '' row means the user cleared the value, so it stays empty.
 */
export async function getCustomFieldsForPrint(
  organizationId: string,
  entityId: string,
  entityType: 'service_record' | 'quote'
): Promise<PrintCustomField[]> {
  const definitions = await db.customFieldDefinition.findMany({
    where: { organizationId, entityType, isActive: true },
    select: { id: true, label: true, fieldType: true, defaultValue: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  if (definitions.length === 0) return []

  const rows = await db.customFieldValue.findMany({
    where: { entityId, entityType, fieldId: { in: definitions.map((d) => d.id) } },
    select: { fieldId: true, value: true },
  })
  const valueByField = new Map(rows.map((r) => [r.fieldId, r.value]))

  return definitions
    .map((d) => ({
      fieldId: d.id,
      label: d.label,
      fieldType: d.fieldType,
      value: valueByField.has(d.id)
        ? (valueByField.get(d.id) as string)
        : (d.defaultValue ?? ''),
    }))
    .filter((cf) => cf.value !== '')
}
