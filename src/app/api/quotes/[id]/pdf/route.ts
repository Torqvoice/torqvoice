import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getAuthContext } from "@/lib/get-auth-context";
import { db } from "@/lib/db";
import { QuotePDF } from "@/features/quotes/Components/QuotePDF";
import React from "react";
import { readFile } from "fs/promises";
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

    // Check if Torqvoice branding should be shown
    const features = await getFeatures(ctx.organizationId);
    let torqvoiceLogoDataUri: string | undefined;
    if (!features.brandingRemoved) {
      torqvoiceLogoDataUri = await getTorqvoiceLogoDataUri();
    }

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    const buffer = await renderToBuffer(element);

    const quoteNum = quote.quoteNumber || `QT-${quote.id.slice(-8).toUpperCase()}`;

    return new NextResponse(buffer.buffer as ArrayBuffer, {
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
