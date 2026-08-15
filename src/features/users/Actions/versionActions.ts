"use server";

import { db } from "@/lib/db";
import { getCachedSession } from "@/lib/cached-session";

/**
 * Records that the current user has seen (or dismissed) the update banner for
 * the given app version. Stored per user, so the banner shows exactly once per
 * account per release across all devices. Deliberately session-scoped rather
 * than org-scoped: the version is a property of the deployment, not the org.
 */
export async function markVersionSeen(version: string) {
  const session = await getCachedSession();
  if (!session?.user?.id) return { success: false };

  const clean = version.slice(0, 64);
  if (!clean) return { success: false };

  await db.user.update({
    where: { id: session.user.id },
    data: { lastSeenVersion: clean },
  });
  return { success: true };
}
