import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'

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
      value: valueByField.has(d.id) ? (valueByField.get(d.id) as string) : (d.defaultValue ?? ''),
    }))
    .filter((cf) => cf.value !== '')
}

/**
 * The custom fields of the vehicle and the customer a document is for, for a
 * design that places one of them.
 *
 * Kept apart from the document's own fields on purpose. A work order's field
 * that no block claims still prints, in the extras panel, because it always
 * has; a vehicle's or a customer's prints only where a design puts it, so no
 * sheet designed before these existed gains a line. Nothing is read, and
 * nothing comes back, for a workshop that has defined none or whose plan has
 * no custom fields.
 */
export async function getRecordCustomFieldsForPrint(
  organizationId: string,
  record: { vehicleId?: string | null; customerId?: string | null }
): Promise<PrintCustomField[]> {
  if (!record.vehicleId && !record.customerId) return []
  const definitions = await db.customFieldDefinition.findMany({
    where: { organizationId, entityType: { in: ['vehicle', 'customer'] }, isActive: true },
    select: { id: true, label: true, fieldType: true, defaultValue: true, entityType: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  if (definitions.length === 0) return []
  if (!(await getFeatures(organizationId)).customFields) return []

  // The document's customer, else its vehicle's owner: the invoice's rule.
  // A quote made for a vehicle alone still prints its owner's fields.
  let customerId = record.customerId ?? null
  if (!customerId && record.vehicleId && definitions.some((d) => d.entityType === 'customer')) {
    const vehicle = await db.vehicle.findFirst({
      where: { id: record.vehicleId, organizationId },
      select: { customerId: true },
    })
    customerId = vehicle?.customerId ?? null
  }
  const kinds = [
    ...(record.vehicleId ? [{ entityType: 'vehicle', entityId: record.vehicleId }] : []),
    ...(customerId ? [{ entityType: 'customer', entityId: customerId }] : []),
  ]
  const shown = definitions.filter((d) => kinds.some((k) => k.entityType === d.entityType))
  if (shown.length === 0) return []

  const rows = await db.customFieldValue.findMany({
    where: {
      OR: kinds,
      fieldId: { in: shown.map((d) => d.id) },
    },
    select: { fieldId: true, value: true },
  })
  const valueByField = new Map(rows.map((r) => [r.fieldId, r.value]))
  return shown
    .map((d) => ({
      fieldId: d.id,
      label: d.label,
      fieldType: d.fieldType,
      value: valueByField.has(d.id) ? (valueByField.get(d.id) as string) : (d.defaultValue ?? ''),
    }))
    .filter((cf) => cf.value !== '')
}
