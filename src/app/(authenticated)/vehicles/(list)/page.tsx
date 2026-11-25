import { resolveListSort } from '@/lib/list-sort-preference.server'
import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { getVehicleRows } from '@/features/vehicles/Actions/getVehicleRows'
import { getAuthContext } from '@/lib/get-auth-context'
import { VehiclesClient } from '../vehicles-client'
import { PageHeader } from '@/components/page-header'
import { ListPage } from '@/components/list-page'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('vehicles')
}

export default async function VehiclesPage({
  searchParams,
}: {
  // An old ?page= link is simply ignored: the list loads more as it scrolls.
  searchParams: Promise<{
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
  const [result, authCtx] = await Promise.all([
    // The first batch; the rest load through the same action as the list scrolls.
    getVehicleRows({
      search: params.search,
      archived: isArchived,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
      inspectionDue,
    }),
    getAuthContext(),
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
          listScope={authCtx?.organizationId ?? ''}
          search={params.search || ''}
          sortBy={sort.sortBy || ''}
          sortOrder={sort.sortOrder}
          initialView={initialView}
          isArchived={isArchived}
          archivedCount={result.data.archivedCount ?? 0}
          inspectionDue={inspectionDue}
          hasInspectionData={result.data.hasInspectionData ?? false}
        />
      </ListPage>
    </>
  )
}
