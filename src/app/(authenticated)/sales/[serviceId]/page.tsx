import { ServiceRecordPage } from '@/features/vehicles/Components/service-page/ServiceRecordPage'

// Counter sales (service records without a vehicle) live here; the shared
// ServiceRecordPage renders vehicle-linked records identically under
// /vehicles/[id]/service/[serviceId].
export default async function SalesDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { serviceId } = await params
  const sp = await searchParams
  const initialTab = typeof sp.tab === 'string' ? sp.tab : undefined

  return <ServiceRecordPage serviceId={serviceId} initialTab={initialTab} />
}
