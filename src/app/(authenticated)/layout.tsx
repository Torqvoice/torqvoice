import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SearchCommand } from "@/features/search/Components/SearchCommand";
import { NotificationInitializer } from "@/features/notifications/Components/NotificationInitializer";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures, isCloudMode } from "@/lib/features";
import { WhiteLabelCtaProvider } from "@/components/white-label-cta-context";
import { DateSettingsProvider } from "@/components/date-settings-context";
import { getCachedMembership } from "@/lib/cached-session";
import { hasPermission, PermissionAction, PermissionSubject } from "@/lib/permissions";
import { OnlineTracker } from "@/components/online-tracker";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  const features = await getFeatures(data.organizationId);
  const showWhiteLabelCta = !isCloudMode() && !features.brandingRemoved;

  // Determine if user can access settings and reports
  const isOwnerOrAdmin = data.role === "owner" || data.role === "admin" || data.role === "super_admin";
  let canAccessSettings = isOwnerOrAdmin;
  let canAccessReports = isOwnerOrAdmin;
  if (!isOwnerOrAdmin) {
    const membership = await getCachedMembership(data.userId);
    // Members without a custom role have full access
    if (!membership?.roleId) {
      canAccessSettings = true;
      canAccessReports = true;
    } else {
      const userPermissions = membership?.customRole?.permissions ?? [];
      canAccessSettings = hasPermission(userPermissions, {
        action: PermissionAction.READ,
        subject: PermissionSubject.SETTINGS,
      });
      canAccessReports = hasPermission(userPermissions, {
        action: PermissionAction.READ,
        subject: PermissionSubject.REPORTS,
      });
    }
  }

  return (
    <WhiteLabelCtaProvider show={showWhiteLabelCta}>
    <SidebarProvider
      style={
        {
          "--sidebar-width": "19rem",
        } as React.CSSProperties
      }
    >
      <DateSettingsProvider
        dateFormat={data.dateFormat}
        timeFormat={data.timeFormat}
        timezone={data.timezone}
      >
      <ConfirmProvider>
        <AppSidebar
          companyLogo={data.companyLogo}
          organizations={data.organizations}
          activeOrgId={data.organizationId}
          isSuperAdmin={data.isSuperAdmin}
          features={features}
          canAccessSettings={canAccessSettings}
          canAccessReports={canAccessReports}
          isAdminOrOwner={isOwnerOrAdmin}
        />
        <SidebarInset>{children}</SidebarInset>
        <SearchCommand />
        {isOwnerOrAdmin && <NotificationInitializer />}
        <OnlineTracker />
      </ConfirmProvider>
      </DateSettingsProvider>
    </SidebarProvider>
    </WhiteLabelCtaProvider>
  );
}
