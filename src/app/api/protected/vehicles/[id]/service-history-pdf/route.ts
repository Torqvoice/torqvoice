import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import "@/features/vehicles/Components/invoice-pdf/fonts";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/get-auth-context";
import { db } from "@/lib/db";
import { ServiceHistoryPDF } from "@/features/vehicles/Components/service-history-pdf/ServiceHistoryPDF";
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
      ...pdfMessages.invoice,
      ...pdfMessages.common,
      ...(pdfMessages.serviceHistory || {}),
    };

    const { id } = await params;

    const [vehicle, settings, org] = await Promise.all([
      db.vehicle.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: {
          id: true,
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
              company: true,
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

    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    // Fetch all service records for this vehicle, ordered by date descending
    const records = await db.serviceRecord.findMany({
      where: { vehicleId: id },
      orderBy: { serviceDate: "desc" },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        serviceDate: true,
        mileage: true,
        techName: true,
        invoiceNumber: true,
        cost: true,
        totalAmount: true,
        partItems: {
          select: { name: true, quantity: true, unitPrice: true, total: true },
        },
        laborItems: {
          select: { description: true, hours: true, rate: true, total: true },
        },
      },
    });

    // Build settings map
    const settingsMap: Record<string, string> = {};
    for (const s of settings) settingsMap[s.key] = s.value;

    // Override labels for marine service type
    const serviceType = settingsMap["workshop.serviceType"] || "automotive";
    if (serviceType === "marine") {
      if (pdfMessages.invoice.mileageMarine) labels.mileage = pdfMessages.invoice.mileageMarine;
      if (pdfMessages.invoice.vinMarine) labels.vin = pdfMessages.invoice.vinMarine;
      if (pdfMessages.invoice.plateMarine) labels.plate = pdfMessages.invoice.plateMarine;
      if (pdfMessages.invoice.vehicleMarine) labels.vehicle = pdfMessages.invoice.vehicleMarine;
      labels.km = "hrs";
      labels.mi = "hrs";
      labels.mileageCol = labels.mileageColMarine || "Engine Hrs";
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
      currencyCode: settingsMap["workshop.currencyCode"] || "USD",
      unitSystem: settingsMap["workshop.unitSystem"] || "imperial",
      dateFormat: settingsMap["workshop.dateFormat"] || undefined,
      timezone: settingsMap["workshop.timezone"] || undefined,
    };

    const templateConfig = {
      primaryColor: settingsMap["invoice.primaryColor"] || settingsMap["invoice.template.primaryColor"] || "#d97706",
      fontFamily: settingsMap["invoice.fontFamily"] || settingsMap["invoice.template.fontFamily"] || "Helvetica",
      showLogo: (settingsMap["invoice.showLogo"] ?? settingsMap["invoice.template.showLogo"]) !== "false",
      showCompanyName: settingsMap["invoice.showCompanyName"] !== "false",
      logoSize: Number(settingsMap["invoice.logoSize"]) || 100,
    };

    // Check if Torqvoice branding should be shown
    const features = await getFeatures(ctx.organizationId);
    let torqvoiceLogoDataUri: string | undefined;
    if (!features.brandingRemoved) {
      torqvoiceLogoDataUri = await getTorqvoiceLogoDataUri();
    }

    const element = React.createElement(ServiceHistoryPDF, {
      vehicle,
      records,
      workshop: {
        name: org?.name || "",
        address: settingsMap["workshop.address"] || "",
        phone: settingsMap["workshop.phone"] || "",
        email: settingsMap["workshop.email"] || "",
      },
      invoiceSettings,
      logoDataUri,
      template: templateConfig,
      torqvoiceLogoDataUri,
      labels,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    const pdfBuffer = await renderToBuffer(element);

    const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    const fileName = `Service-History-${vehicleName.replace(/\s+/g, "-")}`;

    const finalBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength
    ) as ArrayBuffer;

    return new NextResponse(finalBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[Service History PDF] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
