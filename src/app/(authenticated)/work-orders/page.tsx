import { getWorkOrders } from "@/features/vehicles/Actions/serviceActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { getVehicles } from "@/features/vehicles/Actions/vehicleActions";
import { getCustomersList } from "@/features/customers/Actions/customerActions";
import { getAuthContext } from "@/lib/get-auth-context";
import { getFeatures } from "@/lib/features";
import { WorkOrdersClient } from "./work-orders-client";
import { PageHeader } from "@/components/page-header";

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const [result, settingsResult, vehiclesResult, customersResult, authCtx] = await Promise.all([
    getWorkOrders({
      page: params.page ? parseInt(params.page) : 1,
      pageSize: params.pageSize ? parseInt(params.pageSize) : 20,
      search: params.search,
      status: params.status,
    }),
    getSettings([SETTING_KEYS.CURRENCY_CODE]),
    getVehicles(),
    getCustomersList(),
    getAuthContext(),
  ]);

  const features = authCtx ? await getFeatures(authCtx.organizationId) : null;

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || "Failed to load work orders"}
          </p>
        </div>
      </>
    );
  }

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";
  const vehicles = vehiclesResult.success && vehiclesResult.data
    ? vehiclesResult.data.map((v) => ({
        id: v.id,
        make: v.make,
        model: v.model,
        year: v.year,
        licensePlate: v.licensePlate,
        customer: v.customer,
      }))
    : [];
  const customers = customersResult.success && customersResult.data
    ? customersResult.data
    : [];

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <WorkOrdersClient
          data={result.data}
          vehicles={vehicles}
          customers={customers}
          currencyCode={currencyCode}
          search={params.search || ""}
          statusFilter={params.status || "all"}
          smsEnabled={features?.sms ?? false}
          emailEnabled={features?.smtp ?? false}
        />
      </div>
    </>
  );
}
