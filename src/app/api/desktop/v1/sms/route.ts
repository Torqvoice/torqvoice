import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { sendOrgSms, getOrgSmsPhoneNumber } from "@/lib/sms";
import { requireFeature } from "@/lib/features";

export async function POST(request: Request) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const { customerId, body: messageBody, relatedEntityType, relatedEntityId } = await request.json();

      if (!customerId || !messageBody) {
        return NextResponse.json({ error: "customerId and body are required" }, { status: 400 });
      }

      await requireFeature(organizationId, "sms");

      const customer = await db.customer.findFirst({
        where: { id: customerId, organizationId },
        select: { phone: true },
      });
      if (!customer) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }
      if (!customer.phone) {
        return NextResponse.json({ error: "Customer has no phone number" }, { status: 400 });
      }

      const fromNumber = await getOrgSmsPhoneNumber(organizationId);
      if (!fromNumber) {
        return NextResponse.json({ error: "SMS phone number is not configured" }, { status: 400 });
      }

      // Create message record
      const message = await db.smsMessage.create({
        data: {
          direction: "outbound",
          fromNumber,
          toNumber: customer.phone,
          body: messageBody,
          status: "queued",
          customerId,
          organizationId,
          relatedEntityType: relatedEntityType || null,
          relatedEntityId: relatedEntityId || null,
        },
      });

      try {
        const result = await sendOrgSms(organizationId, {
          to: customer.phone,
          body: messageBody,
        });
        await db.smsMessage.update({
          where: { id: message.id },
          data: { status: "sent", providerMsgId: result?.messageId || null },
        });
      } catch (err) {
        await db.smsMessage.update({
          where: { id: message.id },
          data: {
            status: "failed",
            errorMessage: err instanceof Error ? err.message : "Unknown error",
          },
        });
        return NextResponse.json({ error: "Failed to send SMS" }, { status: 500 });
      }

      const updated = await db.smsMessage.findUniqueOrThrow({ where: { id: message.id } });
      return NextResponse.json({ message: updated }, { status: 201 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS },
      ],
    },
  );
}
