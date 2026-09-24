import { SETTING_KEYS, type SettingKey } from '../Schema/settingsSchema'
import { SHOP_FEE_SETTING_KEYS } from './shopFee'
import { WARRANTY_SETTING_KEYS } from './warrantyDefaults'

/**
 * What every member of a workshop may read, whatever their role.
 *
 * These are not "settings" in the sense the Settings permission guards. They
 * are how the workshop's own work is shown: its currency, its units, its tax
 * rate, its address on a document. A member who may open a work order has to
 * see it in the workshop's currency, and they were not: every ordinary page
 * read these through `getSettings`, which needs `read:settings`, so a Member
 * was refused on every page load, the page quietly fell back to the built-in
 * defaults (the wrong currency, the wrong tax rate, no labour rate), and each
 * refusal wrote a row to the audit log. Eight thousand in one afternoon.
 *
 * The permission stays exactly where it was for everything else, because the
 * same table holds payment secrets, API keys and the licence token. This is a
 * list of what is safe, not a list of what is secret: a key that is not named
 * here is not readable this way, so a new setting is private until somebody
 * decides otherwise.
 */
export const MEMBER_READABLE_SETTINGS: ReadonlySet<SettingKey> = new Set<SettingKey>([
  // Money and measures, as shown on every list and document.
  SETTING_KEYS.CURRENCY_CODE,
  SETTING_KEYS.UNIT_SYSTEM,
  SETTING_KEYS.DATE_FORMAT,
  SETTING_KEYS.TIME_FORMAT,
  SETTING_KEYS.TIMEZONE,
  SETTING_KEYS.WORKBOARD_WEEK_START_DAY,

  // The defaults a new line, quote or invoice starts from.
  SETTING_KEYS.TAX_ENABLED,
  SETTING_KEYS.DEFAULT_TAX_RATE,
  SETTING_KEYS.DEFAULT_LABOR_RATE,
  SETTING_KEYS.INVOICE_DUE_DAYS,
  ...SHOP_FEE_SETTING_KEYS,
  SETTING_KEYS.PARTS_DEFAULT_MARKUP_PERCENT,
  SETTING_KEYS.PARTS_MARKUP_APPLIES_TO_INVENTORY,
  SETTING_KEYS.INVENTORY_MARKUP_MULTIPLIER,
  SETTING_KEYS.INVENTORY_DEFAULT_UNIT,
  SETTING_KEYS.LOW_STOCK_DEFAULT_THRESHOLD,
  SETTING_KEYS.TIRE_HOTEL_DEFAULT_SEASONAL_PRICE,
  ...WARRANTY_SETTING_KEYS,

  // What a vehicle's page works out from its history.
  SETTING_KEYS.PREDICTED_MAINTENANCE_ENABLED,
  SETTING_KEYS.MAINTENANCE_SERVICE_INTERVAL,
  SETTING_KEYS.MAINTENANCE_APPROACHING_THRESHOLD,

  // How a document looks, and who it says it is from. All of it is printed on
  // what the customer receives.
  SETTING_KEYS.INVOICE_ACTIVE_DESIGN,
  SETTING_KEYS.INVOICE_PRIMARY_COLOR,
  SETTING_KEYS.WORKSHOP_ADDRESS,
  SETTING_KEYS.WORKSHOP_EMAIL,
  SETTING_KEYS.WORKSHOP_PHONE,

  // Whether the share and portal buttons are offered at all.
  SETTING_KEYS.PORTAL_ENABLED,
])
