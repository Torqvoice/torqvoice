"use server";

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function generateQuotePublicLink(quoteId: string) {
  return withAuth(async ({ organizationId }) => {
    const quote = await db.quote.findFirst({
      where: { id: quoteId, organizationId },
    });
    if (!quote) throw new Error("Quote not found");

    const token = randomUUID();
    await db.quote.update({
      where: { id: quoteId },
      data: { publicToken: token, sharedAt: new Date() },
    });

    revalidatePath(`/quotes/${quoteId}`);
    return { token, organizationId };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.QUOTES }] });
}

export async function revokeQuotePublicLink(quoteId: string) {
  return withAuth(async ({ organizationId }) => {
    const quote = await db.quote.findFirst({
      where: { id: quoteId, organizationId },
    });
    if (!quote) throw new Error("Quote not found");

    await db.quote.update({
      where: { id: quoteId },
      data: { publicToken: null, sharedAt: null, viewCount: 0, lastViewedAt: null },
    });

    revalidatePath(`/quotes/${quoteId}`);
    return { revoked: true };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.QUOTES }] });
}
