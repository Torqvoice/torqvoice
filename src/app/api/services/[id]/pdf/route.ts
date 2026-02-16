import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getAuthContext } from "@/lib/get-auth-context";
import { db } from "@/lib/db";
import { InvoicePDF } from "@/features/vehicles/Components/InvoicePDF";
import React from "react";
import { readFile } from "fs/promises";
import { PDFDocument } from "pdf-lib";
import { resolveUploadPath } from "@/lib/resolve-upload-path";
import { getFeatures } from "@/lib/features";
import { getTorqvoiceLogoDataUri } from "@/lib/torqvoice-branding";
import { formatDateForPdf } from "@/lib/format";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();

    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const [record, settings, org] = await Promise.all([
      db.serviceRecord.findFirst({
        where: { id, vehicle: { organizationId: ctx.organizationId } },
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
        where: { organizationId: ctx.organizationId },
      }),
      db.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { name: true },
      }),
    ]);

    if (!record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    // Build settings map
    const settingsMap: Record<string, string> = {};
    for (const s of settings) settingsMap[s.key] = s.value;

    // Load image attachments as base64 data URIs for PDF embedding
    const imageAttachments: { fileName: string; dataUri: string; description?: string }[] = [];
    const otherAttachments: { fileName: string; fileType: string }[] = [];
    const pdfAttachments: { fileName: string; buffer: Buffer }[] = [];

    // Only include attachments marked for invoice, then deduplicate by fileName
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
          const mimeType = att.fileType;
          imageAttachments.push({
            fileName: att.fileName,
            dataUri: `data:${mimeType};base64,${base64}`,
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

    // Load company logo as base64 data URI
    let logoDataUri: string | undefined;
    const logoPath = settingsMap["workshop.logo"];
    if (logoPath) {
      try {
        const fullPath = resolveUploadPath(logoPath);
        const logoBuffer = await readFile(fullPath);
        const ext = logoPath.split(".").pop()?.toLowerCase() || "png";
        const mimeMap: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };
        const mime = mimeMap[ext] || "image/png";
        logoDataUri = `data:${mime};base64,${logoBuffer.toString("base64")}`;
      } catch {
        // Logo file not found, skip
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

    // Build payment summary
    const pdfDateFormat = settingsMap["workshop.dateFormat"] || undefined;
    const pdfTimezone = settingsMap["workshop.timezone"] || undefined;

    const paymentSummary = record.payments && record.payments.length > 0
      ? {
          totalPaid: record.payments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0),
          payments: record.payments.map((p: { amount: number; date: Date; method: string }) => ({
            amount: p.amount,
            date: formatDateForPdf(p.date, pdfDateFormat, pdfTimezone),
            method: p.method,
          })),
        }
      : undefined;

    const template = {
      primaryColor: settingsMap["invoice.primaryColor"] || settingsMap["invoice.template.primaryColor"] || "#d97706",
      fontFamily: settingsMap["invoice.fontFamily"] || settingsMap["invoice.template.fontFamily"] || "Helvetica",
      showLogo: (settingsMap["invoice.showLogo"] ?? settingsMap["invoice.template.showLogo"]) !== "false",
      showCompanyName: settingsMap["invoice.showCompanyName"] !== "false",
      headerStyle: settingsMap["invoice.headerStyle"] || settingsMap["invoice.template.headerStyle"] || "standard",
    };

    // Check if Torqvoice branding should be shown
    const features = await getFeatures(ctx.organizationId);
    let torqvoiceLogoDataUri: string | undefined;
    if (!features.brandingRemoved) {
      torqvoiceLogoDataUri = await getTorqvoiceLogoDataUri();
    }

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    const invoiceBuffer = await renderToBuffer(element);

    const invoiceNum = record.invoiceNumber || `INV-${record.id.slice(-8).toUpperCase()}`;

    // Merge attached PDF diagnostic reports into the invoice
    let finalBytes: Uint8Array;
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
          // Skip corrupted/unreadable PDFs silently
        }
      }
      const saved = await mergedPdf.save();
      finalBytes = new Uint8Array(saved);
    } else {
      finalBytes = new Uint8Array(invoiceBuffer);
    }

    return new NextResponse(finalBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoiceNum}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[PDF Generation] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
