import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { InvoicePDF } from "@/features/vehicles/Components/InvoicePDF";
import React from "react";
import { readFile } from "fs/promises";
import { resolveUploadPath } from "@/lib/resolve-upload-path";
import { getFeatures } from "@/lib/features";
import { getTorqvoiceLogoDataUri } from "@/lib/torqvoice-branding";
import { rateLimit } from "@/lib/rate-limit";
import { formatDateForPdf } from "@/lib/format";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string; token: string }> }
) {
  const limited = rateLimit(_request, { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const { orgId, token } = await params;

    const record = await db.serviceRecord.findUnique({
      where: { publicToken: token },
      include: {
        partItems: true,
        laborItems: true,
        payments: { orderBy: { date: "desc" } },
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
            vin: true,
            licensePlate: true,
            mileage: true,
            userId: true,
            organizationId: true,
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
    });

    if (!record || record.vehicle.organizationId !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [settings, org] = await Promise.all([
      db.appSetting.findMany({
        where: { organizationId: record.vehicle.organizationId },
      }),
      record.vehicle.organizationId
        ? db.organization.findUnique({
            where: { id: record.vehicle.organizationId },
            select: { name: true },
          })
        : null,
    ]);

    const settingsMap: Record<string, string> = {};
    for (const s of settings) settingsMap[s.key] = s.value;

    // Load logo
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

    const pdfDateFormat = settingsMap["workshop.dateFormat"] || undefined;
    const pdfTimezone = settingsMap["workshop.timezone"] || undefined;

    const paymentSummary = record.payments.length > 0
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
      primaryColor: settingsMap["invoice.primaryColor"] || "#d97706",
      fontFamily: settingsMap["invoice.fontFamily"] || "Helvetica",
      showLogo: settingsMap["invoice.showLogo"] !== "false",
      showCompanyName: settingsMap["invoice.showCompanyName"] !== "false",
      headerStyle: settingsMap["invoice.headerStyle"] || "standard",
    };

    // Check if Torqvoice branding should be shown
    const features = await getFeatures(record.vehicle.organizationId);
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
      logoDataUri,
      template,
      torqvoiceLogoDataUri,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    const buffer = await renderToBuffer(element);

    const invoiceNum = record.invoiceNumber || `INV-${record.id.slice(-8).toUpperCase()}`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoiceNum}.pdf"`,
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    console.error("[Public PDF] Error:", error);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
