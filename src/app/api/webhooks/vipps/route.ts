import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { getPaymentProvider } from "@/lib/payment-providers";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Vipps sends callbacks with reference and status
    const reference = body.reference as string | undefined;
    const orgId = body.metadata?.orgId as string | undefined;
    const serviceRecordId = body.metadata?.serviceRecordId as string | undefined;

    if (!reference || !orgId || !serviceRecordId) {
      // Try to extract from the reference pattern: inv-{serviceRecordId}-{timestamp}
      if (reference) {
        const parts = reference.match(/^inv-(.+)-\d+$/);
        if (parts) {
          // We need orgId from the service record lookup
          const record = await db.serviceRecord.findUnique({
            where: { id: parts[1] },
            include: { vehicle: { select: { organizationId: true } } },
          });

          if (record) {
            return await processVippsPayment(
              reference,
              record.vehicle.organizationId!,
              record.id,
            );
          }
        }
      }
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    return await processVippsPayment(reference, orgId, serviceRecordId);
  } catch (error) {
    console.error("[Vipps Webhook] Error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}

async function processVippsPayment(
  reference: string,
  orgId: string,
  serviceRecordId: string,
) {
  // Idempotent check
  const existing = await db.payment.findFirst({
    where: { externalId: reference },
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

  if (!settingsMap[SETTING_KEYS.PAYMENT_VIPPS_CLIENT_ID]) {
    return NextResponse.json(
      { error: "Vipps not configured for this org" },
      { status: 400 },
    );
  }

  const provider = getPaymentProvider("vipps", settingsMap);
  const result = await provider.verifyPayment(reference);

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
        method: "vipps",
        provider: "vipps",
        externalId: reference,
        serviceRecordId,
      },
    });
  }

  return NextResponse.json({ received: true });
}
