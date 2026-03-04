import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { InvoicePDF } from "@/features/vehicles/Components/InvoicePDF";
import { sendOrgMail, getOrgFromAddress } from "@/lib/email";
import { requireFeature } from "@/lib/features";
import React from "react";
import { readFile } from "fs/promises";
import { resolveUploadPath } from "@/lib/resolve-upload-path";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getWorkshopSettings(organizationId: string) {
  const settings = await db.appSetting.findMany({ where: { organizationId } });
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  return map;
}

async function loadLogoDataUri(logoPath: string | undefined) {
  if (!logoPath) return undefined;
  try {
    const fullPath = resolveUploadPath(logoPath);
    const logoBuffer = await readFile(fullPath);
    const ext = logoPath.split(".").pop()?.toLowerCase() || "png";
    const mimeMap: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };
    return `data:${mimeMap[ext] || "image/png"};base64,${logoBuffer.toString("base64")}`;
  } catch {
    return undefined;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      await requireFeature(organizationId, "smtp");

      const body = await request.json();
      const { recipientEmail, message } = body as { recipientEmail: string; message?: string };

      if (!recipientEmail) {
        return NextResponse.json({ error: "recipientEmail is required" }, { status: 400 });
      }

      const record = await db.serviceRecord.findFirst({
        where: { id, vehicle: { customer: { organizationId } } },
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

      if (!record) {
        return NextResponse.json({ error: "Work order not found" }, { status: 404 });
      }

      const settings = await getWorkshopSettings(organizationId);
      if (settings["workshop.emailEnabled"] === "false") {
        return NextResponse.json({ error: "Email sending is disabled. Enable it in Settings." }, { status: 400 });
      }

      const logoDataUri = await loadLogoDataUri(settings["workshop.logo"]);
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
        invoiceSettings: { currencyCode: settings["workshop.currencyCode"] || "USD" },
        logoDataUri,
        template: invoiceTemplate,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;
      const pdfBuffer = await renderToBuffer(element);
      const invoiceNum = record.invoiceNumber || `INV-${record.id.slice(-8).toUpperCase()}`;

      // Build public invoice link if token exists
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const publicLink = record.publicToken
        ? `${appUrl}/share/invoice/${organizationId}/${record.publicToken}`
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
            ${message ? `<p>${escapeHtml(message)}</p>` : ""}
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

      return NextResponse.json({ sent: true });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    },
  );
}
