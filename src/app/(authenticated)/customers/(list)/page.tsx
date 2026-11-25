import { stampServerRender } from '@/components/infinite-list/server-render'
import { resolveListSort } from '@/lib/list-sort-preference.server'
import { getTranslations } from 'next-intl/server'
import { getCustomerRows } from '@/features/customers/Actions/getCustomerRows'
import { CustomersClient } from '../customers-client'
import { PageHeader } from '@/components/page-header'
import { ListPage } from '@/components/list-page'
import { countUnnumberedCustomers } from '@/features/customers/Actions/customerActions'
import { getAuthContext } from '@/lib/get-auth-context'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('customers')
}

export default async function CustomersPage({
  searchParams,
}: {
  // An old ?page= link is simply ignored: the list loads more as it scrolls.
  searchParams: Promise<{
    search?: string
    sortBy?: string
    sortOrder?: string
  }>
}) {
  const params = await searchParams
  const sort = await resolveListSort('customers', params, {
    sortBy: undefined,
    sortOrder: 'desc',
  })
  const [result, unnumberedResult, authCtx] = await Promise.all([
    // The first batch; the rest load through the same action as the list scrolls.
    getCustomerRows({
      search: params.search,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    }),
    countUnnumberedCustomers(),
    getAuthContext(),
  ])
  const unnumbered = unnumberedResult.success ? (unnumberedResult.data ?? 0) : 0

  if (!result.success || !result.data) {
    const t = await getTranslations('customers.list')
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">{result.error || t('error')}</p>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader />
      <ListPage>
        <CustomersClient
          data={stampServerRender(result.data)}
          listScope={authCtx?.organizationId ?? ''}
          search={params.search || ''}
          sortBy={sort.sortBy || ''}
          sortOrder={sort.sortOrder}
          unnumbered={unnumbered}
        />
      </ListPage>
    </>
  )
}
