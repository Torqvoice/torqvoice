import { stampServerRender } from '@/components/infinite-list/server-render'
import { resolveCurrencyCode } from '@/lib/currencies'
import { resolveListSort } from '@/lib/list-sort-preference.server'
import { resolveListStatus } from '@/lib/list-status-preference.server'
import { getQuoteRows } from '@/features/quotes/Actions/getQuoteRows'
import { getAuthContext } from '@/lib/get-auth-context'
import { getDisplaySettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { QuotesClient } from '../quotes-client'
import { PageHeader } from '@/components/page-header'
import { ListPage } from '@/components/list-page'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('quotes')
}

export default async function QuotesPage({
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
  const sort = await resolveListSort('quotes', params, {
    sortBy: undefined,
    sortOrder: 'desc',
  })
  const status = await resolveListStatus('quotes', params.status)
  const [result, settingsResult, authCtx] = await Promise.all([
    // The first batch; the rest load through the same action as the list scrolls.
    getQuoteRows({
      search: params.search,
      status,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    }),
    getDisplaySettings([SETTING_KEYS.CURRENCY_CODE]),
    getAuthContext(),
  ])

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">{result.error || 'Failed to load quotes'}</p>
        </div>
      </>
    )
  }

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {}
  const currencyCode = resolveCurrencyCode(settings[SETTING_KEYS.CURRENCY_CODE])

  return (
    <>
      <PageHeader />
      <ListPage>
        <QuotesClient
          data={stampServerRender(result.data)}
          listScope={authCtx?.organizationId ?? ''}
          currencyCode={currencyCode}
          search={params.search || ''}
          statusFilter={status}
          sortBy={sort.sortBy || ''}
          sortOrder={sort.sortOrder}
        />
      </ListPage>
    </>
  )
}
