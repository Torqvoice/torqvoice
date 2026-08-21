/**
 * Finding the stocked tire that matches a stored one.
 *
 * Tire sizes are written a dozen ways for the same tire: "225/45R17",
 * "225/45 R17", "P225/45R17 94V", "225/45ZR17". Matching on the string as
 * typed would miss most of them, so both sides are reduced to the three
 * numbers that actually identify a fitment and compared on those.
 */

export type TireSize = {
  /** Section width in mm, e.g. 225. */
  width: number
  /** Aspect ratio, e.g. 45. */
  ratio: number
  /** Rim diameter in inches, e.g. 17. */
  rim: number
}

/**
 * Pulls the fitment out of free text, ignoring load and speed indices, the
 * P/LT prefix, and whatever separator was used. Returns null when the string
 * does not contain a recognisable size, which is common: plenty of shops
 * leave the field blank or write "winter set".
 */
export function parseTireSize(raw: string | null | undefined): TireSize | null {
  if (!raw) return null
  // width / ratio, then an optional construction letter (R, ZR, D, B), then
  // the rim. Anything between them that is not a digit is treated as noise.
  const match = raw.match(/(\d{3})\s*\/\s*(\d{2})\s*(?:[A-Za-z]{1,2})?\s*(\d{2}(?:\.\d)?)/)
  if (!match) return null

  const width = Number(match[1])
  const ratio = Number(match[2])
  const rim = Number(match[3])
  if (!Number.isFinite(width) || !Number.isFinite(ratio) || !Number.isFinite(rim)) return null

  // Guard against matching an unrelated run of digits, e.g. a DOT code.
  if (width < 125 || width > 395) return null
  if (ratio < 20 || ratio > 95) return null
  if (rim < 10 || rim > 26) return null

  return { width, ratio, rim }
}

export function sizesMatch(a: TireSize | null, b: TireSize | null): boolean {
  if (!a || !b) return false
  return a.width === b.width && a.ratio === b.ratio && a.rim === b.rim
}

/** Canonical form for display, so a quote line reads consistently. */
export function formatTireSize(size: TireSize): string {
  return `${size.width}/${size.ratio}R${size.rim}`
}

export type StockCandidate = {
  id: string
  name: string
  partNumber: string | null
  description: string | null
  category: string | null
  quantity: number
  unitCost: number
  sellPrice: number
}

export type TireMatch = StockCandidate & {
  /** Whether there is enough on the shelf for the whole set. */
  inStock: boolean
}

/**
 * Stocked tires whose size matches the stored set, best first.
 *
 * "Best" means sellable before not: a part that is in stock for the whole set
 * is worth more to the person quoting than a cheaper one they would have to
 * order, and the price is what the customer is being asked to agree to.
 */
export function matchStock(
  candidates: StockCandidate[],
  storedSize: string | null | undefined,
  quantity: number
): TireMatch[] {
  const target = parseTireSize(storedSize)
  if (!target) return []

  return candidates
    .filter(
      (part) =>
        // The size can be written into any of the three free-text fields, and
        // shops are not consistent about which.
        sizesMatch(parseTireSize(part.name), target) ||
        sizesMatch(parseTireSize(part.partNumber), target) ||
        sizesMatch(parseTireSize(part.description), target)
    )
    .map((part) => ({ ...part, inStock: part.quantity >= quantity }))
    .sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1
      return a.sellPrice - b.sellPrice
    })
}
