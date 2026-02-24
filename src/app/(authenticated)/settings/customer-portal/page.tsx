import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures, isCloudMode } from "@/lib/features";
import { FeatureLockedMessage } from "../feature-locked-message";
import { CustomerPortalSettings } from "@/features/portal/Components/CustomerPortalSettings";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";

export default async function CustomerPortalSettingsPage() {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  const features = await getFeatures(data.organizationId);

  if (!features.customerPortal) {
    return (
      <FeatureLockedMessage
        feature="Customer Portal"
        description="Give your customers a self-service portal to view invoices, quotes, inspections, and request service."
        isCloud={isCloudMode()}
      />
    );
  }

  const [setting, org] = await Promise.all([
    db.appSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId: data.organizationId,
          key: SETTING_KEYS.PORTAL_ENABLED,
        },
      },
    }),
    db.organization.findUnique({
      where: { id: data.organizationId },
      select: { portalSlug: true },
    }),
  ]);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  return (
    <CustomerPortalSettings
      enabled={setting?.value === "true"}
      orgId={data.organizationId}
      portalSlug={org?.portalSlug ?? null}
      appUrl={appUrl}
    />
  );
}
