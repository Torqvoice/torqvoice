import 'server-only'

import { db } from '@/lib/db'
import { WENT_OUT_WHERE } from './issuedInvoice'
import { vehicleWithInvoicesRefusal } from './cancelInvoice'

/**
 * Refuses deleting vehicles that carry an invoice that went out. A vehicle's
 * jobs go with it by cascade, and an invoice the customer holds keeps its
 * number: the vehicle is archived instead. A cancelled invoice went out too,
 * and is kept for the same reason.
 */
export async function assertNoInvoicesWentOut(
  organizationId: string,
  vehicleIds: string[]
): Promise<void> {
  if (vehicleIds.length === 0) return
  const rows = await db.serviceRecord.findMany({
    where: { organizationId, vehicleId: { in: vehicleIds }, AND: [WENT_OUT_WHERE] },
    select: { invoiceNumber: true },
    orderBy: { invoiceNumber: 'asc' },
    take: 50,
  })
  if (rows?.length) throw new Error(vehicleWithInvoicesRefusal(rows.map((r) => r.invoiceNumber)))
}
