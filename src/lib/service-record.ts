/**
 * Helpers for service records now that a record's vehicle is optional
 * (parts-only / counter sales). One convention everywhere:
 * - the record's customer is the direct customer when set, else the
 *   vehicle's customer
 * - records without a vehicle live under /sales/<id> instead of the
 *   vehicle-scoped route
 */

export function recordCustomer<C>(record: {
  customer?: C | null;
  vehicle?: { customer?: C | null } | null;
}): C | null {
  return record.customer ?? record.vehicle?.customer ?? null;
}

export function serviceRecordHref(record: {
  id: string;
  vehicleId?: string | null;
  vehicle?: { id: string } | null;
}): string {
  const vehicleId = record.vehicleId ?? record.vehicle?.id ?? null;
  return vehicleId ? `/vehicles/${vehicleId}/service/${record.id}` : `/sales/${record.id}`;
}
