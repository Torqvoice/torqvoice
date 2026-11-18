import { notFound } from 'next/navigation'
import { getUserDetails } from '@/features/admin/Actions/getUserDetails'
import { AdminUserDetails } from '@/features/admin/Components/admin-user-details'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('users')
}

export default async function AdminUserDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getUserDetails(id)

  if (!result.success || !result.data) {
    notFound()
  }

  return <AdminUserDetails user={result.data} />
}
