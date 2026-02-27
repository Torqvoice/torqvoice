import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/get-auth-context";
import { db } from "@/lib/db";
import { InspectionPDF } from "@/features/inspections/Components/InspectionPDF";
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

    // Load locale-based PDF translations
    const cookieStore = await cookies();
    const locale = cookieStore.get("locale")?.value || "en";
    let pdfMessages: Record<string, Record<string, string>>;
    try {
      pdfMessages = (await import(`../../../../../../../messages/${locale}/pdf.json`)).default;
    } catch {
      pdfMessages = (await import(`../../../../../../../messages/en/pdf.json`)).default;
    }
    const labels = {
      ...pdfMessages.inspection,
      ...pdfMessages.common,
    };

    const { id } = await params;

    const [inspection, settings, org] = await Promise.all([
      db.inspection.findFirst({
        where: { id, organizationId: ctx.organizationId },
        include: {
          vehicle: {
            select: {
              make: true, model: true, year: true, vin: true,
              licensePlate: true, mileage: true,
              customer: { select: { name: true, email: true, phone: true } },
            },
          },
          template: { select: { name: true } },
          items: { orderBy: { sortOrder: "asc" } },
        },
      }),
      db.appSetting.findMany({ where: { organizationId: ctx.organizationId } }),
      db.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { name: true },
      }),
    ]);

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
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

    const features = await getFeatures(ctx.organizationId);
    let torqvoiceLogoDataUri: string | undefined;
    if (!features.brandingRemoved) {
      torqvoiceLogoDataUri = await getTorqvoiceLogoDataUri();
    }

    const template = {
      primaryColor: settingsMap["invoice.primaryColor"] || "#d97706",
      fontFamily: settingsMap["invoice.fontFamily"] || "Helvetica",
      showLogo: settingsMap["invoice.showLogo"] !== "false",
      showCompanyName: settingsMap["invoice.showCompanyName"] !== "false",
      headerStyle: settingsMap["invoice.headerStyle"] || "standard",
    };

    const element = React.createElement(InspectionPDF, {
      data: inspection,
      workshop: {
        name: org?.name || "",
        address: settingsMap["workshop.address"] || "",
        phone: settingsMap["workshop.phone"] || "",
        email: settingsMap["workshop.email"] || "",
      },
      logoDataUri,
      torqvoiceLogoDataUri,
      dateFormat: settingsMap["workshop.dateFormat"] || undefined,
      timezone: settingsMap["workshop.timezone"] || undefined,
      template,
      labels,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    const buffer = await renderToBuffer(element);

    const vehicleName = `${inspection.vehicle.year}-${inspection.vehicle.make}-${inspection.vehicle.model}`;
    const fileName = `Inspection-${vehicleName}.pdf`;

    return new NextResponse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("[Inspection PDF] Error:", error);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
