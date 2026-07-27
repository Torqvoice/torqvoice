import { notFound } from 'next/navigation'
import { getOrganizationDetails } from '@/features/admin/Actions/getOrganizationDetails'
import { AdminOrganizationDetails } from '@/features/admin/Components/admin-organization-details'

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
