import { getAuditLogsPaginated } from "@/features/audit/Actions/auditActions";
import { PageHeader } from "@/components/page-header";
import { AuditLogClient } from "./audit-log-client";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    action?: string;
    entity?: string;
    userId?: string;
  }>;
}) {
  const params = await searchParams;

  const result = await getAuditLogsPaginated({
    page: params.page ? parseInt(params.page) : 1,
    pageSize: params.pageSize ? parseInt(params.pageSize) : 25,
    search: params.search,
    action: params.action,
    entity: params.entity,
    userId: params.userId,
  });

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || "Failed to load audit logs"}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <AuditLogClient
          data={result.data}
          search={params.search || ""}
          actionFilter={params.action || "all"}
          entityFilter={params.entity || "all"}
          userFilter={params.userId || "all"}
        />
      </div>
    </>
  );
}
