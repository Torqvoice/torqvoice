import { resolveListSort } from '@/lib/list-sort-preference.server'
import { getQuotesPaginated } from '@/features/quotes/Actions/quoteActions'
import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { QuotesClient } from './quotes-client'
import { PageHeader } from '@/components/page-header'
import { ListPage } from '@/components/list-page'

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    pageSize?: string
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
  const [result, settingsResult] = await Promise.all([
    getQuotesPaginated({
      page: params.page ? parseInt(params.page) : 1,
      pageSize: params.pageSize ? parseInt(params.pageSize) : 20,
      search: params.search,
      status: params.status || 'all',
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    }),
    getSettings([SETTING_KEYS.CURRENCY_CODE]),
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
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || 'USD'

  return (
    <>
      <PageHeader />
      <ListPage>
        <QuotesClient
          data={result.data}
          currencyCode={currencyCode}
          search={params.search || ''}
          statusFilter={params.status || 'all'}
          sortBy={sort.sortBy || ''}
          sortOrder={sort.sortOrder}
        />
      </ListPage>
    </>
  )
}
