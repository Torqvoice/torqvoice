import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { InvoicePDF } from "@/features/vehicles/Components/InvoicePDF";
import React from "react";
import { readFile } from "fs/promises";
import { PDFDocument } from "pdf-lib";
import { resolveUploadPath } from "@/lib/resolve-upload-path";
import { getFeatures } from "@/lib/features";
import { getTorqvoiceLogoDataUri } from "@/lib/torqvoice-branding";
import { formatDateForPdf } from "@/lib/format";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const [record, settings, org] = await Promise.all([
        db.serviceRecord.findFirst({
          where: { id, vehicle: { customer: { organizationId } } },
          include: {
            partItems: true,
            laborItems: true,
            attachments: true,
            payments: { orderBy: { date: "desc" } },
            vehicle: {
              select: {
                make: true,
                model: true,
                year: true,
                vin: true,
                licensePlate: true,
                mileage: true,
                customer: {
                  select: {
                    name: true,
                    email: true,
                    phone: true,
                    address: true,
                    company: true,
                  },
                },
              },
            },
          },
        }),
        db.appSetting.findMany({
          where: { organizationId },
        }),
        db.organization.findUnique({
          where: { id: organizationId },
          select: { name: true, portalSlug: true },
        }),
      ]);

      if (!record) {
        return NextResponse.json({ error: "Work order not found" }, { status: 404 });
      }

      // Build settings map
      const settingsMap: Record<string, string> = {};
      for (const s of settings) settingsMap[s.key] = s.value;

      // Load PDF translations (default to English)
      let pdfMessages: Record<string, Record<string, string>>;
      try {
        pdfMessages = (await import("../../../../../../../../messages/en/pdf.json")).default;
      } catch {
        pdfMessages = { invoice: {}, common: {} };
      }
      const labels = { ...pdfMessages.invoice, ...pdfMessages.common };

      // Process attachments
      const imageAttachments: { fileName: string; dataUri: string; description?: string }[] = [];
      const otherAttachments: { fileName: string; fileType: string }[] = [];
      const pdfAttachments: { fileName: string; buffer: Buffer }[] = [];

      const seenNames = new Set<string>();
      const uniqueAttachments = record.attachments
        .filter((att) => att.includeInInvoice !== false)
        .filter((att) => {
          if (seenNames.has(att.fileName)) return false;
          seenNames.add(att.fileName);
          return true;
        });

      for (const att of uniqueAttachments) {
        if (att.fileType.startsWith("image/")) {
          try {
            const filePath = resolveUploadPath(att.fileUrl);
            const buffer = await readFile(filePath);
            const base64 = buffer.toString("base64");
            imageAttachments.push({
              fileName: att.fileName,
              dataUri: `data:${att.fileType};base64,${base64}`,
              description: att.description || undefined,
            });
          } catch {
            otherAttachments.push({ fileName: att.fileName, fileType: att.fileType });
          }
        } else if (att.fileType === "application/pdf") {
          try {
            const filePath = resolveUploadPath(att.fileUrl);
            const buffer = await readFile(filePath);
            pdfAttachments.push({ fileName: att.fileName, buffer });
          } catch {
            otherAttachments.push({ fileName: att.fileName, fileType: att.fileType });
          }
        } else {
          otherAttachments.push({ fileName: att.fileName, fileType: att.fileType });
        }
      }

      // Load company logo
      let logoDataUri: string | undefined;
      const logoPath = settingsMap["workshop.logo"];
      if (logoPath) {
        try {
          const fullPath = resolveUploadPath(logoPath);
          const logoBuffer = await readFile(fullPath);
          const ext = logoPath.split(".").pop()?.toLowerCase() || "png";
          const mimeMap: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };
          logoDataUri = `data:${mimeMap[ext] || "image/png"};base64,${logoBuffer.toString("base64")}`;
        } catch {
          // skip
        }
      }

      const invoiceSettings = {
        bankAccount: settingsMap["invoice.bankAccount"] || "",
        orgNumber: settingsMap["invoice.orgNumber"] || "",
        paymentTerms: settingsMap["invoice.paymentTerms"] || "",
        footerNote: settingsMap["invoice.footerNote"] || "",
        showBankAccount: settingsMap["invoice.showBankAccount"] === "true",
        showOrgNumber: settingsMap["invoice.showOrgNumber"] === "true",
        dueDays: Number(settingsMap["invoice.dueDays"]) || 0,
        currencyCode: settingsMap["workshop.currencyCode"] || "USD",
        unitSystem: settingsMap["workshop.unitSystem"] || "imperial",
        dateFormat: settingsMap["workshop.dateFormat"] || undefined,
        timezone: settingsMap["workshop.timezone"] || undefined,
      };

      // Payment summary
      const pdfDateFormat = settingsMap["workshop.dateFormat"] || undefined;
      const pdfTimezone = settingsMap["workshop.timezone"] || undefined;
      const paidFromPayments = record.payments?.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0) ?? 0;
      const effectiveTotal = record.totalAmount > 0 ? record.totalAmount : record.cost;
      const totalPaidForPdf = record.manuallyPaid ? effectiveTotal : paidFromPayments;

      const paymentSummary = (record.payments && record.payments.length > 0) || record.manuallyPaid
        ? {
            totalPaid: totalPaidForPdf,
            payments: (record.payments || []).map((p: { amount: number; date: Date; method: string }) => ({
              amount: p.amount,
              date: formatDateForPdf(p.date, pdfDateFormat, pdfTimezone),
              method: p.method,
            })),
          }
        : undefined;

      const template = {
        primaryColor: settingsMap["invoice.primaryColor"] || "#d97706",
        fontFamily: settingsMap["invoice.fontFamily"] || "Helvetica",
        showLogo: (settingsMap["invoice.showLogo"] ?? settingsMap["invoice.template.showLogo"]) !== "false",
        showCompanyName: settingsMap["invoice.showCompanyName"] !== "false",
        headerStyle: settingsMap["invoice.headerStyle"] || "standard",
      };

      const features = await getFeatures(organizationId);
      let torqvoiceLogoDataUri: string | undefined;
      if (!features.brandingRemoved) {
        torqvoiceLogoDataUri = await getTorqvoiceLogoDataUri();
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const portalSlug = org?.portalSlug;
      const portalEnabled = settingsMap["portal.enabled"] === "true";
      const portalUrl = portalEnabled
        ? `${appUrl}/portal/${portalSlug || organizationId}`
        : undefined;

      const element = React.createElement(InvoicePDF, {
        data: record,
        workshop: {
          name: org?.name || "",
          address: settingsMap["workshop.address"] || "",
          phone: settingsMap["workshop.phone"] || "",
          email: settingsMap["workshop.email"] || "",
        },
        invoiceSettings,
        paymentSummary,
        imageAttachments,
        otherAttachments,
        pdfAttachmentNames: pdfAttachments.map((a) => a.fileName),
        logoDataUri,
        template,
        torqvoiceLogoDataUri,
        portalUrl,
        labels,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;
      const invoiceBuffer = await renderToBuffer(element);

      const invoiceNum = record.invoiceNumber || `INV-${record.id.slice(-8).toUpperCase()}`;

      // Merge attached PDFs
      let finalBuffer: ArrayBuffer;
      if (pdfAttachments.length > 0) {
        const mergedPdf = await PDFDocument.load(invoiceBuffer);
        for (const att of pdfAttachments) {
          try {
            const attachedPdf = await PDFDocument.load(att.buffer);
            const pages = await mergedPdf.copyPages(attachedPdf, attachedPdf.getPageIndices());
            for (const page of pages) {
              mergedPdf.addPage(page);
            }
          } catch {
            // Skip corrupted PDFs
          }
        }
        const saved = await mergedPdf.save();
        finalBuffer = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer;
      } else {
        finalBuffer = invoiceBuffer.buffer.slice(invoiceBuffer.byteOffset, invoiceBuffer.byteOffset + invoiceBuffer.byteLength) as ArrayBuffer;
      }

      return new NextResponse(finalBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${invoiceNum}.pdf"`,
        },
      });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.SERVICES },
      ],
    },
  );
}
