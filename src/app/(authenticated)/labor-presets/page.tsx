import { resolveListSort } from '@/lib/list-sort-preference.server'
import { getInventoryPartsList } from '@/features/inventory/Actions/inventoryActions'
import { getLaborPresetsPaginated } from '@/features/labor-presets/Actions/laborPresetActions'
import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { LaborPresetsClient } from './labor-presets-client'
import { PageHeader } from '@/components/page-header'
import { ListPage } from '@/components/list-page'

export default async function LaborPresetsPage({
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
  const sort = await resolveListSort('laborPresets', params, {
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  })
  const [result, settingsResult, inventoryResult] = await Promise.all([
    getLaborPresetsPaginated({
      page: params.page ? parseInt(params.page) : 1,
      pageSize: params.pageSize ? parseInt(params.pageSize) : 20,
      search: params.search,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    }),
    getSettings([SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.DEFAULT_LABOR_RATE]),
    // For the "import from inventory" picker in the preset form. A user
    // without inventory read permission simply gets no picker.
    getInventoryPartsList(),
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
          sellPrice: p.sellPrice,
          unitCost: p.unitCost,
          quantity: p.quantity,
        }))
      : []
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || 'USD'
  const defaultLaborRate = Number(settings[SETTING_KEYS.DEFAULT_LABOR_RATE]) || 0

  return (
    <>
      <PageHeader />
      <ListPage>
        <LaborPresetsClient
          data={result.data}
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
