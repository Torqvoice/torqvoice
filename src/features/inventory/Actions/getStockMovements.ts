"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { STOCK_MOVEMENT_REASONS } from "../Lib/stockMovementReasons";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * Paginated movement history for a single part — the answer to "where was this
 * used, and when did the count change?".
 *
 * Ordering is newest-first, which matches the
 * `(inventoryPartId, createdAt DESC)` index exactly: the query is an index
 * scan with no sort step, so paging stays fast however long the ledger grows.
 *
 * Rows are scoped by `organizationId` as well as part id, so a movement
 * belonging to another tenant can never be returned even with a guessed id.
 */
export async function getStockMovementsPaginated(params: {
  inventoryPartId: string;
  page?: number;
  pageSize?: number;
  reason?: string;
}) {
  return withAuth(
    async ({ organizationId }) => {
      const page = Math.max(1, params.page ?? 1);
      const pageSize = Math.min(
        Math.max(params.pageSize ?? DEFAULT_PAGE_SIZE, 1),
        MAX_PAGE_SIZE,
      );

      const where = {
        inventoryPartId: params.inventoryPartId,
        organizationId,
        // Ignore an unrecognised reason rather than returning an empty page.
        ...(params.reason &&
        (STOCK_MOVEMENT_REASONS as readonly string[]).includes(params.reason)
          ? { reason: params.reason }
          : {}),
      };

      const [rows, total] = await Promise.all([
        db.stockMovement.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            delta: true,
            quantityAfter: true,
            reason: true,
            note: true,
            createdAt: true,
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
        }),
        db.stockMovement.count({ where }),
      ]);

      return {
        movements: rows.map((m) => ({
          id: m.id,
          delta: m.delta,
          quantityAfter: m.quantityAfter,
          reason: m.reason,
          note: m.note,
          createdAt: m.createdAt.toISOString(),
          userName: m.user?.name ?? null,
          // Present only while the job still exists; the label below outlives it.
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
        })),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INVENTORY },
      ],
    },
  );
}

/**
 * The part itself, for the detail page. Selects the full shape
 * `InventoryPartForm` expects so the same form powers the dialog and the page.
 * Org-scoped.
 */
export async function getInventoryPart(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      return db.inventoryPart.findFirst({
        where: { id, organizationId },
        select: {
          id: true,
          name: true,
          partNumber: true,
          barcode: true,
          description: true,
          category: true,
          quantity: true,
          minQuantity: true,
          unitCost: true,
          sellPrice: true,
          supplier: true,
          supplierPhone: true,
          supplierEmail: true,
          supplierUrl: true,
          imageUrl: true,
          location: true,
          gallery: {
            select: {
              id: true,
              url: true,
              fileName: true,
              description: true,
              sortOrder: true,
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INVENTORY },
      ],
    },
  );
}
