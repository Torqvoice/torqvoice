import { db } from '@/lib/db'
import type { EntityType } from '../Schema/customFieldSchema'

/**
 * Custom field values are keyed by the id of the record they belong to, with
 * no foreign key to it: one table serves every kind of record. So nothing in
 * the database removes them when the record goes, and every path that deletes
 * a record has to say so here, in the same transaction where it has one.
 *
 * Values are not files and are not kept for a trash: once the record is gone
 * nothing can show them again.
 */

/** Either the database client or a transaction on it. */
interface ValueStore {
  customFieldValue: {
    deleteMany: (args: {
      where: {
        entityType: EntityType
        entityId: { in: string[] }
        field: { organizationId: string }
      }
    }) => PromiseLike<unknown>
  }
}

/** Under the database's limit on values bound to one query. */
const CHUNK = 5000

/**
 * Removes the values of the given records. Always by id: the caller names
 * the records it deleted, so a record made in the meantime keeps its values.
 * Scoped to the workshop's own fields, like every other query.
 */
export async function deleteCustomFieldValuesOf(
  store: ValueStore,
  organizationId: string,
  entityType: EntityType,
  entityIds: string[]
): Promise<void> {
  for (let start = 0; start < entityIds.length; start += CHUNK) {
    await store.customFieldValue.deleteMany({
      where: {
        entityType,
        entityId: { in: entityIds.slice(start, start + CHUNK) },
        field: { organizationId },
      },
    })
  }
}

/**
 * The work orders that go when these vehicles are deleted (the database
 * cascades them). Read before the delete, while they can still be found.
 */
export async function workOrderIdsOfVehicles(
  organizationId: string,
  vehicleIds: string[]
): Promise<string[]> {
  if (vehicleIds.length === 0) return []
  const records = await db.serviceRecord.findMany({
    where: { organizationId, vehicleId: { in: vehicleIds } },
    select: { id: true },
  })
  return records.map((record) => record.id)
}
