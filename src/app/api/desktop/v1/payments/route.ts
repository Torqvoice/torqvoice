import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createPaymentSchema } from "@/features/payments/Schema/paymentSchema";

export async function POST(request: Request) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const body = await request.json();
      const data = createPaymentSchema.parse(body);

      const serviceRecord = await db.serviceRecord.findFirst({
        where: { id: data.serviceRecordId, vehicle: { organizationId } },
        select: { id: true },
      });
      if (!serviceRecord) {
        return NextResponse.json({ error: "Service record not found" }, { status: 404 });
      }

      const payment = await db.payment.create({
        data: {
          serviceRecordId: data.serviceRecordId,
          amount: data.amount,
          date: new Date(data.date),
          method: data.method,
          note: data.note || null,
        },
      });

      return NextResponse.json({ payment }, { status: 201 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.BILLING },
      ],
    },
  );
}
