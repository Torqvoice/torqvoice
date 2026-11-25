import { getObservationRows } from '@/features/vehicles/Actions/getObservationRows'
import { observationStatusFilter } from '@/features/vehicles/Lib/observationFilters'
import { getAuthContext } from '@/lib/get-auth-context'
import { PageHeader } from '@/components/page-header'
import { ListPage } from '@/components/list-page'
import { ObservationsClient } from './observations-client'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('observations')
}

export default async function ObservationsPage({
  searchParams,
}: {
  // An old ?page= link is simply ignored: the list loads more as it scrolls.
  searchParams: Promise<{
    search?: string
    status?: string
    severity?: string
  }>
}) {
  const params = await searchParams

  const [result, authCtx] = await Promise.all([
    // The first batch; the rest load through the same action as the list scrolls.
    getObservationRows({
      search: params.search,
      status: params.status,
      severity: params.severity,
    }),
    getAuthContext(),
  ])

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">{result.error || 'Failed to load observations'}</p>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader />
      <ListPage>
        <ObservationsClient
          data={result.data}
          listScope={authCtx?.organizationId ?? ''}
          search={params.search || ''}
          statusFilter={observationStatusFilter(params.status)}
          severityFilter={params.severity || 'all'}
        />
      </ListPage>
    </>
  )
}
