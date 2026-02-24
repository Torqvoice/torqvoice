import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getPaymentProvider, getEnabledProviders } from "@/lib/payment-providers";
import { rateLimit } from "@/lib/rate-limit";
import { resolvePortalOrg } from "@/lib/portal-slug";

const checkoutSchema = z.object({
  provider: z.enum(["stripe", "vipps", "paypal"]),
  amount: z.number().positive(),
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
        payments: true,
        vehicle: {
          select: { organizationId: true },
        },
      },
    });

    if (!record || record.vehicle.organizationId !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { provider, amount } = parsed.data;

    // Calculate balance due
    const displayTotal =
      record.totalAmount > 0 ? record.totalAmount : record.cost;
    const paidFromPayments = record.payments.reduce((sum, p) => sum + p.amount, 0);
    const totalPaid = record.manuallyPaid ? displayTotal : paidFromPayments;
    const balanceDue = displayTotal - totalPaid;

    if (balanceDue <= 0) {
      return NextResponse.json(
        { error: "Invoice is already paid in full" },
        { status: 400 },
      );
    }

    if (amount < 0.01 || amount > balanceDue + 0.01) {
      return NextResponse.json(
        { error: `Amount must be between 0.01 and ${balanceDue.toFixed(2)}` },
        { status: 400 },
      );
    }

    // Load org payment settings
    const settings = await db.appSetting.findMany({
      where: { organizationId: orgId },
    });
    const settingsMap: Record<string, string> = {};
    for (const s of settings) settingsMap[s.key] = s.value;

    const enabledProviders = getEnabledProviders(settingsMap);
    if (!enabledProviders.includes(provider)) {
      return NextResponse.json(
        { error: `Payment provider "${provider}" is not enabled` },
        { status: 400 },
      );
    }

    const currencyCode = settingsMap["workshop.currencyCode"] || "USD";
    const invoiceNumber =
      record.invoiceNumber || `INV-${record.id.slice(-8).toUpperCase()}`;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const invoiceUrl = `${appUrl}/share/invoice/${orgId}/${token}`;

    const paymentProvider = getPaymentProvider(provider, settingsMap);
    const result = await paymentProvider.createCheckout({
      amount,
      currency: currencyCode,
      invoiceNumber,
      description: `Payment for ${invoiceNumber} - ${record.title}`,
      successUrl: invoiceUrl,
      cancelUrl: invoiceUrl,
      serviceRecordId: record.id,
      orgId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Checkout] Error:", error);
    const message =
      error instanceof Error ? error.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
