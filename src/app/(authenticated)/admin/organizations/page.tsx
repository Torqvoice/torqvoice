import { getOrganizations } from "@/features/admin/Actions/getOrganizations";
import { AdminOrganizations } from "@/features/admin/Components/admin-organizations";

export default async function AdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string; pageSize?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 20;
  const search = params.search || "";

  const result = await getOrganizations({ search, page, pageSize });

  const data = result.data ?? {
    organizations: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  };

  return <AdminOrganizations data={data} search={search} />;
}
