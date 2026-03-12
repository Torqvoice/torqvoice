import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SearchCommand } from "@/features/search/Components/SearchCommand";
import { NotificationInitializer } from "@/features/notifications/Components/NotificationInitializer";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures, isCloudMode } from "@/lib/features";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { WhiteLabelCtaProvider } from "@/components/white-label-cta-context";
import { DateSettingsProvider } from "@/components/date-settings-context";
import { getCachedMembership } from "@/lib/cached-session";
import { hasPermission, PermissionAction, PermissionSubject } from "@/lib/permissions";
import { OnlineTracker } from "@/components/online-tracker";
import { InstallBanner } from "@/components/pwa-install-prompt";
import { db } from "@/lib/db";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  // Check email verification requirement (super admins bypass this)
  if (!data.isSuperAdmin && !data.emailVerified) {
    const verificationSetting = await db.systemSetting.findUnique({
      where: { key: "email.verificationRequired" },
      select: { value: true },
    });
    if (verificationSetting?.value === "true") {
      redirect("/auth/verify-email");
    }
  }

  const features = await getFeatures(data.organizationId);
  const showWhiteLabelCta = !isCloudMode() && !features.brandingRemoved;

  // Check if AI is fully enabled (plan + settings + API key)
  let aiEnabled = false;
  if (features?.ai) {
    const aiSettings = await db.appSetting.findMany({
      where: {
        organizationId: data.organizationId,
        key: { in: [SETTING_KEYS.AI_ENABLED, SETTING_KEYS.AI_API_KEY] },
      },
      select: { key: true, value: true },
    });
    const aiMap = Object.fromEntries(aiSettings.map((s) => [s.key, s.value]));
    aiEnabled = aiMap[SETTING_KEYS.AI_ENABLED] === "true" && !!aiMap[SETTING_KEYS.AI_API_KEY];
  }

  // Determine which subjects the user can access (for sidebar visibility)
  const isOwnerOrAdmin = data.role === "owner" || data.role === "admin" || data.role === "super_admin";
  const allSubjects = Object.values(PermissionSubject);
  let visibleSubjects: string[] = allSubjects;

  if (!isOwnerOrAdmin) {
    const membership = await getCachedMembership(data.userId);
    // Members without a custom role have full access
    if (membership?.roleId) {
      const userPermissions = membership?.customRole?.permissions ?? [];
      visibleSubjects = allSubjects.filter((subject) =>
        hasPermission(userPermissions, {
          action: PermissionAction.READ,
          subject: subject as PermissionSubject,
        }),
      );
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
          aiEnabled={aiEnabled && visibleSubjects.includes(PermissionSubject.AI_ASSISTANT)}
          visibleSubjects={visibleSubjects}
          isAdminOrOwner={isOwnerOrAdmin}
        />
        <SidebarInset>{children}</SidebarInset>
        <SearchCommand />
        {isOwnerOrAdmin && <NotificationInitializer />}
        <OnlineTracker />
        <InstallBanner />
      </ConfirmProvider>
      </DateSettingsProvider>
    </SidebarProvider>
    </WhiteLabelCtaProvider>
  );
}
