import { notFound } from 'next/navigation'
import {
  getInventoryPart,
  getStockMovementsPaginated,
} from '@/features/inventory/Actions/getStockMovements'
import { getInventoryCategories } from '@/features/inventory/Actions/inventoryActions'
import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { PageHeader } from '@/components/page-header'
import { formatDateTime } from '@/lib/format'
import { PartDetailClient } from './part-detail-client'

const PAGE_SIZE = 50

export default async function InventoryPartDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string; reason?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)

  const [partResult, movementsResult, categoriesResult, settingsResult] = await Promise.all([
    getInventoryPart(id),
    getStockMovementsPaginated({
      inventoryPartId: id,
      page,
      pageSize: PAGE_SIZE,
      reason: sp.reason,
    }),
    getInventoryCategories(),
    getSettings([
      SETTING_KEYS.CURRENCY_CODE,
      SETTING_KEYS.INVENTORY_MARKUP_MULTIPLIER,
      SETTING_KEYS.UNIT_SYSTEM,
      SETTING_KEYS.DATE_FORMAT,
      SETTING_KEYS.TIME_FORMAT,
      SETTING_KEYS.TIMEZONE,
      SETTING_KEYS.LOW_STOCK_DEFAULT_THRESHOLD,
    ]),
  ])

  // Covers both "no such part" and "belongs to another organization", since
  // the action scopes by organizationId.
  if (!partResult.success || !partResult.data) {
    notFound()
  }

  const settings = settingsResult.success ? (settingsResult.data ?? {}) : {}
  const movements = movementsResult.data ?? {
    movements: [],
    total: 0,
    page,
    pageSize: PAGE_SIZE,
    totalPages: 1,
  }

  // Timestamps are formatted here, on the server, and shipped as strings.
  // Formatting them in the client component instead would render the server's
  // timezone during SSR and the browser's after hydration — a guaranteed
  // mismatch for any viewer not on UTC, which React reports as a hydration
  // error. The org's configured timezone (when set) is authoritative for a
  // workshop's records anyway.
  const movementsWithLabels = movements.movements.map((m) => ({
    ...m,
    createdAtLabel: formatDateTime(
      m.createdAt,
      settings[SETTING_KEYS.DATE_FORMAT],
      (settings[SETTING_KEYS.TIME_FORMAT] as '12h' | '24h') || undefined,
      settings[SETTING_KEYS.TIMEZONE] || undefined
    ),
  }))

  return (
    <>
      <PageHeader />
      <PartDetailClient
        part={partResult.data}
        movements={movementsWithLabels}
        total={movements.total}
        page={movements.page}
        pageSize={movements.pageSize}
        totalPages={movements.totalPages}
        reason={sp.reason ?? ''}
        currencyCode={settings[SETTING_KEYS.CURRENCY_CODE] || 'USD'}
        markupMultiplier={Number(settings[SETTING_KEYS.INVENTORY_MARKUP_MULTIPLIER]) || 1}
        categories={categoriesResult.data ?? []}
        lowStockDefault={Number(settings[SETTING_KEYS.LOW_STOCK_DEFAULT_THRESHOLD]) || 0}
        unitSystem={settings[SETTING_KEYS.UNIT_SYSTEM] || 'imperial'}
      />
    </>
  )
}
