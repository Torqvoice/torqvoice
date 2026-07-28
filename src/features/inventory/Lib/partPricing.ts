/**
 * The single rule for what a stocked part costs a customer when it is added to
 * a job or a quote.
 *
 * It exists because there are now two ways to pull a part from stock, the
 * picker dialog and the inline name suggestion, and they must price it
 * identically. They did not: the suggestion used `sellPrice` directly, so any
 * part whose sell price was never filled in landed on the line at zero.
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

export function resolvePartPrice(
  part: PricedPart,
  { defaultMarkupPercent = 0, markupAppliesToInventory = false }: PricingSettings = {},
): ResolvedPrice {
  const cost = Number(part.unitCost) || 0
  const sell = Number(part.sellPrice) || 0

  // The workshop prices parts from cost plus a house markup.
  if (markupAppliesToInventory && defaultMarkupPercent > 0) {
    return {
      unitPrice: Math.round(cost * (1 + defaultMarkupPercent / 100) * 100) / 100,
      markupPercent: defaultMarkupPercent,
    }
  }

  // Otherwise the part's own sell price wins. Falling back to cost matters:
  // a part with no sell price set would otherwise be billed at zero, which is
  // worse than billing at cost and far easier to miss.
  return { unitPrice: sell > 0 ? sell : cost, markupPercent: 0 }
}
