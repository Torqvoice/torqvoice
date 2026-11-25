import { stampServerRender } from '@/components/infinite-list/server-render'
import { resolveCurrencyCode } from '@/lib/currencies'
import { resolveListSort } from '@/lib/list-sort-preference.server'
import { resolveListStatus } from '@/lib/list-status-preference.server'
import { getBillingRows } from '@/features/billing/Actions/getBillingRows'
import { getDisplaySettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { PageHeader } from '@/components/page-header'
import { getAuthContext } from '@/lib/get-auth-context'
import { ListPage } from '@/components/list-page'
import { cookies } from 'next/headers'
import { COMPLETED_ONLY_COOKIE, parseCompletedOnlyCookie } from '@/lib/completed-only-preference'
import BillingClient from '../billing-client'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('billing')
}

export default async function BillingPage({
  searchParams,
}: {
  // An old ?page= link is simply ignored: the list loads more as it scrolls.
  searchParams: Promise<{
    search?: string
    status?: string
    delivery?: string
    completed?: string
    sortBy?: string
    sortOrder?: string
  }>
}) {
  const params = await searchParams
  const search = params.search || ''
  const statusFilter = await resolveListStatus('billing', params.status)
  const deliveryFilter = params.delivery === 'unviewed' ? 'unviewed' : ''
  // The URL wins, as with sorting; otherwise the switch as this browser left it.
  const completedOnly =
    params.completed !== undefined
      ? params.completed === '1'
      : parseCompletedOnlyCookie((await cookies()).get(COMPLETED_ONLY_COOKIE)?.value).has('billing')
  // No column asked for anywhere means the list keeps its own default, which
  // getBillingRows reads as newest first.
  const sort = await resolveListSort('billing', params, { sortBy: undefined, sortOrder: 'desc' })
  const sortBy = sort.sortBy || ''
  const sortOrder = sort.sortOrder

  const [result, settingsResult, authCtx] = await Promise.all([
    // The first batch; the rest load through the same action as the list scrolls.
    getBillingRows({
      search,
      status: statusFilter,
      delivery: deliveryFilter,
      completedOnly,
      sortBy,
      sortOrder,
    }),
    getDisplaySettings([SETTING_KEYS.CURRENCY_CODE]),
    getAuthContext(),
  ])

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {}
  const currencyCode = resolveCurrencyCode(settings[SETTING_KEYS.CURRENCY_CODE])

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">{result.error || 'Failed to load billing data'}</p>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader />
      <ListPage>
        <BillingClient
          data={stampServerRender(result.data)}
          listScope={authCtx?.organizationId ?? ''}
          currencyCode={currencyCode}
          search={search}
          statusFilter={statusFilter}
          deliveryFilter={deliveryFilter}
          completedOnly={completedOnly}
          sortBy={sortBy}
          sortOrder={sortOrder}
        />
      </ListPage>
    </>
  )
}
