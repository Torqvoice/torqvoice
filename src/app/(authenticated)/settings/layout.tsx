import { PageHeader } from "@/components/page-header";
import { SettingsNav } from "./settings-nav";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures, isCloudMode } from "@/lib/features";
import { redirect } from "next/navigation";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  const features = await getFeatures(data.organizationId);

  return (
    <div className="flex h-svh flex-col">
      <PageHeader />
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 pt-0">
        <div className="shrink-0">
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-muted-foreground">
            Manage your workshop, invoices, and preferences
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-6 md:flex-row">
          <aside className="w-full shrink-0 overflow-y-auto md:w-56 lg:w-64">
            <SettingsNav features={features} isCloud={isCloudMode()} />
          </aside>
          <div className="min-w-0 flex-1 overflow-y-auto pb-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
