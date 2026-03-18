import { PageHeader } from "@/components/page-header";
import { SettingsNav } from "./settings-nav";
import { SettingsPermissionProvider } from "./settings-permission-context";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures, isCloudMode } from "@/lib/features";
import { redirect } from "next/navigation";
import { getCachedMembership } from "@/lib/cached-session";
import { hasPermission, PermissionAction, PermissionSubject } from "@/lib/permissions";
import { getTranslations } from "next-intl/server";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  // Check if user has settings access and edit permission
  const isOwnerOrAdmin = data.role === "owner" || data.role === "admin" || data.role === "super_admin";
  let canReadSettings = true;
  let canEditSettings = true;
  if (!isOwnerOrAdmin) {
    const membership = await getCachedMembership(data.userId);
    // Members with a custom role have restricted access based on permissions
    if (membership?.roleId) {
      const userPermissions = membership?.customRole?.permissions ?? [];
      canReadSettings = hasPermission(userPermissions, {
        action: PermissionAction.READ,
        subject: PermissionSubject.SETTINGS,
      });
      canEditSettings = hasPermission(userPermissions, {
        action: PermissionAction.UPDATE,
        subject: PermissionSubject.SETTINGS,
      });
      if (!canReadSettings) redirect("/");
    }
    // Members without a custom role keep full access (defaults to true)
  }

  const features = await getFeatures(data.organizationId);
  const t = await getTranslations("settings");

  return (
    <SettingsPermissionProvider canEdit={canEditSettings}>
      <div className="flex h-svh flex-col">
        <PageHeader />
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 pt-0">
          <div className="shrink-0">
            <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
            <p className="mt-1 text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-6 md:flex-row">
            <aside className="hidden shrink-0 overflow-y-auto md:block md:w-56 lg:w-64">
              <SettingsNav features={features} isCloud={isCloudMode()} />
            </aside>
            <div className="min-w-0 flex-1 overflow-y-auto pb-8">
              <div className="mb-4 md:hidden">
                <SettingsNav features={features} isCloud={isCloudMode()} mobile />
              </div>
              {children}
            </div>
          </div>
        </div>
      </div>
    </SettingsPermissionProvider>
  );
}
