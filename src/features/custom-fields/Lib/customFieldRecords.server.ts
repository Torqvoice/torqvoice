import 'server-only'

import { db } from '@/lib/db'
import { assertInvoiceEditable, assertQuoteEditable } from '@/lib/document-lock.server'
import { PermissionSubject } from '@/lib/permissions'
import { entityTypes, type EntityType } from '../Schema/customFieldSchema'

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
 * A locked work order or quote refuses its custom fields like the rest of
 * what it prints: they are on the document the customer holds.
 */
export async function assertRecordEditable(
  entityId: string,
  entityType: EntityType,
  organizationId: string
) {
  await RECORD_KINDS[entityType].assertEditable(entityId, organizationId)
}
