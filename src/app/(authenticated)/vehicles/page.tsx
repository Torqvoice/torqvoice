import { resolveListSort } from '@/lib/list-sort-preference.server'
import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { getVehiclesPaginated } from '@/features/vehicles/Actions/vehicleActions'
import { getCustomersList } from '@/features/customers/Actions/customerActions'
import { VehiclesClient } from './vehicles-client'
import { PageHeader } from '@/components/page-header'

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    search?: string
    archived?: string
    sortBy?: string
    sortOrder?: string
  }>
}) {
  const params = await searchParams
  const sort = await resolveListSort('vehicles', params, {
    sortBy: undefined,
    sortOrder: 'desc',
  })
  const isArchived = params.archived === 'true'
  const cookieStore = await cookies()
  const viewCookie = cookieStore.get('torqvoice-vehicles-view')?.value
  const initialView = viewCookie === 'table' ? 'table' : viewCookie === 'grid6' ? 'grid6' : 'grid'
  const [result, customersResult] = await Promise.all([
    getVehiclesPaginated({
      page: params.page ? parseInt(params.page) : 1,
      pageSize: params.pageSize ? parseInt(params.pageSize) : 20,
      search: params.search,
      archived: isArchived,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    }),
    getCustomersList(),
  ])

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || (await getTranslations('vehicles.list'))('error')}
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <VehiclesClient
          data={result.data}
          customers={customersResult.data ?? []}
          search={params.search || ''}
          sortBy={sort.sortBy || ''}
          sortOrder={sort.sortOrder}
          initialView={initialView}
          isArchived={isArchived}
          archivedCount={result.data.archivedCount}
        />
      </div>
    </>
  )
}
