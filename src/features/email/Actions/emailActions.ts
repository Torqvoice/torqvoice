"use server";

import { db } from "@/lib/db";
import { sendOrgMail, getOrgFromAddress } from "@/lib/email";
import { withAuth } from "@/lib/with-auth";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { readFile } from "fs/promises";
import { resolveUploadPath } from "@/lib/resolve-upload-path";
import { QuotePDF } from "@/features/quotes/Components/QuotePDF";
import { InvoicePDF } from "@/features/vehicles/Components/InvoicePDF";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { requireFeature } from "@/lib/features";

async function getWorkshopSettings(organizationId: string) {
  const [settings, org] = await Promise.all([
    db.appSetting.findMany({
      where: {
        organizationId,
        key: {
          in: [
            "workshop.address",
            "workshop.phone",
            "workshop.email",
            "workshop.logo",
            "workshop.currencyCode",
            "workshop.emailFromName",
            "workshop.emailEnabled",
            "invoice.primaryColor",
            "invoice.fontFamily",
            "invoice.showLogo",
            "invoice.showCompanyName",
            "invoice.headerStyle",
          ],
        },
      },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    }),
  ]);
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  map["workshop.name"] = org?.name || "";
  return map;
}

async function loadLogoDataUri(logoPath: string | undefined): Promise<string | undefined> {
  if (!logoPath) return undefined;
  try {
    const fullPath = resolveUploadPath(logoPath);
    const logoBuffer = await readFile(fullPath);
    const ext = logoPath.split(".").pop()?.toLowerCase() || "png";
    const mimeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      svg: "image/svg+xml",
    };
    const mime = mimeMap[ext] || "image/png";
    return `data:${mime};base64,${logoBuffer.toString("base64")}`;
  } catch {
    return undefined;
  }
}

export async function sendQuoteEmail(input: {
  quoteId: string;
  recipientEmail: string;
  message?: string;
}) {
  return withAuth(async ({ organizationId }) => {
    await requireFeature(organizationId, "smtp");

    const { quoteId, recipientEmail, message } = input;

    const quote = await db.quote.findFirst({
      where: { id: quoteId, organizationId },
      include: {
        partItems: true,
        laborItems: true,
        customer: { select: { name: true, email: true, phone: true, address: true, company: true } },
        vehicle: { select: { make: true, model: true, year: true, vin: true, licensePlate: true } },
      },
    });
    if (!quote) throw new Error("Quote not found");

    const settings = await getWorkshopSettings(organizationId);
    if (settings["workshop.emailEnabled"] === "false") {
      throw new Error("Email sending is disabled. Enable it in Settings.");
    }

    const logoDataUri = await loadLogoDataUri(settings["workshop.logo"]);
    const currencyCode = settings["workshop.currencyCode"] || "USD";
    const fromName = settings["workshop.emailFromName"] || settings["workshop.name"] || "Workshop";

    const template = {
      primaryColor: settings["invoice.primaryColor"] || "#d97706",
      fontFamily: settings["invoice.fontFamily"] || "Helvetica",
      showLogo: settings["invoice.showLogo"] !== "false",
      showCompanyName: settings["invoice.showCompanyName"] !== "false",
      headerStyle: settings["invoice.headerStyle"] || "standard",
    };

    // Generate PDF
    const element = React.createElement(QuotePDF, {
      data: quote,
      workshop: {
        name: settings["workshop.name"] || "",
        address: settings["workshop.address"] || "",
        phone: settings["workshop.phone"] || "",
        email: settings["workshop.email"] || "",
      },
      currencyCode,
      logoDataUri,
      template,
    }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(element);
    const quoteNum = quote.quoteNumber || `QT-${quote.id.slice(-8).toUpperCase()}`;

    const from = await getOrgFromAddress(organizationId);

    await sendOrgMail(organizationId, {
      from,
      to: recipientEmail,
      subject: `Quote ${quoteNum} - ${quote.title}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Quote ${quoteNum}</h2>
          <p>Please find your quote attached.</p>
          ${message ? `<p>${message}</p>` : ""}
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #666; font-size: 14px;">
            ${fromName}${settings["workshop.phone"] ? ` · ${settings["workshop.phone"]}` : ""}
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `${quoteNum}.pdf`,
          content: Buffer.from(pdfBuffer),
        },
      ],
    });

    // Update quote status to "sent" if still draft
    if (quote.status === "draft") {
      await db.quote.update({
        where: { id: quoteId },
        data: { status: "sent" },
      });
    }

    return { sent: true };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.QUOTES }] });
}

export async function sendInvoiceEmail(input: {
  serviceRecordId: string;
  recipientEmail: string;
  message?: string;
}) {
  return withAuth(async ({ organizationId }) => {
    await requireFeature(organizationId, "smtp");

    const { serviceRecordId, recipientEmail, message } = input;

    const record = await db.serviceRecord.findFirst({
      where: { id: serviceRecordId, vehicle: { organizationId } },
      include: {
        partItems: true,
        laborItems: true,
        vehicle: {
          include: {
            customer: { select: { name: true, email: true, phone: true, address: true, company: true } },
          },
        },
      },
    });
    if (!record) throw new Error("Service record not found");

    const settings = await getWorkshopSettings(organizationId);
    if (settings["workshop.emailEnabled"] === "false") {
      throw new Error("Email sending is disabled. Enable it in Settings.");
    }

    const logoDataUri = await loadLogoDataUri(settings["workshop.logo"]);
    const currencyCode = settings["workshop.currencyCode"] || "USD";
    const fromName = settings["workshop.emailFromName"] || settings["workshop.name"] || "Workshop";

    const invoiceTemplate = {
      primaryColor: settings["invoice.primaryColor"] || "#d97706",
      fontFamily: settings["invoice.fontFamily"] || "Helvetica",
      showLogo: settings["invoice.showLogo"] !== "false",
      showCompanyName: settings["invoice.showCompanyName"] !== "false",
      headerStyle: settings["invoice.headerStyle"] || "standard",
    };

    // Generate PDF
    const element = React.createElement(InvoicePDF, {
      data: record,
      workshop: {
        name: settings["workshop.name"] || "",
        address: settings["workshop.address"] || "",
        phone: settings["workshop.phone"] || "",
        email: settings["workshop.email"] || "",
      },
      invoiceSettings: { currencyCode },
      logoDataUri,
      template: invoiceTemplate,
    }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(element);
    const invoiceNum = record.invoiceNumber || `INV-${record.id.slice(-8).toUpperCase()}`;

    // Build public invoice link if token exists
    const publicLink = record.publicToken
      ? `${process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"}/share/invoice/${organizationId}/${record.publicToken}`
      : null;

    const from = await getOrgFromAddress(organizationId);

    await sendOrgMail(organizationId, {
      from,
      to: recipientEmail,
      subject: `Invoice ${invoiceNum} - ${record.title}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Invoice ${invoiceNum}</h2>
          <p>Please find your invoice attached.</p>
          ${message ? `<p>${message}</p>` : ""}
          ${publicLink ? `<p><a href="${publicLink}" style="color: #2563eb;">View Invoice Online</a></p>` : ""}
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #666; font-size: 14px;">
            ${fromName}${settings["workshop.phone"] ? ` · ${settings["workshop.phone"]}` : ""}
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `${invoiceNum}.pdf`,
          content: Buffer.from(pdfBuffer),
        },
      ],
    });

    return { sent: true };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES }] });
}
