import { ServiceRecordPage } from '@/features/vehicles/Components/service-page/ServiceRecordPage'

export default async function ServiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; serviceId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { serviceId } = await params
  const sp = await searchParams
  const initialTab = typeof sp.tab === 'string' ? sp.tab : undefined

  return <ServiceRecordPage serviceId={serviceId} initialTab={initialTab} />
}
