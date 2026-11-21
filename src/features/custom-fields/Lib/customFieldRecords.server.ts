import 'server-only'

import { db } from '@/lib/db'
import { DocumentLockedError } from '@/lib/document-lock'
import { assertInvoiceEditable, assertQuoteEditable } from '@/lib/document-lock.server'
import { PermissionSubject } from '@/lib/permissions'
import { getFeatures } from '@/lib/features'
import { entityTypes, isRecordEntityType, type EntityType } from '../Schema/customFieldSchema'

/**
 * What the custom field actions need to know about each kind of record that
 * can carry custom fields. A new kind is one more entry here.
 */
interface CustomFieldRecordKind {
  /**
   * Whose permission the record's values fall under: the record's own.
   * Defining a field is a setting; filling one in is part of the record.
   */
  subject: PermissionSubject
  /** Whether the workshop has a record of this kind with this id. */
  exists: (entityId: string, organizationId: string) => Promise<boolean>
  /**
   * Throws when the record may not be edited right now, with the same error
   * every other edit to it gets. A kind that is never locked does nothing.
   */
  assertEditable: (entityId: string, organizationId: string) => Promise<void>
}

/** A vehicle or a customer is never locked. */
const neverLocked = async () => {
  // Nothing to refuse.
}

const RECORD_KINDS: Record<EntityType, CustomFieldRecordKind> = {
  service_record: {
    subject: PermissionSubject.SERVICES,
    exists: async (id, organizationId) =>
      (await db.serviceRecord.count({ where: { id, organizationId } })) > 0,
    assertEditable: assertInvoiceEditable,
  },
  quote: {
    subject: PermissionSubject.QUOTES,
    exists: async (id, organizationId) =>
      (await db.quote.count({ where: { id, organizationId } })) > 0,
    assertEditable: assertQuoteEditable,
  },
  vehicle: {
    subject: PermissionSubject.VEHICLES,
    exists: async (id, organizationId) =>
      (await db.vehicle.count({ where: { id, organizationId } })) > 0,
    assertEditable: neverLocked,
  },
  customer: {
    subject: PermissionSubject.CUSTOMERS,
    exists: async (id, organizationId) =>
      (await db.customer.count({ where: { id, organizationId } })) > 0,
    assertEditable: neverLocked,
  },
}

/**
 * Whether this workshop is shown the fields of this kind at all. The fields
 * of a work order or a quote always are, as they always were. A vehicle's
 * and a customer's are part of the plan's custom fields: after a downgrade
 * they are hidden and kept.
 */
export async function kindOffered(
  entityType: EntityType,
  organizationId: string
): Promise<boolean> {
  if (!isRecordEntityType(entityType)) return true
  return (await getFeatures(organizationId)).customFields
}

export function isEntityType(value: unknown): value is EntityType {
  return typeof value === 'string' && (entityTypes as readonly string[]).includes(value)
}

/** The permission subject for one kind of record. An unknown kind needs Settings. */
export function recordSubject(entityType: unknown): PermissionSubject {
  return isEntityType(entityType) ? RECORD_KINDS[entityType].subject : PermissionSubject.SETTINGS
}

/**
 * The record has to be this workshop's. The actions are handed a bare id, and
 * a value row is keyed by it, so without this a caller could attach values to
 * a record that is not theirs.
 */
export async function assertOwnRecord(
  entityId: string,
  entityType: EntityType,
  organizationId: string
) {
  if (!(await RECORD_KINDS[entityType].exists(entityId, organizationId))) {
    throw new Error('Record not found')
  }
}

/**
 * The refusal a locked work order or quote gives, or null when the record
 * may be edited. Its custom fields are on the document the customer holds,
 * so a change to one is refused with this same error, the one every other
 * edit to the document gets. It is handed back rather than thrown because a
 * save that changes nothing is not an edit, and must not fail on the lock.
 */
export async function recordLockError(
  entityId: string,
  entityType: EntityType,
  organizationId: string
): Promise<DocumentLockedError | null> {
  try {
    await RECORD_KINDS[entityType].assertEditable(entityId, organizationId)
    return null
  } catch (error) {
    if (error instanceof DocumentLockedError) return error
    throw error
  }
}
