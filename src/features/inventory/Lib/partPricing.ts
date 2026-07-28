/**
 * The single source of truth for every money figure derived from a stocked
 * part: what the customer is charged, the markup that price implies, and the
 * line total that follows from it.
 *
 * It exists because these rules were duplicated. The inventory picker had the
 * full fallback chain; the inline name suggestion used `sellPrice` directly,
 * so any part whose sell price was never filled in landed on the line at zero.
 * The same cost-plus-markup formula was then written out by hand in four more
 * places (barcode scan, the row reducer, apply-markup-to-all, and the part
 * form), each free to drift from the others. Nothing here should be inlined at
 * a call site again: a pricing rule that disagrees with itself bills the wrong
 * amount silently, and no test at the call site catches it.
 *
 * Two different units are in play, and they are not interchangeable:
 *  - `defaultMarkupPercent` is a percentage on a job or quote line. 50 means
 *    cost + 50%.
 *  - `markupMultiplier` multiplies cost in the inventory catalog form. 1.5
 *    means the same thing as a 50 percent markup.
 */

export interface PricedPart {
  unitCost: number
  sellPrice: number
}

export interface PricingSettings {
  /** Org default markup %, applied to cost when the setting below is on. */
  defaultMarkupPercent?: number
  /** When true, inventory parts are priced from cost + default markup. */
  markupAppliesToInventory?: boolean
}

export interface ResolvedPrice {
  unitPrice: number
  /** Kept in step with unitPrice so the displayed margin matches reality. */
  markupPercent: number
}

/**
 * Money is held to the cent, so every derived amount rounds the same way.
 *
 * Binary floats cannot represent most decimal amounts exactly, so a bare
 * `cost * 1.5` yields values like 44.980000000000004. Left unrounded those
 * reach the database and are summed into subtotals, where the error compounds
 * into a visible penny discrepancy on the document.
 */
export function roundMoney(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  // Round on the decimal value, not the binary approximation of it. A plain
  // Math.round(v * 100) / 100 bills 2.5 x 19.99 as 49.97, because that product
  // is held as 49.974999999999994 and so falls just short of the halfway point
  // it should sit exactly on. The same flaw rounds 1.005 down to 1.00.
  //
  // Twelve significant digits is well past where the noise lives and well
  // short of the ~15 a double carries, so this restores the decimal figure
  // without inventing precision. Rounding is symmetric about zero, so a credit
  // line rounds by the same magnitude as the charge it reverses.
  const normalized = Number(parsed.toPrecision(12))
  const scaled = Number((normalized * 100).toPrecision(12))
  return (scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)) / 100
}

/**
 * Read a value that may still be raw input from a number field.
 *
 * These fields store whatever the input produced, so a cleared box holds `""`
 * rather than a number, despite what the row types claim.
 */
function parseNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Read a line quantity that may still be raw input.
 *
 * Every total is derived as quantity * unitPrice, so this follows that same
 * rule and keeps the two in step: an unusable value reads as 0, and a
 * deliberate 0 stays 0 instead of being rounded up to 1.
 */
export function parseQuantity(value: unknown): number {
  return parseNumber(value)
}

/**
 * Customer price for a part bought at `cost` and sold at `markupPercent` over
 * it. A markup of 0 sells at cost; there is no hidden floor.
 */
export function priceFromCostAndMarkup(cost: unknown, markupPercent: unknown): number {
  return roundMoney(parseNumber(cost) * (1 + parseNumber(markupPercent) / 100))
}

/**
 * Catalog sell price for a part bought at `cost`, using the inventory form's
 * multiplier rather than a percentage. A multiplier of 1.5 equals a 50 percent
 * markup; see the note at the top of this file.
 */
export function priceFromCostAndMultiplier(cost: unknown, multiplier: unknown): number {
  return roundMoney(parseNumber(cost) * parseNumber(multiplier))
}

/**
 * The inverse of {@link priceFromCostAndMarkup}: what markup does this price
 * imply over this cost?
 *
 * Held to one decimal, which is what the markup field accepts. With no cost
 * recorded there is no meaningful percentage, so the price is treated as a
 * free override at 0 rather than reported as an infinite margin.
 */
export function markupFromCostAndPrice(cost: unknown, price: unknown): number {
  const parsedCost = parseNumber(cost)
  if (parsedCost <= 0) return 0
  return Math.round((parseNumber(price) / parsedCost - 1) * 1000) / 10
}

/**
 * What a line is worth. Rounded to the cent for the same reason every other
 * amount here is: this value is stored and then summed into a subtotal.
 */
export function lineTotal(quantity: unknown, unitPrice: unknown): number {
  return roundMoney(parseQuantity(quantity) * parseNumber(unitPrice))
}

/**
 * Turn the raw settings map into the pricing inputs the rest of this module
 * takes. Settings are stored as strings, so a missing or unparseable value has
 * to read as "no markup" rather than NaN.
 */
export function readPartsPricingSettings(
  settings: Record<string, string | undefined>,
  keys: { defaultMarkupPercent: string; markupAppliesToInventory: string },
): Required<PricingSettings> {
  return {
    defaultMarkupPercent: parseNumber(settings[keys.defaultMarkupPercent]),
    markupAppliesToInventory: settings[keys.markupAppliesToInventory] === 'true',
  }
}

export function resolvePartPrice(
  part: PricedPart,
  { defaultMarkupPercent = 0, markupAppliesToInventory = false }: PricingSettings = {},
): ResolvedPrice {
  const cost = parseNumber(part.unitCost)
  const sell = parseNumber(part.sellPrice)

  // The workshop prices parts from cost plus a house markup.
  if (markupAppliesToInventory && defaultMarkupPercent > 0) {
    return {
      unitPrice: priceFromCostAndMarkup(cost, defaultMarkupPercent),
      markupPercent: defaultMarkupPercent,
    }
  }

  // Otherwise the part's own sell price wins. Falling back to cost matters:
  // a part with no sell price set would otherwise be billed at zero, which is
  // worse than billing at cost and far easier to miss.
  return { unitPrice: sell > 0 ? sell : cost, markupPercent: 0 }
}
