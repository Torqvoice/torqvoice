import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { InspectionView } from "./inspection-view";
import { getFeatures } from "@/lib/features";
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
  const { orgId, token } = await params;

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
    },
  });

  if (!inspection) {
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
            "invoice.primaryColor",
          ],
        },
      },
    }),
    db.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
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

  // Rewrite logo URL for public access
  const rawLogoUrl = settingsMap["workshop.logo"] || "";
  let logoUrl = "";
  if (rawLogoUrl) {
    const match = rawLogoUrl.match(/^\/api\/files\/[^/]+\/(.+)$/);
    if (match) logoUrl = `/api/files/public/${token}/${match[1]}`;
    else logoUrl = rawLogoUrl;
  }

  const primaryColor = settingsMap["invoice.primaryColor"] || "#d97706";

  return (
    <InspectionView
      inspection={inspection}
      workshop={workshop}
      logoUrl={logoUrl}
      primaryColor={primaryColor}
      showTorqvoiceBranding={!features.brandingRemoved}
      dateFormat={settingsMap["workshop.dateFormat"] || undefined}
      timezone={settingsMap["workshop.timezone"] || undefined}
    />
  );
}
