import { getObservationsPaginated } from "@/features/vehicles/Actions/findingActions";
import { PageHeader } from "@/components/page-header";
import { ObservationsClient } from "./observations-client";

export default async function ObservationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    status?: string;
    severity?: string;
  }>;
}) {
  const params = await searchParams;

  const result = await getObservationsPaginated({
    page: params.page ? parseInt(params.page) : 1,
    pageSize: params.pageSize ? parseInt(params.pageSize) : 25,
    search: params.search,
    status: params.status,
    severity: params.severity,
  });

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || "Failed to load observations"}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ObservationsClient
          data={result.data}
          search={params.search || ""}
          statusFilter={params.status || "open"}
          severityFilter={params.severity || "all"}
        />
      </div>
    </>
  );
}
