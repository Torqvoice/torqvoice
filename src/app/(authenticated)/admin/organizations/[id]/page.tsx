import { notFound } from 'next/navigation'
import { getOrganizationDetails } from '@/features/admin/Actions/getOrganizationDetails'
import { AdminOrganizationDetails } from '@/features/admin/Components/admin-organization-details'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('organizations')
}

export default async function AdminOrganizationDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getOrganizationDetails(id)

  if (!result.success || !result.data) {
    notFound()
  }

  return <AdminOrganizationDetails org={result.data} />
}
