import 'server-only'

import type { db } from '@/lib/db'
import { equipmentEnabled } from './equipmentGate.server'

type Tx = {
  quoteEquipment: { findMany: typeof db.quoteEquipment.findMany }
  serviceRecordEquipment: { createMany: typeof db.serviceRecordEquipment.createMany }
}

/**
 * The equipment a quote is for goes with the work it becomes: onto a new job,
 * or added to an existing one beside what it already works on. These are new
 * picks for the job, so they are checked as `checkedWorkOnItems` checks one:
 * only items on the job's vehicle now and not taken off. A quote keeps an
 * item that moved since, but the job does not take it on. Nothing while
 * equipment is off.
 */
export async function copyQuoteEquipmentToJob(
  tx: Tx,
  input: { organizationId: string; quoteId: string; jobId: string; vehicleId: string | null }
): Promise<void> {
  if (!input.vehicleId) return
  if (!(await equipmentEnabled(input.organizationId))) return
  const picked = await tx.quoteEquipment.findMany({
    where: {
      organizationId: input.organizationId,
      quoteId: input.quoteId,
      item: { vehicleId: input.vehicleId, removedAt: null },
    },
    orderBy: { createdAt: 'asc' },
    select: { itemId: true },
  })
  if (picked.length === 0) return
  await tx.serviceRecordEquipment.createMany({
    data: picked.map((row) => ({
      serviceRecordId: input.jobId,
      itemId: row.itemId,
      organizationId: input.organizationId,
    })),
    skipDuplicates: true,
  })
}
