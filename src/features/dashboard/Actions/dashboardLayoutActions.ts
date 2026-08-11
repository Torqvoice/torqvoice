"use server";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getCachedSession } from "@/lib/cached-session";
import { normalizeLayout } from "../dashboard-grid-config";

/**
 * Persists the current user's dashboard layout. Input is normalized against
 * the known card set and grid bounds, so arbitrary payloads can never store
 * anything but a valid layout. Session-scoped: the layout is a property of
 * the user, not the organization.
 */
export async function saveDashboardLayout(input: unknown) {
  const session = await getCachedSession();
  if (!session?.user?.id) return { success: false };

  const layout = normalizeLayout(input);
  await db.user.update({
    where: { id: session.user.id },
    data: { dashboardLayout: layout as unknown as Prisma.InputJsonValue },
  });
  return { success: true };
}

/** Resets the current user's dashboard to the default layout. */
export async function resetDashboardLayout() {
  const session = await getCachedSession();
  if (!session?.user?.id) return { success: false };

  await db.user.update({
    where: { id: session.user.id },
    data: { dashboardLayout: Prisma.DbNull },
  });
  return { success: true };
}
