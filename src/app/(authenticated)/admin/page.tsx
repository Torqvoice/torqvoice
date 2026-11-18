import { getAdminStats } from '@/features/admin/Actions/getAdminStats'
import { AdminOverview } from '@/features/admin/Components/admin-overview'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('adminOverview')
}

export default async function AdminPage() {
  const result = await getAdminStats()

  const stats = result.data ?? {
    totalUsers: 0,
    totalOrganizations: 0,
    totalActiveSubscriptions: 0,
  }

  return <AdminOverview stats={stats} />
}
