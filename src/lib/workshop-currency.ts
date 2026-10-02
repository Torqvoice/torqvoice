import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { type CurrencySettings, resolveCurrencySettings } from '@/lib/currencies'
import { db } from '@/lib/db'
import { formatCurrency } from '@/lib/format'

/**
 * The currency and format the workshop set under Localization, for server
 * code that has no settings map of its own to read them from.
 */
export async function workshopCurrencySettings(
  organizationId: string | null | undefined
): Promise<CurrencySettings> {
  const rows = organizationId
    ? await db.appSetting.findMany({
        where: {
          organizationId,
          key: { in: [SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.CURRENCY_FORMAT] },
        },
        select: { key: true, value: true },
      })
    : []
  return resolveCurrencySettings(new Map(rows.map((r) => [r.key, r.value])))
}

/** Prints amounts the way the workshop set them up under Localization. */
export async function workshopMoneyFormatter(
  organizationId: string | null | undefined
): Promise<(amount: number) => string> {
  const { currencyCode, currencyFormat } = await workshopCurrencySettings(organizationId)
  return (amount) => formatCurrency(amount, currencyCode, currencyFormat)
}
