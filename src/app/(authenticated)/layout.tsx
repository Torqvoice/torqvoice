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
import { InstallBanner } from "@/components/pwa-install-prompt";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { ServiceTypeProvider } from "@/components/service-type-context";
import { LicenseExpiryProvider } from "@/components/license-expiry-context";
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

  // Check user-level messaging enabled settings
  let smsEnabled = false;
  let telegramEnabled = false;
  if (features.sms) {
    const smsSetting = await db.appSetting.findUnique({
      where: { organizationId_key: { organizationId: data.organizationId, key: "sms.provider" } },
      select: { value: true },
    });
    smsEnabled = !!smsSetting?.value;
  }
  if (features.telegram) {
    const tgSetting = await db.appSetting.findUnique({
      where: { organizationId_key: { organizationId: data.organizationId, key: "telegram.enabled" } },
      select: { value: true },
    });
    telegramEnabled = tgSetting?.value === "true";
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

  // Check license expiry (only for admin/owner with white-label)
  let daysUntilExpiry: number | null = null;
  let licenseExpiryDismissed = false;
  if (isOwnerOrAdmin && features.brandingRemoved) {
    const expirySettings = await db.appSetting.findMany({
      where: {
        organizationId: data.organizationId,
        key: { in: ["license.expiresAt", "license.valid", "license.expiryDismissed"] },
      },
      select: { key: true, value: true },
    });
    const expiryMap = new Map(expirySettings.map((s) => [s.key, s.value]));
    const expiresAt = expiryMap.get("license.expiresAt");
    const isValid = expiryMap.get("license.valid");
    licenseExpiryDismissed = expiryMap.get("license.expiryDismissed") === "true";
    if (expiresAt && isValid === "true") {
      const diff = new Date(expiresAt).getTime() - Date.now();
      daysUntilExpiry = Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
  }

  return (
    <ServiceTypeProvider serviceType={data.serviceType}>
    <LicenseExpiryProvider daysUntilExpiry={daysUntilExpiry} dismissed={licenseExpiryDismissed}>
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
          smsEnabled={smsEnabled}
          telegramEnabled={telegramEnabled}
          visibleSubjects={visibleSubjects}
          isAdminOrOwner={isOwnerOrAdmin}
        />
        <SidebarInset>
          <div className="pb-14 md:pb-0">{children}</div>
        </SidebarInset>
        <SearchCommand />
        {isOwnerOrAdmin && <NotificationInitializer />}
        <OnlineTracker />
        <InstallBanner />
      </ConfirmProvider>
      </DateSettingsProvider>
    </SidebarProvider>
    <MobileBottomNav isSuperAdmin={data.isSuperAdmin} />
    </WhiteLabelCtaProvider>
    </LicenseExpiryProvider>
    </ServiceTypeProvider>
  );
}
