import { SHOP_FEE_PRICING } from '@/features/settings/Lib/shopFee'
import type { Prisma } from '@/generated/prisma/client'

/** How long after it was made a draft still counts as the one just asked for. */
const JUST_MADE_MS = 5000

/**
 * The draft the "New work order" page made a moment ago for this vehicle,
 * when nobody has put anything on it yet.
 *
 * That page makes the job as it loads, so a second render of it would make a
 * second job with the next number. It looks for this first and goes to it
 * instead.
 *
 * "Nothing on it" leaves the shop fee out. A workshop that charges one gets
 * the fee as a labor line on every new job (createDraftRecord), so a test for
 * no labor lines at all never matched there and the second job was made.
 */
export function untouchedDraftWhere({
  vehicleId,
  organizationId,
  now,
}: {
  vehicleId: string
  organizationId: string
  now: Date
}): Prisma.ServiceRecordWhereInput {
  return {
    vehicleId,
    vehicle: { organizationId },
    status: 'pending',
    createdAt: { gte: new Date(now.getTime() - JUST_MADE_MS) },
    partItems: { none: {} },
    laborItems: { none: { pricingType: { not: SHOP_FEE_PRICING } } },
  }
}
