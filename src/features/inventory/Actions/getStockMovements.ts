"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

const DEFAULT_LIMIT = 50;

/**
 * Movement history for a single part — the answer to "where was this used?".
 *
 * Rows are org-scoped through the part itself, so a movement belonging to
 * another tenant can never be returned. The service record is joined through
 * to its vehicle so the UI can link straight to the job the part went onto.
 */
export async function getStockMovements(
  inventoryPartId: string,
  limit: number = DEFAULT_LIMIT,
) {
  return withAuth(
    async ({ organizationId }) => {
      const movements = await db.stockMovement.findMany({
        where: { inventoryPartId, organizationId },
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(limit, 1), 200),
        select: {
          id: true,
          delta: true,
          quantityAfter: true,
          reason: true,
          note: true,
          createdAt: true,
          serviceRecordId: true,
          serviceRecordLabel: true,
          user: { select: { name: true } },
          serviceRecord: {
            select: {
              id: true,
              title: true,
              invoiceNumber: true,
              vehicleId: true,
              vehicle: {
                select: { make: true, model: true, licensePlate: true },
              },
            },
          },
        },
      });

      return movements.map((m) => ({
        id: m.id,
        delta: m.delta,
        quantityAfter: m.quantityAfter,
        reason: m.reason,
        note: m.note,
        createdAt: m.createdAt.toISOString(),
        userName: m.user?.name ?? null,
        // Present only while the job still exists; the label below survives it.
        serviceRecordId: m.serviceRecord?.id ?? null,
        vehicleId: m.serviceRecord?.vehicleId ?? null,
        label:
          m.serviceRecord?.invoiceNumber ||
          m.serviceRecord?.title ||
          m.serviceRecordLabel ||
          null,
        vehicle: m.serviceRecord?.vehicle
          ? [
              m.serviceRecord.vehicle.make,
              m.serviceRecord.vehicle.model,
              m.serviceRecord.vehicle.licensePlate
                ? `(${m.serviceRecord.vehicle.licensePlate})`
                : null,
            ]
              .filter(Boolean)
              .join(" ")
          : null,
      }));
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INVENTORY },
      ],
    },
  );
}
