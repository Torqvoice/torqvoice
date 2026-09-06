import { resolveListSort } from '@/lib/list-sort-preference.server'
import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { getVehiclesPaginated } from '@/features/vehicles/Actions/vehicleActions'
import { getCustomersList } from '@/features/customers/Actions/customerActions'
import { VehiclesClient } from './vehicles-client'
import { PageHeader } from '@/components/page-header'
import { ListPage } from '@/components/list-page'

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
    due?: string
  }>
}) {
  const params = await searchParams
  const sort = await resolveListSort('vehicles', params, {
    sortBy: undefined,
    sortOrder: 'desc',
  })
  const isArchived = params.archived === 'true'
  const inspectionDue =
    params.due === 'overdue'
      ? 'overdue'
      : params.due === '30'
        ? 30
        : params.due === '90'
          ? 90
          : undefined
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
      inspectionDue,
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
      <ListPage>
        <VehiclesClient
          data={result.data}
          customers={customersResult.data ?? []}
          search={params.search || ''}
          sortBy={sort.sortBy || ''}
          sortOrder={sort.sortOrder}
          initialView={initialView}
          isArchived={isArchived}
          archivedCount={result.data.archivedCount}
          inspectionDue={inspectionDue}
          hasInspectionData={result.data.hasInspectionData}
        />
      </ListPage>
    </>
  )
}
