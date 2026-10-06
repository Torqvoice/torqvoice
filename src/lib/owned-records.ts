import 'server-only'

import { db, type TxClient } from '@/lib/db'

/**
 * A record may only point at customers and vehicles of its own workshop.
 *
 * Every write that stores a customerId or vehicleId it was handed goes
 * through here first. The row being written is always loaded org-scoped;
 * these make sure the ids written into it are too, so a quote or a tire set
 * can never be made to show another workshop's customer. An empty value is
 * a clearing and passes; a wrong id fails the same way a wrong row id does.
 */
type Reader = Pick<TxClient, 'customer' | 'vehicle'>

export async function assertOwnedCustomer(
  customerId: string | null | undefined,
  organizationId: string,
  client: Reader = db
): Promise<void> {
  if (!customerId) return
  const customer = await client.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true },
  })
  if (!customer) throw new Error('Customer not found')
}

export async function assertOwnedVehicle(
  vehicleId: string | null | undefined,
  organizationId: string,
  client: Reader = db
): Promise<void> {
  if (!vehicleId) return
  const vehicle = await client.vehicle.findFirst({
    where: { id: vehicleId, organizationId },
    select: { id: true },
  })
  if (!vehicle) throw new Error('Vehicle not found')
}
