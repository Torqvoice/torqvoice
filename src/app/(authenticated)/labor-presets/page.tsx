import { stampServerRender } from '@/components/infinite-list/server-render'
import { resolveCurrencyCode } from '@/lib/currencies'
import { resolveListSort } from '@/lib/list-sort-preference.server'
import { getInventoryPartsList } from '@/features/inventory/Actions/inventoryActions'
import { getLaborPresetRows } from '@/features/labor-presets/Actions/getLaborPresetRows'
import { getDisplaySettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { getAuthContext } from '@/lib/get-auth-context'
import { LaborPresetsClient } from './labor-presets-client'
import { PageHeader } from '@/components/page-header'
import { ListPage } from '@/components/list-page'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('laborPresets')
}

export default async function LaborPresetsPage({
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
  const sort = await resolveListSort('laborPresets', params, {
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  })
  const [result, settingsResult, inventoryResult, authCtx] = await Promise.all([
    // The first batch; the rest load through the same action as the list scrolls.
    getLaborPresetRows({
      search: params.search,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    }),
    getDisplaySettings([SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.DEFAULT_LABOR_RATE]),
    // For the "import from inventory" picker in the preset form. A user
    // without inventory read permission simply gets no picker.
    getInventoryPartsList(),
    getAuthContext(),
  ])

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">{result.error || 'Failed to load labor presets'}</p>
        </div>
      </>
    )
  }

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {}
  const inventoryParts =
    inventoryResult.success && inventoryResult.data
      ? inventoryResult.data.map((p) => ({
          id: p.id,
          name: p.name,
          partNumber: p.partNumber,
          unit: p.unit,
          category: p.category,
          sellPrice: p.sellPrice,
          unitCost: p.unitCost,
          quantity: p.quantity,
          tags: p.tags,
        }))
      : []
  const currencyCode = resolveCurrencyCode(settings[SETTING_KEYS.CURRENCY_CODE])
  const defaultLaborRate = Number(settings[SETTING_KEYS.DEFAULT_LABOR_RATE]) || 0

  return (
    <>
      <PageHeader />
      <ListPage>
        <LaborPresetsClient
          data={stampServerRender(result.data)}
          listScope={authCtx?.organizationId ?? ''}
          search={params.search || ''}
          sortBy={sort.sortBy || ''}
          sortOrder={sort.sortOrder}
          currencyCode={currencyCode}
          defaultLaborRate={defaultLaborRate}
          inventoryParts={inventoryParts}
        />
      </ListPage>
    </>
  )
}
