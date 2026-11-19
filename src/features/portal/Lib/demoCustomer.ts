import 'server-only'

import { db } from '@/lib/db'
import { DEMO_PORTAL_CUSTOMER_EMAIL, isDemoMode } from '@/lib/demo'

/**
 * Who a demo visitor is in the customer portal.
 *
 * The demo cannot send a sign-in link (nothing leaves the box, see
 * `assertOutboundAllowed`), so the login page offers one button that signs the
 * visitor in as a seeded customer. The seed's pick is used when it is there;
 * a visitor may have renamed or deleted that customer since the last reset, so
 * the first customer with a vehicle stands in, and then anyone at all.
 *
 * Null outside the demo, always: this is the only way to a portal session
 * without proving an address or a phone number.
 */
export async function findDemoPortalCustomer(
  organizationId: string
): Promise<{ id: string; name: string } | null> {
  if (!isDemoMode) return null

  const select = { id: true, name: true } as const
  return (
    (await db.customer.findFirst({
      where: { organizationId, email: DEMO_PORTAL_CUSTOMER_EMAIL },
      select,
    })) ??
    (await db.customer.findFirst({
      where: { organizationId, vehicles: { some: {} } },
      orderBy: { createdAt: 'asc' },
      select,
    })) ??
    (await db.customer.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      select,
    }))
  )
}
