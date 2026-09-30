import { SETTING_KEYS } from '../Schema/settingsSchema'

/**
 * The workshop's shop fee ("shop supplies"): a charge added to every new work
 * order and quote for the consumables no line itemises, such as rags,
 * cleaner, lubricants and disposal.
 *
 * It is written onto the job as a line of its own, `pricingType: 'shopFee'`,
 * priced as one unit. A line rather than a hidden total, so it prints, syncs to
 * accounting and exports like any other charge, and the technician can remove
 * it from a job that should not carry it.
 *
 * A flat fee is written once and then belongs to the job like any line. A
 * percentage fee follows the job: it is recalculated from the lines it is a
 * percentage of whenever the job is re-totalled, and capped when the workshop
 * set a cap.
 */

export const SHOP_FEE_PRICING = 'shopFee' as const

export const SHOP_FEE_SETTING_KEYS = [
  SETTING_KEYS.SHOP_FEE_ENABLED,
  SETTING_KEYS.SHOP_FEE_LABEL,
  SETTING_KEYS.SHOP_FEE_MODE,
  SETTING_KEYS.SHOP_FEE_AMOUNT,
  SETTING_KEYS.SHOP_FEE_PERCENT,
  SETTING_KEYS.SHOP_FEE_BASE,
  SETTING_KEYS.SHOP_FEE_CAP,
  SETTING_KEYS.SHOP_FEE_APPLIES_TO,
] as const

export type ShopFeeMode = 'flat' | 'percent'
/** What a percentage fee is a percentage of. */
export type ShopFeeBase = 'labor' | 'laborParts'
/** Which new documents are written with the fee. */
export type ShopFeeAppliesTo = 'both' | 'workOrders' | 'quotes'
/** A document the fee may be written onto. */
export type ShopFeeTarget = 'workOrder' | 'quote'

export interface ShopFeeConfig {
  label: string
  mode: ShopFeeMode
  /** The flat amount. */
  amount: number
  /** The percentage, as 10 for 10 %. */
  percent: number
  base: ShopFeeBase
  /** Largest a percentage fee may come to; null for no cap. */
  cap: number | null
  appliesTo: ShopFeeAppliesTo
}

const positive = (value: string | undefined): number => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** The fee as settings describe it, or null when the workshop charges none. */
export function readShopFee(
  settings: Record<string, string | undefined>,
  fallbackLabel = 'Shop supplies'
): ShopFeeConfig | null {
  if (settings[SETTING_KEYS.SHOP_FEE_ENABLED] !== 'true') return null
  const mode: ShopFeeMode = settings[SETTING_KEYS.SHOP_FEE_MODE] === 'percent' ? 'percent' : 'flat'
  const config: ShopFeeConfig = {
    label: settings[SETTING_KEYS.SHOP_FEE_LABEL]?.trim() || fallbackLabel,
    mode,
    amount: positive(settings[SETTING_KEYS.SHOP_FEE_AMOUNT]),
    percent: positive(settings[SETTING_KEYS.SHOP_FEE_PERCENT]),
    base: settings[SETTING_KEYS.SHOP_FEE_BASE] === 'laborParts' ? 'laborParts' : 'labor',
    cap: positive(settings[SETTING_KEYS.SHOP_FEE_CAP]) || null,
    appliesTo: readAppliesTo(settings[SETTING_KEYS.SHOP_FEE_APPLIES_TO]),
  }
  // A fee of nothing is no fee; it would only add an empty line to every job.
  if (mode === 'flat' ? config.amount === 0 : config.percent === 0) return null
  return config
}

const readAppliesTo = (value: string | undefined): ShopFeeAppliesTo =>
  value === 'workOrders' || value === 'quotes' ? value : 'both'

/**
 * The fee if it is written onto this kind of document, else null. Governs
 * only where a new document gets the line; a fee already on a job follows it
 * whatever this says, since the customer was quoted it.
 */
export function shopFeeFor(
  config: ShopFeeConfig | null,
  target: ShopFeeTarget
): ShopFeeConfig | null {
  if (!config) return null
  if (config.appliesTo === 'both') return config
  return config.appliesTo === (target === 'quote' ? 'quotes' : 'workOrders') ? config : null
}

const round = (value: number) => Math.round(value * 100) / 100

export const isShopFeeLine = (line: { pricingType?: string | null }) =>
  line.pricingType === SHOP_FEE_PRICING

/**
 * The lines with the fee last. A new job is created with the fee as its only
 * line and everything else lands after it, so left alone the fee would print
 * as line 1; a customer expects it under the work. Returns the same array
 * when nothing moved.
 */
export function shopFeeLinesLast<T extends { pricingType?: string | null }>(lines: T[]): T[] {
  const fees = lines.filter(isShopFeeLine)
  if (fees.length === 0) return lines
  const rest = lines.filter((line) => !isShopFeeLine(line))
  const next = [...rest, ...fees]
  return next.every((line, i) => line === lines[i]) ? lines : next
}

/**
 * The lines as a customer document shows them: the fee last, and a fee that
 * came to nothing left out. A percentage fee on a job with none of what it
 * is a percentage of is a line reading 0.00, which says nothing to the
 * customer; the line itself stays on the job so it can be priced later.
 */
export function documentLaborLines<T extends { pricingType?: string | null; total: number }>(
  lines: T[]
): T[] {
  return shopFeeLinesLast(
    lines.filter((line) => !isShopFeeLine(line) || Math.abs(line.total) >= 0.005)
  )
}

/** The fee for a job with these line totals. Labor excludes fee lines. */
export function shopFeeAmount(
  config: ShopFeeConfig,
  totals: { labor: number; parts: number }
): number {
  if (config.mode === 'flat') return round(config.amount)
  const base = config.base === 'laborParts' ? totals.labor + totals.parts : totals.labor
  const fee = round((Math.max(base, 0) * config.percent) / 100)
  return config.cap !== null ? Math.min(fee, round(config.cap)) : fee
}

/** The line a new job starts with, priced for the lines it starts with. */
export function newShopFeeLine(
  config: ShopFeeConfig,
  totals: { labor: number; parts: number } = { labor: 0, parts: 0 }
) {
  const fee = shopFeeAmount(config, totals)
  return {
    description: config.label,
    hours: 1,
    rate: fee,
    total: fee,
    pricingType: SHOP_FEE_PRICING,
  }
}

/**
 * Brings a percentage fee's lines up to date with the rest of the job.
 * Returns the same array when nothing changed, so a caller holding it in
 * React state can compare by reference. A flat fee, or no fee configured,
 * leaves the lines alone: the job keeps what it was given.
 */
export function recalculateShopFeeLines<
  T extends {
    pricingType?: string | null
    hours: number
    rate: number
    total: number
    /** A quote line the customer left out, which the fee is not charged on. */
    excluded?: boolean
  },
>(labor: T[], partsTotal: number, config: ShopFeeConfig | null): T[] {
  if (!config || config.mode !== 'percent') return labor
  if (!labor.some(isShopFeeLine)) return labor
  const laborTotal = labor
    .filter((line) => !isShopFeeLine(line) && !line.excluded)
    .reduce((sum, line) => sum + (Number(line.total) || 0), 0)
  const fee = shopFeeAmount(config, { labor: laborTotal, parts: partsTotal })
  let changed = false
  const next = labor.map((line) => {
    if (!isShopFeeLine(line)) return line
    if (line.total === fee && line.rate === fee && line.hours === 1) return line
    changed = true
    return { ...line, hours: 1, rate: fee, total: fee }
  })
  return changed ? next : labor
}
