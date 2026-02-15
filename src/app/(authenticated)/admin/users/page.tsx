import { getUsers } from "@/features/admin/Actions/getUsers";
import { AdminUsers } from "@/features/admin/Components/admin-users";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string; pageSize?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 20;
  const search = params.search || "";

  const result = await getUsers({ search, page, pageSize });

  const data = result.data ?? { users: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };

  return <AdminUsers data={data} search={search} />;
}
