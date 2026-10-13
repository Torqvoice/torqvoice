import { db, type TxClient } from '@/lib/db'
import type { TaxApplies } from '@/lib/taxable-lines'
import { readTaxApplies, TAX_APPLIES_SETTING_KEYS } from './workshopTax'

/**
 * Which kinds of line the workshop taxes, read from its settings.
 *
 * For the paths that write a line without having the workshop's settings to
 * hand (a part booked from the phone, a labor line, a tire job). A line
 * written without asking is taxable by the column's default, which is wrong
 * for a workshop that taxes parts and not labor, so every such path asks.
 */
export async function loadTaxApplies(
  organizationId: string,
  client: TxClient | typeof db = db
): Promise<TaxApplies> {
  const rows = await client.appSetting.findMany({
    where: { organizationId, key: { in: [...TAX_APPLIES_SETTING_KEYS] } },
    select: { key: true, value: true },
  })
  return readTaxApplies(Object.fromEntries(rows.map((row) => [row.key, row.value])))
}
