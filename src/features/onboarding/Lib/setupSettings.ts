import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { safeTimeZone } from '@/lib/timezone'
import type { SetupInput } from '../Schema/onboardingSchema'

/**
 * The settings a guided setup writes, keyed as the settings pages save them,
 * so a workshop that came through onboarding is indistinguishable from one
 * configured by hand afterwards.
 */
export function setupSettings(
  setup: SetupInput,
  timeZone: string | undefined
): Record<string, string> {
  const rows: Record<string, string> = {
    [SETTING_KEYS.SERVICE_TYPE]: setup.serviceType,
    [SETTING_KEYS.WORKSHOP_LOCALE]: setup.locale,
    [SETTING_KEYS.FORCE_CUSTOMER_LOCALE]: String(setup.forceCustomerLocale),
    [SETTING_KEYS.CURRENCY_CODE]: setup.currencyCode,
    [SETTING_KEYS.DATE_FORMAT]: setup.dateFormat,
    [SETTING_KEYS.TIME_FORMAT]: setup.timeFormat,
    [SETTING_KEYS.UNIT_SYSTEM]: setup.unitSystem,
    [SETTING_KEYS.MEASURE_SYSTEM]: setup.measureSystem,
    [SETTING_KEYS.TAX_ENABLED]: String(setup.tax.enabled),
    [SETTING_KEYS.DEFAULT_TAX_RATE]: setup.tax.enabled ? String(setup.tax.rate) : '0',
    [SETTING_KEYS.TAX_INCLUSIVE]: String(setup.tax.inclusive),
  }
  // A marine workshop's engine field is a model and power, never a displacement.
  if (setup.serviceType !== 'marine') rows[SETTING_KEYS.ENGINE_SIZE_UNIT] = setup.engineSizeUnit
  if (setup.dialCode) rows[SETTING_KEYS.WORKSHOP_DEFAULT_COUNTRY_CODE] = setup.dialCode
  if (setup.tax.enabled && setup.tax.label) rows[SETTING_KEYS.TAX_LABEL] = setup.tax.label
  if (setup.address) rows[SETTING_KEYS.WORKSHOP_ADDRESS] = setup.address
  const zone = safeTimeZone(timeZone, '')
  if (zone) rows[SETTING_KEYS.TIMEZONE] = zone
  return rows
}
