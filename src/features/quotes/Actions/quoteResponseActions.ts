"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { z } from "zod";

const respondToQuoteSchema = z.object({
  quoteId: z.string().min(1),
  publicToken: z.string().min(1),
  action: z.enum(["accepted", "changes_requested"]),
  message: z.string().optional(),
});

/**
 * Public action — no auth required.
 * Customer accepts or requests changes on a shared quote page.
 */
export async function respondToQuote(input: unknown) {
  const data = respondToQuoteSchema.parse(input);

  // Verify the quote exists and the token matches
  const quote = await db.quote.findFirst({
    where: { id: data.quoteId, publicToken: data.publicToken },
    include: { customer: { select: { name: true } } },
  });
  if (!quote) {
    return { success: false, error: "Quote not found" };
  }

  // Only allow response on quotes that are draft or sent
  if (!["draft", "sent"].includes(quote.status)) {
    return { success: false, error: "This quote can no longer be updated" };
  }

  await db.quote.update({
    where: { id: data.quoteId },
    data: {
      status: data.action,
      customerMessage: data.message || null,
    },
  });

  if (quote.organizationId) {
    const customerName = quote.customer?.name || "A customer";
    const actionLabel = data.action === "accepted" ? "accepted" : "requested changes on";
    notify({
      organizationId: quote.organizationId,
      type: "quote_response",
      title: `Quote ${data.action === "accepted" ? "Accepted" : "Changes Requested"}`,
      message: `${customerName} ${actionLabel} quote ${quote.quoteNumber || quote.title}`,
      entityType: "quote",
      entityId: quote.id,
      entityUrl: `/quotes/${quote.id}`,
    });
  }

  return { success: true };
}

/**
 * Authenticated — fetch quotes with customer responses (accepted / changes_requested).
 */
export async function getQuoteResponses() {
  return withAuth(async ({ organizationId }) => {
    const quotes = await db.quote.findMany({
      where: {
        organizationId,
        status: { in: ["accepted", "changes_requested"] },
      },
      select: {
        id: true,
        title: true,
        quoteNumber: true,
        status: true,
        customerMessage: true,
        totalAmount: true,
        updatedAt: true,
        vehicleId: true,
        customer: {
          select: { name: true },
        },
        vehicle: {
          select: { id: true, make: true, model: true, year: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    return quotes;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.QUOTES }] });
}

/**
 * Authenticated — acknowledge a customer response by setting the quote back to a working status.
 */
export async function acknowledgeQuoteResponse(quoteId: string) {
  return withAuth(async ({ organizationId }) => {
    const quote = await db.quote.findFirst({
      where: { id: quoteId, organizationId },
    });
    if (!quote) throw new Error("Quote not found");

    await db.quote.update({
      where: { id: quoteId },
      data: { status: "draft", customerMessage: null },
    });

    return { success: true };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.QUOTES }] });
}
