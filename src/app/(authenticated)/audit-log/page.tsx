import { stampServerRender } from '@/components/infinite-list/server-render'
import { getAuditLogRows } from '@/features/audit/Actions/getAuditLogRows'
import { PageHeader } from '@/components/page-header'
import { ListPage } from '@/components/list-page'
import { getAuthContext } from '@/lib/get-auth-context'
import { AuditLogClient } from './audit-log-client'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('auditLog')
}

export default async function AuditLogPage({
  searchParams,
}: {
  // An old ?page= link is simply ignored: the list loads more as it scrolls.
  searchParams: Promise<{
    search?: string
    action?: string
    entity?: string
    userId?: string
  }>
}) {
  const params = await searchParams

  const [result, authCtx] = await Promise.all([
    // The first batch; the rest load through the same action as the list scrolls.
    getAuditLogRows({
      search: params.search,
      action: params.action,
      entity: params.entity,
      userId: params.userId,
    }),
    getAuthContext(),
  ])

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">{result.error || 'Failed to load audit logs'}</p>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader />
      <ListPage>
        <AuditLogClient
          data={stampServerRender(result.data)}
          listScope={authCtx?.organizationId ?? ''}
          search={params.search || ''}
          actionFilter={params.action || 'all'}
          entityFilter={params.entity || 'all'}
          userFilter={params.userId || 'all'}
        />
      </ListPage>
    </>
  )
}
