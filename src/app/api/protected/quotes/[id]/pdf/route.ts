import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getAuthContext } from "@/lib/get-auth-context";
import { db } from "@/lib/db";
import { QuotePDF } from "@/features/quotes/Components/QuotePDF";
import React from "react";
import { readFile } from "fs/promises";
import { PDFDocument } from "pdf-lib";
import { resolveUploadPath } from "@/lib/resolve-upload-path";
import { getFeatures } from "@/lib/features";
import { getTorqvoiceLogoDataUri } from "@/lib/torqvoice-branding";

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

    const [quote, settings, org] = await Promise.all([
      db.quote.findFirst({
        where: { id, organizationId: ctx.organizationId },
        include: {
          partItems: true,
          laborItems: true,
          attachments: true,
          customer: { select: { name: true, email: true, phone: true, address: true, company: true } },
          vehicle: { select: { make: true, model: true, year: true, vin: true, licensePlate: true } },
        },
      }),
      db.appSetting.findMany({ where: { organizationId: ctx.organizationId } }),
      db.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { name: true },
      }),
    ]);

    if (!quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    const settingsMap: Record<string, string> = {};
    for (const s of settings) settingsMap[s.key] = s.value;

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
        // Skip
      }
    }

    // Process attachments for PDF
    const imageAttachments: { fileName: string; dataUri: string; description?: string }[] = [];
    const otherAttachments: { fileName: string; fileType: string }[] = [];
    const pdfAttachments: { fileName: string; buffer: Buffer }[] = [];

    const seenNames = new Set<string>();
    const uniqueAttachments = (quote.attachments || [])
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

    // Check if Torqvoice branding should be shown
    const features = await getFeatures(ctx.organizationId);
    let torqvoiceLogoDataUri: string | undefined;
    if (!features.brandingRemoved) {
      torqvoiceLogoDataUri = await getTorqvoiceLogoDataUri();
    }

    const template = {
      primaryColor: settingsMap["quote.primaryColor"] || settingsMap["invoice.primaryColor"] || "#d97706",
      fontFamily: settingsMap["quote.fontFamily"] || settingsMap["invoice.fontFamily"] || "Helvetica",
      showLogo: settingsMap["invoice.showLogo"] !== "false",
      showCompanyName: settingsMap["invoice.showCompanyName"] !== "false",
      headerStyle: settingsMap["quote.headerStyle"] || settingsMap["invoice.headerStyle"] || "standard",
    };

    const element = React.createElement(QuotePDF, {
      data: quote,
      workshop: {
        name: org?.name || "",
        address: settingsMap["workshop.address"] || "",
        phone: settingsMap["workshop.phone"] || "",
        email: settingsMap["workshop.email"] || "",
      },
      currencyCode: settingsMap["workshop.currencyCode"] || "USD",
      logoDataUri,
      torqvoiceLogoDataUri,
      dateFormat: settingsMap["workshop.dateFormat"] || undefined,
      timezone: settingsMap["workshop.timezone"] || undefined,
      template,
      imageAttachments,
      otherAttachments,
      pdfAttachmentNames: pdfAttachments.map((a) => a.fileName),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    const quoteBuffer = await renderToBuffer(element);

    const quoteNum = quote.quoteNumber || `QT-${quote.id.slice(-8).toUpperCase()}`;

    // Merge attached PDFs into the quote PDF
    let finalBuffer: ArrayBuffer;
    if (pdfAttachments.length > 0) {
      const mergedPdf = await PDFDocument.load(quoteBuffer);
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
      finalBuffer = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer;
    } else {
      finalBuffer = quoteBuffer.buffer.slice(quoteBuffer.byteOffset, quoteBuffer.byteOffset + quoteBuffer.byteLength) as ArrayBuffer;
    }

    return new NextResponse(finalBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${quoteNum}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[Quote PDF] Error:", error);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
