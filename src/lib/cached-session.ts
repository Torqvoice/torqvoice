import { cache } from "react";
import { cookies, headers } from "next/headers";
import { auth } from "./auth";
import { db } from "./db";

export const getCachedSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export const getCachedMembership = cache(async (userId: string) => {
  const cookieStore = await cookies();
  const activeOrgCookie = cookieStore.get("active-org-id")?.value;

  const select = {
    organizationId: true,
    role: true,
    roleId: true,
    customRole: {
      include: { permissions: { select: { action: true, subject: true } } },
    },
  } as const;

  if (activeOrgCookie) {
    const m = await db.organizationMember.findFirst({
      where: { userId, organizationId: activeOrgCookie },
      select,
    });
    if (m) return m;
  }

  return db.organizationMember.findFirst({ where: { userId }, select });
});
