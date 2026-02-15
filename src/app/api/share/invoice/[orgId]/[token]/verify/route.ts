import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getPaymentProvider, getEnabledProviders } from "@/lib/payment-providers";

const verifySchema = z.object({
  provider: z.enum(["stripe", "vipps"]),
  externalId: z.string().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string; token: string }> },
) {
  try {
    const { orgId, token } = await params;

    const record = await db.serviceRecord.findUnique({
      where: { publicToken: token },
      include: {
        vehicle: { select: { organizationId: true } },
      },
    });

    if (!record || record.vehicle.organizationId !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { provider, externalId } = parsed.data;

    // Load org payment settings
    const settings = await db.appSetting.findMany({
      where: { organizationId: orgId },
    });
    const settingsMap: Record<string, string> = {};
    for (const s of settings) settingsMap[s.key] = s.value;

    const enabledProviders = getEnabledProviders(settingsMap);
    if (!enabledProviders.includes(provider)) {
      return NextResponse.json(
        { error: `Provider "${provider}" is not enabled` },
        { status: 400 },
      );
    }

    const paymentProvider = getPaymentProvider(provider, settingsMap);
    const result = await paymentProvider.verifyPayment(externalId);

    if (!result || !result.paid) {
      return NextResponse.json({ verified: false });
    }

    // Idempotent: check if payment with this externalId already exists
    const existing = await db.payment.findFirst({
      where: { externalId },
    });

    if (!existing) {
      await db.payment.create({
        data: {
          amount: result.amount,
          method: provider,
          provider,
          externalId,
          serviceRecordId: record.id,
        },
      });
    }

    return NextResponse.json({
      verified: true,
      amount: result.amount,
    });
  } catch (error) {
    console.error("[Verify] Error:", error);
    const message =
      error instanceof Error ? error.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
