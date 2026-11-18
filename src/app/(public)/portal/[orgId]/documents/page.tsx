import { redirect } from 'next/navigation'

/** Documents in the navigation opens the invoices list, the first of its three tabs. */
export default async function PortalDocumentsPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  redirect(`/portal/${orgId}/invoices`)
}
