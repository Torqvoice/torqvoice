import { cookies } from "next/headers";
import { getVehiclesPaginated } from "@/features/vehicles/Actions/vehicleActions";
import { getCustomersList } from "@/features/customers/Actions/customerActions";
import { VehiclesClient } from "./vehicles-client";
import { PageHeader } from "@/components/page-header";

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string; archived?: string }>;
}) {
  const params = await searchParams;
  const isArchived = params.archived === "true";
  const cookieStore = await cookies();
  const viewCookie = cookieStore.get("torqvoice-vehicles-view")?.value;
  const initialView = viewCookie === "grid" ? "grid" : "table";
  const [result, customersResult] = await Promise.all([
    getVehiclesPaginated({
      page: params.page ? parseInt(params.page) : 1,
      pageSize: params.pageSize ? parseInt(params.pageSize) : 20,
      search: params.search,
      archived: isArchived,
    }),
    getCustomersList(),
  ]);

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || "Failed to load vehicles"}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <VehiclesClient
          data={result.data}
          customers={customersResult.data ?? []}
          search={params.search || ""}
          initialView={initialView}
          isArchived={isArchived}
          archivedCount={result.data.archivedCount}
        />
      </div>
    </>
  );
}
