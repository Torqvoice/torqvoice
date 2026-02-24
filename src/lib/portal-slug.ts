import { cache } from "react";
import { db } from "@/lib/db";

/**
 * Resolve a portal URL parameter (slug or orgId) to the real organization.
 * Tries portalSlug first, falls back to id lookup.
 */
export const resolvePortalOrg = cache(
  async (
    slugOrId: string,
  ): Promise<{ id: string; name: string } | null> => {
    // Try slug first
    const bySlug = await db.organization.findUnique({
      where: { portalSlug: slugOrId },
      select: { id: true, name: true },
    });
    if (bySlug) return bySlug;

    // Fall back to id
    const byId = await db.organization.findUnique({
      where: { id: slugOrId },
      select: { id: true, name: true },
    });
    return byId;
  },
);
