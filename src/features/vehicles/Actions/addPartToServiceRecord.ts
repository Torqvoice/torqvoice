"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { calculateTotals } from "@/lib/tax";

export async function addPartToServiceRecord(input: {
  serviceRecordId: string;
  partNumber?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  unitCost: number;
  inventoryPartId?: string;
}) {
  return withAuth(
    async ({ organizationId }) => {
      const record = await db.serviceRecord.findFirst({
        where: { id: input.serviceRecordId, vehicle: { organizationId } },
        select: { id: true, vehicleId: true, subtotal: true, taxRate: true, taxInclusive: true, discountType: true, discountValue: true },
      });
      if (!record) throw new Error("Service record not found");

      const part = await db.servicePart.create({
        data: {
          partNumber: input.partNumber || null,
          name: input.name,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          total: input.total,
          unitCost: input.unitCost,
          inventoryPartId: input.inventoryPartId || null,
          serviceRecordId: record.id,
        },
      });

      // Recalculate totals
      const [partsAgg, laborAgg] = await Promise.all([
        db.servicePart.aggregate({
          where: { serviceRecordId: record.id },
          _sum: { total: true },
        }),
        db.serviceLabor.aggregate({
          where: { serviceRecordId: record.id },
          _sum: { total: true },
        }),
      ]);

      const subtotal = (partsAgg._sum.total || 0) + (laborAgg._sum.total || 0);
      const discountAmount =
        record.discountType === "percentage"
          ? subtotal * ((record.discountValue ?? 0) / 100)
          : record.discountType === "fixed"
            ? Math.min(record.discountValue ?? 0, subtotal)
            : 0;
      const { taxAmount, totalAmount } = calculateTotals({
        subtotal,
        discountAmount,
        taxRate: record.taxRate,
        taxInclusive: record.taxInclusive,
      });

      await db.serviceRecord.update({
        where: { id: record.id },
        data: { subtotal, taxAmount, totalAmount },
      });

      // Deduct inventory stock if linked
      if (input.inventoryPartId) {
        await db.inventoryPart.update({
          where: { id: input.inventoryPartId },
          data: { quantity: { decrement: input.quantity } },
        });
      }

      revalidatePath(`/vehicles/${record.vehicleId}/service/${record.id}`);

      return part;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  );
}
