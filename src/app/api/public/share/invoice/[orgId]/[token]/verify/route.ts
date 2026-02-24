import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getPaymentProvider, getEnabledProviders } from "@/lib/payment-providers";
import { rateLimit } from "@/lib/rate-limit";
import { notify } from "@/lib/notify";
import { resolvePortalOrg } from "@/lib/portal-slug";

const verifySchema = z.object({
  provider: z.enum(["stripe", "vipps", "paypal"]),
  externalId: z.string().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string; token: string }> },
) {
  const limited = rateLimit(request, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const { orgId: orgParam, token } = await params;

    // Resolve slug (e.g. "egelandauto") or UUID to the real org ID
    const resolvedOrg = await resolvePortalOrg(orgParam);
    const orgId = resolvedOrg?.id ?? orgParam;

    const record = await db.serviceRecord.findUnique({
      where: { publicToken: token },
      include: {
        vehicle: { select: { id: true, organizationId: true, customer: { select: { name: true } } } },
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

      notify({
        organizationId: orgId,
        type: "invoice_payment",
        title: "Invoice Payment Received",
        message: `${record.vehicle.customer?.name || "A customer"} paid ${result.amount.toFixed(2)} for invoice ${record.invoiceNumber || record.title}`,
        entityType: "invoice",
        entityId: record.id,
        entityUrl: `/vehicles/${record.vehicle.id}?tab=service&record=${record.id}`,
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
