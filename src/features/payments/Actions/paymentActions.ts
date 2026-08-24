"use server";

import { toSafeDate } from "@/lib/invoice-utils";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createPaymentSchema } from "../Schema/paymentSchema";
import { revalidatePath } from "next/cache";

export async function createPayment(input: unknown) {
  return withAuth(async ({ organizationId }) => {
    const data = createPaymentSchema.parse(input);

    // Verify ownership: serviceRecord -> vehicle -> organizationId
    const serviceRecord = await db.serviceRecord.findFirst({
      where: { id: data.serviceRecordId, organizationId },
      select: { id: true, vehicleId: true },
    });
    if (!serviceRecord) throw new Error("Service record not found");

    const payment = await db.payment.create({
      data: {
        serviceRecordId: data.serviceRecordId,
        amount: data.amount,
        date: toSafeDate(data.date) ?? new Date(),
        method: data.method,
        note: data.note || null,
      },
    });

    revalidatePath(
      serviceRecord.vehicleId
        ? `/vehicles/${serviceRecord.vehicleId}/service/${data.serviceRecordId}`
        : `/sales/${data.serviceRecordId}`
    );
    return { ...payment, serviceRecordId: data.serviceRecordId, amount: data.amount, method: data.method };
  }, {
    requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.BILLING }],
    audit: ({ result }) => ({
      action: "payment.create",
      entity: "Payment",
      entityId: result.id,
      details: { key: "payment_create", params: { amount: result.amount, serviceRecordId: result.serviceRecordId } },
      metadata: { paymentId: result.id, serviceRecordId: result.serviceRecordId, amount: result.amount, method: result.method },
    }),
  });
}

export async function deletePayment(paymentId: string) {
  return withAuth(async ({ organizationId }) => {
    const payment = await db.payment.findFirst({
      where: { id: paymentId, serviceRecord: { organizationId } },
      include: { serviceRecord: { select: { vehicleId: true, id: true } } },
    });
    if (!payment) throw new Error("Payment not found");

    await db.payment.delete({ where: { id: paymentId } });

    const { vehicleId, id: serviceId } = payment.serviceRecord;
    revalidatePath(
      vehicleId ? `/vehicles/${vehicleId}/service/${serviceId}` : `/sales/${serviceId}`
    );
    return { deleted: true, paymentId };
  }, {
    requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.BILLING }],
    audit: ({ result }) => ({
      action: "payment.delete",
      entity: "Payment",
      entityId: result.paymentId,
      details: { key: "payment_delete", params: { id: result.paymentId } },
      metadata: { paymentId: result.paymentId },
    }),
  });
}
