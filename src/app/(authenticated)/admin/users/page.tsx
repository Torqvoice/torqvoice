import { getUsers } from '@/features/admin/Actions/getUsers'
import { AdminUsers } from '@/features/admin/Components/admin-users'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string
    page?: string
    pageSize?: string
    sortBy?: string
    sortOrder?: string
  }>
}) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const pageSize = Number(params.pageSize) || 20
  const search = params.search || ''
  const sortBy = params.sortBy
  const sortOrder = params.sortOrder

  const result = await getUsers({ search, page, pageSize, sortBy, sortOrder })

  const data = result.data ?? { users: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }

  return (
    <AdminUsers
      data={data}
      search={search}
      sortBy={sortBy ?? 'lastSeen'}
      sortOrder={sortOrder === 'asc' ? 'asc' : 'desc'}
    />
  )
}
