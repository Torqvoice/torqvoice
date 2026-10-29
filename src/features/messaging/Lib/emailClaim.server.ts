import 'server-only'

import { db } from '@/lib/db'
import { normalizeEmailAddress } from '@/lib/email-address'

/**
 * Gives a customer the email thread that was waiting for them.
 *
 * A first mail from a stranger is filed under the address alone, and the
 * workshop's answer to it is to create the customer. Without this the thread
 * would stay a read-only history under the address while the new customer
 * started an empty one: the rows are moved under the customer instead, so
 * the conversation continues where it was, with a reply box.
 */
export async function claimEmailMessagesForCustomer(
  organizationId: string,
  customerId: string,
  email: string | null | undefined
): Promise<{ claimed: number }> {
  const address = normalizeEmailAddress(email)
  if (!address) return { claimed: 0 }

  const { count } = await db.emailMessage.updateMany({
    where: { organizationId, customerId: null, address: { equals: address, mode: 'insensitive' } },
    data: { customerId },
  })
  return { claimed: count }
}
