import { getRecurringInvoices } from "@/features/billing/Actions/recurringInvoiceActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { PageHeader } from "@/components/page-header";
import RecurringInvoicesClient from "@/features/billing/Components/RecurringInvoicesClient";
import { db } from "@/lib/db";
import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { redirect } from "next/navigation";

export default async function RecurringInvoicesPage() {
  const session = await getCachedSession();
  if (!session?.user?.id) redirect("/auth/sign-in");

  const membership = await getCachedMembership(session.user.id);
  if (!membership?.organizationId) redirect("/onboarding");

  const [result, settingsResult, vehicles] = await Promise.all([
    getRecurringInvoices(),
    getSettings([SETTING_KEYS.CURRENCY_CODE]),
    db.vehicle.findMany({
      where: { organizationId: membership.organizationId, isArchived: false },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        customer: { select: { id: true, name: true } },
      },
      orderBy: [{ make: "asc" }, { model: "asc" }],
    }),
  ]);

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";
  const invoices = result.success && result.data ? result.data : [];

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <RecurringInvoicesClient
          invoices={invoices}
          vehicles={vehicles}
          currencyCode={currencyCode}
        />
      </div>
    </>
  );
}
