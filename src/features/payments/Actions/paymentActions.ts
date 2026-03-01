"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createPaymentSchema } from "../Schema/paymentSchema";
import { revalidatePath } from "next/cache";
import { recordDeletion } from "@/lib/sync-deletion";

export async function createPayment(input: unknown) {
  return withAuth(async ({ organizationId }) => {
    const data = createPaymentSchema.parse(input);

    // Verify ownership: serviceRecord -> vehicle -> organizationId
    const serviceRecord = await db.serviceRecord.findFirst({
      where: { id: data.serviceRecordId, vehicle: { organizationId } },
      select: { id: true, vehicleId: true },
    });
    if (!serviceRecord) throw new Error("Service record not found");

    const payment = await db.payment.create({
      data: {
        serviceRecordId: data.serviceRecordId,
        amount: data.amount,
        date: new Date(data.date),
        method: data.method,
        note: data.note || null,
      },
    });

    revalidatePath(`/vehicles/${serviceRecord.vehicleId}/service/${data.serviceRecordId}`);
    return payment;
  }, { requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.BILLING }] });
}

export async function deletePayment(paymentId: string) {
  return withAuth(async ({ organizationId }) => {
    const payment = await db.payment.findFirst({
      where: { id: paymentId, serviceRecord: { vehicle: { organizationId } } },
      include: { serviceRecord: { select: { vehicleId: true, id: true } } },
    });
    if (!payment) throw new Error("Payment not found");

    await recordDeletion("payment", paymentId, organizationId);
    await db.payment.delete({ where: { id: paymentId } });

    const { vehicleId, id: serviceId } = payment.serviceRecord;
    revalidatePath(`/vehicles/${vehicleId}/service/${serviceId}`);
    return { deleted: true };
  }, { requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.BILLING }] });
}
