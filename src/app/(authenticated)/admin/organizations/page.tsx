import { stampServerRender } from '@/components/infinite-list/server-render'
import { getOrganizationRows } from '@/features/admin/Actions/getOrganizationRows'
import { AdminOrganizations } from '@/features/admin/Components/admin-organizations'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('organizations')
}

export default async function AdminOrganizationsPage({
  searchParams,
}: {
  // An old ?page= link is simply ignored: the list loads more as it scrolls.
  searchParams: Promise<{ search?: string }>
}) {
  const params = await searchParams
  const search = params.search || ''

  // The first batch; the rest load through the same action as the list scrolls.
  const result = await getOrganizationRows({ search })
  const data = result.data ?? { rows: [], nextCursor: null, total: 0 }

  return <AdminOrganizations data={stampServerRender(data)} search={search} />
}
