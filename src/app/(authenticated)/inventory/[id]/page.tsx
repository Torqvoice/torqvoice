import { measureSystemIn } from '@/features/inventory/Lib/units'
import { resolveCurrencyCode } from '@/lib/currencies'
import { notFound } from 'next/navigation'
import { getInventoryPart } from '@/features/inventory/Actions/getStockMovements'
import { getStockMovementRows } from '@/features/inventory/Actions/getStockMovementRows'
import {
  getInventoryCategories,
  getInventoryTags,
} from '@/features/inventory/Actions/inventoryActions'
import { getDisplaySettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { PageHeader } from '@/components/page-header'
import { getAuthContext } from '@/lib/get-auth-context'
import { PartDetailClient } from './part-detail-client'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('inventory')
}

export default async function InventoryPartDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  // An old ?page= link is simply ignored: the history loads more as it scrolls.
  searchParams: Promise<{ reason?: string }>
}) {
  const { id } = await params
  const sp = await searchParams

  const [partResult, movementsResult, categoriesResult, tagsResult, settingsResult, authCtx] =
    await Promise.all([
      getInventoryPart(id),
      // The first batch; the rest load through the same action as the history scrolls.
      getStockMovementRows({ inventoryPartId: id, reason: sp.reason }),
      getInventoryCategories(),
      getInventoryTags(),
      getDisplaySettings([
        SETTING_KEYS.CURRENCY_CODE,
        SETTING_KEYS.INVENTORY_MARKUP_MULTIPLIER,
        SETTING_KEYS.UNIT_SYSTEM,
        SETTING_KEYS.MEASURE_SYSTEM,
        SETTING_KEYS.LOW_STOCK_DEFAULT_THRESHOLD,
      ]),
      getAuthContext(),
    ])

  // Covers both "no such part" and "belongs to another organization", since
  // the action scopes by organizationId.
  if (!partResult.success || !partResult.data) {
    notFound()
  }

  const settings = settingsResult.success ? (settingsResult.data ?? {}) : {}
  // Each row's time comes already written out on the workshop's clock (see
  // Lib/stockMovementList.server.ts), so the server render and hydration agree.
  const movements = movementsResult.data ?? { rows: [], nextCursor: null, total: 0 }

  return (
    <>
      <PageHeader />
      <PartDetailClient
        part={partResult.data}
        movements={movements}
        listScope={authCtx?.organizationId ?? ''}
        reason={sp.reason ?? ''}
        currencyCode={resolveCurrencyCode(settings[SETTING_KEYS.CURRENCY_CODE])}
        markupMultiplier={Number(settings[SETTING_KEYS.INVENTORY_MARKUP_MULTIPLIER]) || 1}
        categories={categoriesResult.data ?? []}
        tagSuggestions={tagsResult.data ?? []}
        lowStockDefault={Number(settings[SETTING_KEYS.LOW_STOCK_DEFAULT_THRESHOLD]) || 0}
        unitSystem={measureSystemIn(settings)}
      />
    </>
  )
}
