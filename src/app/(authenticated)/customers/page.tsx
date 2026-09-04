import { resolveListSort } from '@/lib/list-sort-preference.server'
import { getTranslations } from 'next-intl/server'
import { getCustomersPaginated } from '@/features/customers/Actions/customerActions'
import { CustomersClient } from './customers-client'
import { PageHeader } from '@/components/page-header'
import { ListPage } from '@/components/list-page'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    pageSize?: string
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
  const result = await getCustomersPaginated({
    page: params.page ? parseInt(params.page) : 1,
    pageSize: params.pageSize ? parseInt(params.pageSize) : 20,
    search: params.search,
    sortBy: sort.sortBy,
    sortOrder: sort.sortOrder,
  })

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
          data={result.data}
          search={params.search || ''}
          sortBy={sort.sortBy || ''}
          sortOrder={sort.sortOrder}
        />
      </ListPage>
    </>
  )
}
