import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveInvoicePrefix } from "@/lib/invoice-utils";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const dueInvoices = await db.recurringInvoice.findMany({
    where: {
      isActive: true,
      nextRunDate: { lte: now },
    },
    include: {
      templateParts: true,
      templateLabor: true,
      vehicle: { select: { organizationId: true } },
    },
  });

  const results: { recurringInvoiceId: string; serviceRecordId: string }[] = [];

  for (const ri of dueInvoices) {
    const organizationId = ri.vehicle.organizationId;
    if (!organizationId) continue;

    // Generate invoice number for this org
    const settings = await db.appSetting.findMany({
      where: {
        organizationId,
        key: { in: ["workshop.invoicePrefix", "workshop.invoiceStartNumber"] },
      },
    });

    const settingsMap: Record<string, string> = {};
    for (const s of settings) settingsMap[s.key] = s.value;

    const prefix = resolveInvoicePrefix(settingsMap["workshop.invoicePrefix"] || "{year}-");
    const startNumber = parseInt(settingsMap["workshop.invoiceStartNumber"] || "0", 10);

    const lastRecord = await db.serviceRecord.findFirst({
      where: { vehicle: { organizationId } },
      orderBy: { createdAt: "desc" },
      select: { invoiceNumber: true },
    });

    let nextNum = startNumber || 1001;
    if (lastRecord?.invoiceNumber) {
      const match = lastRecord.invoiceNumber.match(/(\d+)$/);
      if (match) {
        const lastNum = parseInt(match[1], 10) + 1;
        nextNum = Math.max(nextNum, lastNum);
      }
    }
    const invoiceNumber = `${prefix}${nextNum}`;

    // Calculate totals
    const partsSubtotal = ri.templateParts.reduce((s, p) => s + p.quantity * p.unitPrice, 0);
    const laborSubtotal = ri.templateLabor.reduce((s, l) => s + l.hours * l.rate, 0);
    const subtotal = ri.cost + partsSubtotal + laborSubtotal;
    const taxAmount = subtotal * (ri.taxRate / 100);
    const totalAmount = subtotal + taxAmount;

    const serviceRecord = await db.$transaction(async (tx) => {
      const sr = await tx.serviceRecord.create({
        data: {
          title: ri.title,
          description: ri.description,
          type: ri.type,
          status: "completed",
          cost: ri.cost,
          serviceDate: now,
          invoiceNotes: ri.invoiceNotes,
          subtotal,
          taxRate: ri.taxRate,
          taxAmount,
          totalAmount,
          invoiceNumber,
          vehicleId: ri.vehicleId,
          partItems: {
            create: ri.templateParts.map((p) => ({
              name: p.name,
              partNumber: p.partNumber,
              quantity: p.quantity,
              unitPrice: p.unitPrice,
              total: p.quantity * p.unitPrice,
            })),
          },
          laborItems: {
            create: ri.templateLabor.map((l) => ({
              description: l.description,
              hours: l.hours,
              rate: l.rate,
              total: l.hours * l.rate,
            })),
          },
        },
      });

      // Update recurring invoice schedule
      const nextRunDate = calculateNextRunDate(ri.nextRunDate, ri.frequency);
      const shouldDeactivate = ri.endDate && nextRunDate > ri.endDate;

      await tx.recurringInvoice.update({
        where: { id: ri.id },
        data: {
          lastRunAt: now,
          runCount: { increment: 1 },
          nextRunDate,
          ...(shouldDeactivate && { isActive: false }),
        },
      });

      return sr;
    });

    results.push({
      recurringInvoiceId: ri.id,
      serviceRecordId: serviceRecord.id,
    });
  }

  return NextResponse.json({
    processed: results.length,
    results,
    timestamp: now.toISOString(),
  });
}

function calculateNextRunDate(current: Date, frequency: string): Date {
  const next = new Date(current);
  switch (frequency) {
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "biweekly":
      next.setDate(next.getDate() + 14);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 3);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}
