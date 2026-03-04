import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { resolveInvoicePrefix } from "@/lib/invoice-utils";
import { copyFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const { id } = await params;
      const { vehicleId } = await request.json();

      const quote = await db.quote.findFirst({
        where: { id, organizationId },
        include: { partItems: true, laborItems: true, attachments: true },
      });
      if (!quote) {
        return NextResponse.json({ error: "Quote not found" }, { status: 404 });
      }

      const vehicle = await db.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
      });
      if (!vehicle) {
        return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
      }

      // Get settings for invoice number
      const [settings, org] = await Promise.all([
        db.appSetting.findMany({
          where: { organizationId, key: { in: ["workshop.invoicePrefix"] } },
        }),
        db.organization.findUnique({
          where: { id: organizationId },
          select: { name: true },
        }),
      ]);
      const settingsMap: Record<string, string> = {};
      for (const s of settings) settingsMap[s.key] = s.value;
      const prefix = resolveInvoicePrefix(settingsMap["workshop.invoicePrefix"] || "{year}-");

      const lastRecord = await db.serviceRecord.findFirst({
        where: { vehicle: { organizationId } },
        orderBy: { createdAt: "desc" },
        select: { invoiceNumber: true },
      });
      let nextNum = 1001;
      if (lastRecord?.invoiceNumber) {
        const match = lastRecord.invoiceNumber.match(/(\d+)$/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
      }
      const invoiceNumber = `${prefix}${nextNum}`;

      const record = await db.$transaction(async (tx) => {
        const created = await tx.serviceRecord.create({
          data: {
            title: quote.title,
            description: quote.description,
            type: "repair",
            status: "pending",
            vehicleId,
            shopName: org?.name || undefined,
            invoiceNumber,
            subtotal: quote.subtotal,
            taxRate: quote.taxRate,
            taxAmount: quote.taxAmount,
            totalAmount: quote.totalAmount,
            cost: quote.totalAmount,
            discountType: quote.discountType,
            discountValue: quote.discountValue,
            discountAmount: quote.discountAmount,
            serviceDate: new Date(),
          },
        });

        const includedParts = quote.partItems.filter((p) => !p.excluded);
        if (includedParts.length > 0) {
          await tx.servicePart.createMany({
            data: includedParts.map((p) => ({
              partNumber: p.partNumber,
              name: p.name,
              quantity: p.quantity,
              unitPrice: p.unitPrice,
              total: p.total,
              serviceRecordId: created.id,
            })),
          });
        }

        const includedLabor = quote.laborItems.filter((l) => !l.excluded);
        if (includedLabor.length > 0) {
          await tx.serviceLabor.createMany({
            data: includedLabor.map((l) => ({
              description: l.description,
              hours: l.hours,
              rate: l.rate,
              total: l.total,
              serviceRecordId: created.id,
            })),
          });
        }

        // Copy attachments
        if (quote.attachments.length > 0) {
          const quotesDir = path.join(process.cwd(), "data", "uploads", organizationId, "quotes");
          const servicesDir = path.join(process.cwd(), "data", "uploads", organizationId, "services");
          await mkdir(servicesDir, { recursive: true });

          for (const att of quote.attachments) {
            try {
              const filename = att.fileUrl.split("/").pop()!;
              const srcPath = path.join(quotesDir, filename);
              const destPath = path.join(servicesDir, filename);
              await copyFile(srcPath, destPath);

              const newUrl = att.fileUrl.replace("/quotes/", "/services/");
              await tx.serviceAttachment.create({
                data: {
                  fileName: att.fileName,
                  fileUrl: newUrl,
                  fileType: att.fileType,
                  fileSize: att.fileSize,
                  category: att.category === "document" ? "document" : "image",
                  description: att.description,
                  includeInInvoice: att.includeInInvoice,
                  serviceRecordId: created.id,
                },
              });
            } catch (err) {
              console.warn(`[convertQuote] Failed to copy attachment "${att.fileName}":`, err);
            }
          }
        }

        // Mark quote as converted
        await tx.quote.updateMany({
          where: { id, organizationId },
          data: { status: "converted", convertedToId: created.id },
        });

        return created;
      });

      return NextResponse.json({ workOrder: record, quote: { id, status: "converted" } }, { status: 201 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.SERVICES },
      ],
    },
  );
}
