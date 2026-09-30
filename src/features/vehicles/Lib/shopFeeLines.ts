import { db, type TxClient } from '@/lib/db'
import {
  isShopFeeLine,
  readShopFee,
  recalculateShopFeeLines,
  SHOP_FEE_SETTING_KEYS,
  type ShopFeeConfig,
} from '@/features/settings/Lib/shopFee'

/** The workshop's shop fee, read from its settings. */
export async function loadShopFee(organizationId: string): Promise<ShopFeeConfig | null> {
  const rows = await db.appSetting.findMany({
    where: { organizationId, key: { in: [...SHOP_FEE_SETTING_KEYS] } },
    select: { key: true, value: true },
  })
  return readShopFee(Object.fromEntries(rows.map((r) => [r.key, r.value])))
}

/**
 * Re-prices a work order's percentage shop fee from its current lines.
 *
 * Runs before anything that re-totals a job from outside the editor (a part
 * added from the phone, a labour line, a tire job), so the fee on the job
 * follows the work it is a percentage of. A flat fee is left as it is.
 */
export async function refreshShopFeeLines(
  tx: TxClient | typeof db,
  serviceRecordId: string,
  organizationId: string
): Promise<void> {
  const labor = await tx.serviceLabor.findMany({
    where: { serviceRecordId },
    select: { id: true, pricingType: true, hours: true, rate: true, total: true },
  })
  if (!labor.some(isShopFeeLine)) return
  const config = await loadShopFee(organizationId)
  if (config?.mode !== 'percent') return

  const parts = await tx.servicePart.aggregate({
    where: { serviceRecordId },
    _sum: { total: true },
  })
  const next = recalculateShopFeeLines(labor, parts._sum.total || 0, config)
  if (next === labor) return
  for (const line of next) {
    if (!isShopFeeLine(line)) continue
    await tx.serviceLabor.update({
      where: { id: line.id },
      data: { hours: line.hours, rate: line.rate, total: line.total },
    })
  }
}
