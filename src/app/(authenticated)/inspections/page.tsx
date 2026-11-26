import { stampServerRender } from '@/components/infinite-list/server-render'
import { resolveListSort } from '@/lib/list-sort-preference.server'
import { resolveListStatus } from '@/lib/list-status-preference.server'
import { getInspectionRows } from '@/features/inspections/Actions/getInspectionRows'
import { getAuthContext } from '@/lib/get-auth-context'
import { getTemplates } from '@/features/inspections/Actions/templateActions'
import { InspectionsClient } from './inspections-client'
import { PageHeader } from '@/components/page-header'
import { ListPage } from '@/components/list-page'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('inspections')
}

export default async function InspectionsPage({
  searchParams,
}: {
  // An old ?page= link is simply ignored: the list loads more as it scrolls.
  searchParams: Promise<{
    search?: string
    status?: string
    sortBy?: string
    sortOrder?: string
  }>
}) {
  const params = await searchParams
  const sort = await resolveListSort('inspections', params, {
    sortBy: undefined,
    sortOrder: 'desc',
  })
  const status = await resolveListStatus('inspections', params.status)
  const [result, templatesResult, authCtx] = await Promise.all([
    // The first batch; the rest load through the same action as the list scrolls.
    getInspectionRows({
      search: params.search,
      status,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    }),
    getTemplates(),
    getAuthContext(),
  ])

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">{result.error || 'Failed to load inspections'}</p>
        </div>
      </>
    )
  }

  const templates = templatesResult.success && templatesResult.data ? templatesResult.data : []

  return (
    <>
      <PageHeader />
      <ListPage>
        <InspectionsClient
          data={stampServerRender(result.data)}
          listScope={authCtx?.organizationId ?? ''}
          templates={templates}
          search={params.search || ''}
          statusFilter={status}
          sortBy={sort.sortBy || ''}
          sortOrder={sort.sortOrder}
        />
      </ListPage>
    </>
  )
}
