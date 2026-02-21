import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { InvoiceView } from "./invoice-view";
import { getFeatures } from "@/lib/features";
import type { Metadata } from "next";

/** Rewrites /api/files/[orgId]/[category]/[filename] to /api/v1/files/[token]/[category]/[filename] */
function toPublicFileUrl(fileUrl: string, token: string): string {
  const match = fileUrl.match(/^\/api\/files\/[^/]+\/(.+)$/);
  if (match) return `/api/v1/files/${token}/${match[1]}`;
  // Legacy URLs pass through as-is
  return fileUrl;
}

export const revalidate = 60;

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ orgId: string; token: string }>;
}) {
  const { orgId, token } = await params;

  const record = await db.serviceRecord.findUnique({
    where: { publicToken: token },
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
    notFound();
  }

  // Fetch workshop settings and features
  const [settings, org, features] = await Promise.all([
    db.appSetting.findMany({
      where: {
        organizationId: record.vehicle.organizationId,
        key: {
          in: [
            "workshop.address",
            "workshop.phone",
            "workshop.email",
            "workshop.logo",
            "workshop.currencyCode",
            "invoice.bankAccount",
            "invoice.orgNumber",
            "invoice.paymentTerms",
            "invoice.footerNote",
            "invoice.showBankAccount",
            "invoice.showOrgNumber",
            "invoice.dueDays",
            "invoice.showLogo",
            "invoice.showCompanyName",
            "invoice.primaryColor",
            "invoice.headerStyle",
            "payment.providersEnabled",
            "payment.termsOfSale",
            "payment.termsOfSaleUrl",
            "workshop.dateFormat",
            "workshop.timezone",
          ],
        },
      },
    }),
    record.vehicle.organizationId
      ? db.organization.findUnique({
          where: { id: record.vehicle.organizationId },
          select: { name: true },
        })
      : null,
    getFeatures(orgId),
  ]);

  const settingsMap: Record<string, string> = {};
  for (const s of settings) settingsMap[s.key] = s.value;

  const workshop = {
    name: org?.name || "",
    address: settingsMap["workshop.address"] || "",
    phone: settingsMap["workshop.phone"] || "",
    email: settingsMap["workshop.email"] || "",
  };

  const currencyCode = settingsMap["workshop.currencyCode"] || "USD";

  const invoiceSettings = {
    bankAccount: settingsMap["invoice.bankAccount"] || "",
    orgNumber: settingsMap["invoice.orgNumber"] || "",
    paymentTerms: settingsMap["invoice.paymentTerms"] || "",
    footerNote: settingsMap["invoice.footerNote"] || "",
    showBankAccount: settingsMap["invoice.showBankAccount"] !== "false",
    showOrgNumber: settingsMap["invoice.showOrgNumber"] !== "false",
    dueDays: Number(settingsMap["invoice.dueDays"]) || 0,
  };

  const showLogo = settingsMap["invoice.showLogo"] !== "false";
  const showCompanyName = settingsMap["invoice.showCompanyName"] !== "false";
  const rawLogoUrl = settingsMap["workshop.logo"] || "";
  const logoUrl = rawLogoUrl ? toPublicFileUrl(rawLogoUrl, token) : "";

  // Determine which online payment providers are enabled for this org
  const enabledProvidersRaw = settingsMap["payment.providersEnabled"] || "";
  const enabledProviders = enabledProvidersRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Rewrite attachment file URLs to use the public file route (no auth required)
  // Only include attachments marked for invoice display
  const publicRecord = {
    ...record,
    attachments: record.attachments
      .filter((att) => att.includeInInvoice !== false)
      .map((att) => ({
        ...att,
        fileUrl: toPublicFileUrl(att.fileUrl, token),
      })),
  };

  const termsOfSaleUrl = settingsMap["payment.termsOfSaleUrl"]
    || (settingsMap["payment.termsOfSale"] ? `/share/terms/${orgId}` : undefined);

  return (
    <InvoiceView
      record={publicRecord}
      workshop={workshop}
      currencyCode={currencyCode}
      orgId={orgId}
      token={token}
      enabledProviders={enabledProviders}
      invoiceSettings={invoiceSettings}
      logoUrl={logoUrl}
      showLogo={showLogo}
      showCompanyName={showCompanyName}
      showTorqvoiceBranding={!features.brandingRemoved}
      dateFormat={settingsMap["workshop.dateFormat"] || undefined}
      timezone={settingsMap["workshop.timezone"] || undefined}
      termsOfSaleUrl={termsOfSaleUrl}
      primaryColor={settingsMap["invoice.primaryColor"] || "#d97706"}
      headerStyle={settingsMap["invoice.headerStyle"] || "standard"}
    />
  );
}
