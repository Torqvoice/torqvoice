"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { z } from "zod";

const createQuoteRequestSchema = z.object({
  inspectionId: z.string().min(1),
  publicToken: z.string().min(1),
  selectedItemIds: z.array(z.string()).min(1, "Select at least one item"),
  message: z.string().optional(),
});

/**
 * Public action — no auth required.
 * Customer submits a quote request from the shared inspection page.
 */
export async function createQuoteRequest(input: unknown) {
  const data = createQuoteRequestSchema.parse(input);

  // Verify the inspection exists and the token matches
  const inspection = await db.inspection.findFirst({
    where: { id: data.inspectionId, publicToken: data.publicToken },
    include: { vehicle: { select: { customer: { select: { name: true } } } } },
  });
  if (!inspection) {
    return { success: false, error: "Inspection not found" };
  }

  // Check for existing pending request
  const existing = await db.inspectionQuoteRequest.findFirst({
    where: { inspectionId: data.inspectionId, status: "pending" },
  });
  if (existing) {
    return { success: false, error: "A quote request is already pending for this inspection" };
  }

  await db.inspectionQuoteRequest.create({
    data: {
      inspectionId: data.inspectionId,
      selectedItemIds: data.selectedItemIds,
      message: data.message,
      organizationId: inspection.organizationId,
    },
  });

  const customerName = inspection.vehicle?.customer?.name || "A customer";
  notify({
    organizationId: inspection.organizationId,
    type: "inspection_quote_request",
    title: "Quote Requested from Inspection",
    message: `${customerName} requested a quote for ${data.selectedItemIds.length} item(s) from an inspection`,
    entityType: "inspection",
    entityId: inspection.id,
    entityUrl: `/inspections/${inspection.id}`,
  });

  return { success: true };
}

/**
 * Public action — no auth required.
 * Customer cancels a pending quote request from the shared inspection page.
 */
export async function cancelQuoteRequest(input: { inspectionId: string; publicToken: string }) {
  const { inspectionId, publicToken } = input;

  // Verify the inspection exists and the token matches
  const inspection = await db.inspection.findFirst({
    where: { id: inspectionId, publicToken },
  });
  if (!inspection) {
    return { success: false, error: "Inspection not found" };
  }

  // Find the pending request
  const existing = await db.inspectionQuoteRequest.findFirst({
    where: { inspectionId, status: "pending" },
  });
  if (!existing) {
    return { success: false, error: "No pending quote request found" };
  }

  await db.inspectionQuoteRequest.delete({ where: { id: existing.id } });

  return { success: true };
}

/**
 * Authenticated — fetch pending quote requests for the dashboard.
 */
export async function getQuoteRequests() {
  return withAuth(async ({ organizationId }) => {
    const requests = await db.inspectionQuoteRequest.findMany({
      where: { organizationId, status: "pending" },
      include: {
        inspection: {
          include: {
            vehicle: {
              select: {
                id: true,
                make: true,
                model: true,
                year: true,
                licensePlate: true,
                customer: { select: { name: true } },
              },
            },
            items: { select: { id: true, name: true, section: true, condition: true, notes: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return requests;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS }] });
}

/**
 * Authenticated — update quote request status (quoted / dismissed).
 */
export async function updateQuoteRequestStatus(id: string, status: "quoted" | "dismissed") {
  return withAuth(async ({ organizationId }) => {
    const request = await db.inspectionQuoteRequest.findFirst({
      where: { id, organizationId },
    });
    if (!request) throw new Error("Quote request not found");

    await db.inspectionQuoteRequest.update({
      where: { id },
      data: { status },
    });

    return { success: true };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS }] });
}
