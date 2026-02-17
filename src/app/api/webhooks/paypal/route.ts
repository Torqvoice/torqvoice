import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { getPaymentProvider } from "@/lib/payment-providers";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // PayPal webhook event
    const eventType = body.event_type as string | undefined;

    if (eventType !== "PAYMENT.CAPTURE.COMPLETED") {
      return NextResponse.json({ received: true });
    }

    const resource = body.resource;
    if (!resource) {
      return NextResponse.json(
        { error: "Missing resource" },
        { status: 400 },
      );
    }

    // Extract custom_id which contains "serviceRecordId:orgId"
    const customId =
      resource.custom_id ||
      resource.supplementary_data?.related_ids?.custom_id;
    const orderId =
      resource.supplementary_data?.related_ids?.order_id || resource.id;

    if (!customId || !orderId) {
      return NextResponse.json(
        { error: "Missing custom_id or order_id" },
        { status: 400 },
      );
    }

    const [serviceRecordId, orgId] = customId.split(":");
    if (!serviceRecordId || !orgId) {
      return NextResponse.json(
        { error: "Invalid custom_id format" },
        { status: 400 },
      );
    }

    return await processPayPalPayment(orderId, orgId, serviceRecordId);
  } catch (error) {
    console.error("[PayPal Webhook] Error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}

async function processPayPalPayment(
  orderId: string,
  orgId: string,
  serviceRecordId: string,
) {
  // Idempotent check
  const existing = await db.payment.findFirst({
    where: { externalId: orderId },
  });
  if (existing) {
    return NextResponse.json({ received: true });
  }

  // Load org settings
  const settings = await db.appSetting.findMany({
    where: { organizationId: orgId },
  });
  const settingsMap: Record<string, string> = {};
  for (const s of settings) settingsMap[s.key] = s.value;

  if (!settingsMap[SETTING_KEYS.PAYMENT_PAYPAL_CLIENT_ID]) {
    return NextResponse.json(
      { error: "PayPal not configured for this org" },
      { status: 400 },
    );
  }

  // Verify the order with PayPal API
  const provider = getPaymentProvider("paypal", settingsMap);
  const result = await provider.verifyPayment(orderId);

  if (!result || !result.paid) {
    return NextResponse.json({ received: true, status: "not_paid" });
  }

  // Verify service record exists and belongs to this org
  const record = await db.serviceRecord.findUnique({
    where: { id: serviceRecordId },
    include: { vehicle: { select: { organizationId: true } } },
  });

  if (record && record.vehicle.organizationId === orgId) {
    await db.payment.create({
      data: {
        amount: result.amount,
        method: "paypal",
        provider: "paypal",
        externalId: orderId,
        serviceRecordId,
      },
    });
  }

  return NextResponse.json({ received: true });
}
