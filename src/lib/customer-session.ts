import { cookies } from "next/headers";
import { db } from "./db";

export const CUSTOMER_SESSION_COOKIE = "customer-session";
export const CUSTOMER_SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
export const MAGIC_LINK_DURATION = 15 * 60 * 1000; // 15 minutes

export type CustomerSessionData = {
  customerId: string;
  organizationId: string;
};

export async function getCustomerSession(): Promise<CustomerSessionData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;

  if (!token) return null;

  const session = await db.customerSession.findUnique({
    where: { token },
  });

  if (!session) return null;

  if (new Date() > session.expiresAt) {
    // Clean up expired session
    await db.customerSession.delete({ where: { id: session.id } }).catch(() => { /* ignore */ });
    return null;
  }

  return {
    customerId: session.customerId,
    organizationId: session.organizationId,
  };
}
