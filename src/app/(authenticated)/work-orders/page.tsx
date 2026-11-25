import { resolveCurrencyCode } from '@/lib/currencies'
import { resolveListSort } from '@/lib/list-sort-preference.server'
import { resolveListStatus } from '@/lib/list-status-preference.server'
import { resolveListColumns } from '@/lib/list-columns.server'
import { WORK_ORDER_COLUMNS } from '@/lib/list-columns'
import { getTranslations } from 'next-intl/server'
import { getWorkOrderRows } from '@/features/vehicles/Actions/getWorkOrderRows'
import { getDisplaySettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { getAuthContext } from '@/lib/get-auth-context'
import { canEmailCustomers } from '@/features/email/Lib/emailAllowance'
import { getFeatures } from '@/lib/features'
import { WorkOrdersClient } from './work-orders-client'
import { PageHeader } from '@/components/page-header'
import { ListPage } from '@/components/list-page'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('workOrders')
}

export default async function WorkOrdersPage({
  searchParams,
}: {
  // An old ?page= link is simply ignored: the list loads more as it scrolls.
  searchParams: Promise<{
    search?: string
    status?: string
    sortBy?: string
    sortOrder?: string
    /** 'today': only what is promised to a customer by the end of today. */
    due?: string
  }>
}) {
  const params = await searchParams
  const sort = await resolveListSort('workOrders', params, {
    sortBy: 'serviceDate',
    sortOrder: 'desc',
  })
  const columns = await resolveListColumns('workOrders', WORK_ORDER_COLUMNS)
  const status = await resolveListStatus('workOrders', params.status)
  const [result, settingsResult, authCtx] = await Promise.all([
    // The first batch; the rest load through the same action as the list scrolls.
    getWorkOrderRows({
      search: params.search,
      status,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
      due: params.due,
    }),
    getDisplaySettings([SETTING_KEYS.CURRENCY_CODE]),
    getAuthContext(),
  ])

  const features = authCtx ? await getFeatures(authCtx.organizationId) : null
  const emailEnabled = authCtx ? await canEmailCustomers(authCtx.organizationId) : false

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || (await getTranslations('workOrders.page'))('error')}
          </p>
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
        <WorkOrdersClient
          data={result.data}
          listScope={authCtx?.organizationId ?? ''}
          currencyCode={currencyCode}
          search={params.search || ''}
          statusFilter={status}
          dueFilter={params.due === 'today' ? 'today' : ''}
          columns={columns}
          sortBy={sort.sortBy || ''}
          sortOrder={sort.sortOrder}
          smsEnabled={features?.sms ?? false}
          emailEnabled={emailEnabled}
        />
      </ListPage>
    </>
  )
}
