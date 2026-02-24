import { db } from "@/lib/db";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { PortalLoginForm } from "@/features/portal/Components/PortalLoginForm";
import { getCustomerSession } from "@/lib/customer-session";
import { redirect } from "next/navigation";
import { resolvePortalOrg } from "@/lib/portal-slug";

export default async function PortalLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { orgId: orgParam } = await params;
  const { error: authError } = await searchParams;

  // Resolve slug or id to real org
  const org = await resolvePortalOrg(orgParam);

  if (!org) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Not Found</h1>
          <p className="mt-2 text-muted-foreground">
            This portal does not exist.
          </p>
        </div>
      </div>
    );
  }

  const orgId = org.id;

  // Check portal is enabled
  const portalSetting = await db.appSetting.findUnique({
    where: {
      organizationId_key: {
        organizationId: orgId,
        key: SETTING_KEYS.PORTAL_ENABLED,
      },
    },
  });

  if (portalSetting?.value !== "true") {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Portal Not Available</h1>
          <p className="mt-2 text-muted-foreground">
            The customer portal is not enabled for this organization.
          </p>
        </div>
      </div>
    );
  }

  // If already logged in, redirect to dashboard
  const session = await getCustomerSession();
  if (session && session.organizationId === orgId) {
    redirect(`/portal/${orgParam}/dashboard`);
  }

  // Get org branding
  const logoSetting = await db.appSetting.findUnique({
    where: {
      organizationId_key: {
        organizationId: orgId,
        key: SETTING_KEYS.COMPANY_LOGO,
      },
    },
  });

  return (
    <PortalLoginForm
      orgId={orgParam}
      orgName={org.name}
      orgLogo={logoSetting?.value}
      error={authError}
    />
  );
}
