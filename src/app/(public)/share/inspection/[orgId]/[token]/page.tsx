import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { InspectionView } from "./inspection-view";
import { getFeatures } from "@/lib/features";
import { resolvePortalOrg } from "@/lib/portal-slug";
import type { Metadata } from "next";

export const revalidate = 60;

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PublicInspectionPage({
  params,
}: {
  params: Promise<{ orgId: string; token: string }>;
}) {
  const { orgId: orgParam, token } = await params;

  // Resolve slug (e.g. "egelandauto") or UUID to the real org ID
  const resolvedOrg = await resolvePortalOrg(orgParam);
  const orgId = resolvedOrg?.id ?? orgParam;

  const inspection = await db.inspection.findFirst({
    where: { publicToken: token, organizationId: orgId },
    include: {
      vehicle: {
        select: {
          make: true,
          model: true,
          year: true,
          vin: true,
          licensePlate: true,
          mileage: true,
          customer: { select: { name: true, email: true, phone: true } },
        },
      },
      template: { select: { name: true } },
      items: { orderBy: { sortOrder: "asc" } },
      quotes: {
        where: { publicToken: { not: null } },
        select: { publicToken: true },
        take: 1,
      },
    },
  });

  if (!inspection) {
    notFound();
  }

  const [settings, org, features, existingRequest] = await Promise.all([
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
            "invoice.primaryColor",
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
    db.inspectionQuoteRequest.findFirst({
      where: { inspectionId: inspection.id, status: "pending" },
      select: { id: true },
    }),
  ]);

  const settingsMap: Record<string, string> = {};
  for (const s of settings) settingsMap[s.key] = s.value;

  const workshop = {
    name: org?.name || "",
    address: settingsMap["workshop.address"] || "",
    phone: settingsMap["workshop.phone"] || "",
    email: settingsMap["workshop.email"] || "",
  };

  // Rewrite logo URL for public access
  const rawLogoUrl = settingsMap["workshop.logo"] || "";
  let logoUrl = "";
  if (rawLogoUrl) {
    const match = rawLogoUrl.match(/^\/api\/files\/[^/]+\/(.+)$/);
    if (match) logoUrl = `/api/public/files/${token}/${match[1]}`;
    else logoUrl = rawLogoUrl;
  }

  const primaryColor = settingsMap["invoice.primaryColor"] || "#d97706";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const portalSlug = org?.portalSlug;
  const portalEnabled = settingsMap["portal.enabled"] === "true";
  const portalUrl = portalEnabled
    ? `${appUrl}/portal/${portalSlug || orgId}`
    : undefined;

  // Rewrite image URLs on inspection items for public access
  const publicInspection = {
    ...inspection,
    items: inspection.items.map((item) => ({
      ...item,
      imageUrls: item.imageUrls.map((url) => {
        const match = url.match(/^\/api\/files\/[^/]+\/(.+)$/);
        if (match) return `/api/public/files/${token}/${match[1]}`;
        return url;
      }),
    })),
  };

  const linkedQuote = inspection.quotes?.[0];
  const quoteShareUrl = linkedQuote?.publicToken
    ? `/share/quote/${orgId}/${linkedQuote.publicToken}`
    : undefined;

  return (
    <InspectionView
      inspection={publicInspection}
      workshop={workshop}
      logoUrl={logoUrl}
      primaryColor={primaryColor}
      showTorqvoiceBranding={!features.brandingRemoved}
      dateFormat={settingsMap["workshop.dateFormat"] || undefined}
      timezone={settingsMap["workshop.timezone"] || undefined}
      publicToken={token}
      orgId={orgId}
      hasExistingQuoteRequest={!!existingRequest}
      quoteShareUrl={quoteShareUrl}
      portalUrl={portalUrl}
    />
  );
}
