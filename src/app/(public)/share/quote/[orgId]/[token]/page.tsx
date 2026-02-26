import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { QuoteView } from "./quote-view";
import { getFeatures } from "@/lib/features";
import { resolvePortalOrg } from "@/lib/portal-slug";
import type { Metadata } from "next";

export const revalidate = 60;

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ orgId: string; token: string }>;
}) {
  const { orgId: orgParam, token } = await params;

  // Resolve slug (e.g. "egelandauto") or UUID to the real org ID
  const resolvedOrg = await resolvePortalOrg(orgParam);
  const orgId = resolvedOrg?.id ?? orgParam;

  const quote = await db.quote.findFirst({
    where: { publicToken: token, organizationId: orgId },
    include: {
      partItems: true,
      laborItems: true,
      attachments: true,
      customer: {
        select: {
          name: true,
          email: true,
          phone: true,
          address: true,
          company: true,
        },
      },
      vehicle: {
        select: {
          make: true,
          model: true,
          year: true,
          vin: true,
          licensePlate: true,
        },
      },
    },
  });

  if (!quote) {
    notFound();
  }

  const [settings, org, features] = await Promise.all([
    db.appSetting.findMany({
      where: {
        organizationId: orgId,
        key: {
          in: [
            "workshop.address",
            "workshop.phone",
            "workshop.email",
            "workshop.logo",
            "workshop.currencyCode",
            "workshop.dateFormat",
            "workshop.timezone",
            "quote.primaryColor",
            "quote.headerStyle",
            "invoice.primaryColor",
            "invoice.headerStyle",
            "portal.enabled",
          ],
        },
      },
    }),
    db.organization.findUnique({
      where: { id: orgId },
      select: { name: true, portalSlug: true },
    }),
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

  // Rewrite logo URL for public access
  const rawLogoUrl = settingsMap["workshop.logo"] || "";
  let logoUrl = "";
  if (rawLogoUrl) {
    const match = rawLogoUrl.match(/^\/api\/files\/[^/]+\/(.+)$/);
    if (match) logoUrl = `/api/public/files/${token}/${match[1]}`;
    else logoUrl = rawLogoUrl;
  }

  // Rewrite attachment URLs for public access
  const imageAttachments = (quote.attachments || [])
    .filter((a) => a.category === "image")
    .map((a) => ({
      ...a,
      fileUrl: a.fileUrl.replace(
        /^\/api\/protected\/files\/[^/]+\//,
        `/api/public/files/${token}/`
      ),
    }));
  const documentAttachments = (quote.attachments || [])
    .filter((a) => a.category === "document")
    .map((a) => ({
      ...a,
      fileUrl: a.fileUrl.replace(
        /^\/api\/protected\/files\/[^/]+\//,
        `/api/public/files/${token}/`
      ),
    }));

  const primaryColor = settingsMap["quote.primaryColor"] || settingsMap["invoice.primaryColor"] || "#d97706";
  const headerStyle = settingsMap["quote.headerStyle"] || settingsMap["invoice.headerStyle"] || "standard";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const portalSlug = org?.portalSlug;
  const portalEnabled = settingsMap["portal.enabled"] === "true";
  const portalUrl = portalEnabled
    ? `${appUrl}/portal/${portalSlug || orgId}`
    : undefined;

  return (
    <QuoteView
      quote={quote}
      workshop={workshop}
      currencyCode={currencyCode}
      orgId={orgId}
      token={token}
      logoUrl={logoUrl}
      showTorqvoiceBranding={!features.brandingRemoved}
      dateFormat={settingsMap["workshop.dateFormat"] || undefined}
      timezone={settingsMap["workshop.timezone"] || undefined}
      primaryColor={primaryColor}
      headerStyle={headerStyle}
      portalUrl={portalUrl}
      imageAttachments={imageAttachments}
      documentAttachments={documentAttachments}
    />
  );
}
