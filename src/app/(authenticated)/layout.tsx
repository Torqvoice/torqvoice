import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SearchCommand } from "@/features/search/Components/SearchCommand";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures, isCloudMode } from "@/lib/features";
import { WhiteLabelCtaProvider } from "@/components/white-label-cta-context";
import { DateSettingsProvider } from "@/components/date-settings-context";

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

  return (
    <DateSettingsProvider
      dateFormat={data.dateFormat}
      timeFormat={data.timeFormat}
      timezone={data.timezone}
    >
    <WhiteLabelCtaProvider show={showWhiteLabelCta}>
    <SidebarProvider
      style={
        {
          "--sidebar-width": "19rem",
        } as React.CSSProperties
      }
    >
      <ConfirmProvider>
        <AppSidebar
          companyLogo={data.companyLogo}
          organizations={data.organizations}
          activeOrgId={data.organizationId}
          isSuperAdmin={data.isSuperAdmin}
          features={features}
        />
        <SidebarInset>{children}</SidebarInset>
        <SearchCommand />
      </ConfirmProvider>
    </SidebarProvider>
    </WhiteLabelCtaProvider>
    </DateSettingsProvider>
  );
}
