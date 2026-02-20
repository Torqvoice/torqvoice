import { getInspectionsPaginated } from "@/features/inspections/Actions/inspectionActions";
import { getTemplates } from "@/features/inspections/Actions/templateActions";
import { InspectionsClient } from "./inspections-client";
import { PageHeader } from "@/components/page-header";

export default async function InspectionsPage({
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
  const [result, templatesResult] = await Promise.all([
    getInspectionsPaginated({
      page: params.page ? parseInt(params.page) : 1,
      pageSize: params.pageSize ? parseInt(params.pageSize) : 20,
      search: params.search,
      status: params.status || "all",
    }),
    getTemplates(),
  ]);

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || "Failed to load inspections"}
          </p>
        </div>
      </>
    );
  }

  const templates = templatesResult.success && templatesResult.data ? templatesResult.data : [];

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <InspectionsClient
          data={result.data}
          templates={templates}
          search={params.search || ""}
          statusFilter={params.status || "all"}
        />
      </div>
    </>
  );
}
