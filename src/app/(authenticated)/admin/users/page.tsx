import { getUserRows } from '@/features/admin/Actions/getUserRows'
import { AdminUsers } from '@/features/admin/Components/admin-users'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('users')
}

export default async function AdminUsersPage({
  searchParams,
}: {
  // An old ?page= link is simply ignored: the list loads more as it scrolls.
  searchParams: Promise<{
    search?: string
    sortBy?: string
    sortOrder?: string
  }>
}) {
  const params = await searchParams
  const search = params.search || ''
  const sortBy = params.sortBy || 'lastSeen'
  const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc'

  // The first batch; the rest load through the same action as the list scrolls.
  const result = await getUserRows({ search, sortBy, sortOrder })
  const data = result.data ?? { rows: [], nextCursor: null, total: 0 }

  return <AdminUsers data={data} search={search} sortBy={sortBy} sortOrder={sortOrder} />
}
