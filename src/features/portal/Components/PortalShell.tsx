import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/customer-session";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { resolvePortalOrg } from "@/lib/portal-slug";
import { PortalHeader } from "./PortalHeader";
import { PortalNav } from "./PortalNav";

export async function PortalShell({
  orgId: orgParam,
  children,
}: {
  orgId: string;
  children: React.ReactNode;
}) {
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

  // Check customer session
  const session = await getCustomerSession();

  if (!session || session.organizationId !== orgId) {
    redirect(`/portal/${orgParam}/auth/login`);
  }

  // Get customer info
  const customer = await db.customer.findUnique({
    where: { id: session.customerId },
    select: { name: true },
  });

  if (!customer) {
    redirect(`/portal/${orgParam}/auth/login`);
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
    <div className="flex h-svh flex-col">
      <PortalHeader
        orgId={orgParam}
        orgName={org.name}
        orgLogo={logoSetting?.value}
        customerName={customer.name}
      />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 overflow-y-auto border-r p-4 md:block">
          <PortalNav orgId={orgParam} />
        </aside>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
