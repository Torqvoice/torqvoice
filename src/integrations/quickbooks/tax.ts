import { type QboRef, type QboTaxCode, type QboTaxRate, round2 } from './mapping'

/**
 * How the ledger and the workshop agree on tax.
 *
 * The workshop puts one rate on an invoice, the ledger books tax under a tax
 * code. Two kinds of company exist. A US company on automated sales tax has
 * no real codes: a line carries TAX or NON and QuickBooks works the rate out
 * from the customer's address. Every other company has real codes, each a
 * bundle of one or more rates with a percentage. Here the code whose rates
 * add up to the invoice's own rate is picked for it, so a workshop that bills
 * 19% one day and 7% the next needs no per-rate setup.
 *
 * Either way QuickBooks recalculates. When it must agree with the document
 * the customer already holds, the tax amount is sent along as an override:
 * TxnTaxDetail.TotalTax, with a TaxLine naming the rate where the company
 * has real rates, which is how Intuit documents overriding for both models.
 */

/** The two pseudo codes of an automated-sales-tax company; not TaxCode rows. */
export const US_TAXABLE = 'TAX'
export const US_NON_TAXABLE = 'NON'
export const US_TAX_CODES = [
  { value: US_TAXABLE, label: 'TAX (taxable)' },
  { value: US_NON_TAXABLE, label: 'NON (not taxable)' },
]

export interface TaxCatalogEntry {
  id: string
  name: string
  taxable: boolean
  /** The sales rates the code bundles; one for a plain VAT code, several for a group. */
  rateIds: string[]
  /** The rates added up, or null when a rate's value is unknown. */
  percent: number | null
}

/** Two percentages that print the same are the same rate. */
export function ratesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005
}

/** The codes with their combined sales rate, from the two tables QuickBooks keeps them in. */
export function buildTaxCatalog(codes: QboTaxCode[], rates: QboTaxRate[]): TaxCatalogEntry[] {
  const rateValue = new Map(rates.map((r) => [r.Id, r.RateValue]))
  return codes
    .filter((c) => c.Active !== false)
    .map((c) => {
      const raw = c.SalesTaxRateList?.TaxRateDetail
      const details = Array.isArray(raw) ? raw : raw ? [raw] : []
      const rateIds = details
        .filter((d) => !d.TaxTypeApplicable || d.TaxTypeApplicable === 'TaxOnAmount')
        .map((d) => d.TaxRateRef?.value)
        .filter((v): v is string => Boolean(v))
      let percent: number | null = rateIds.length > 0 ? 0 : null
      for (const id of rateIds) {
        const v = rateValue.get(id)
        if (typeof v !== 'number') {
          percent = null
          break
        }
        percent = (percent ?? 0) + v
      }
      // A code whose only rate is 0 is a zero-rated code, and the API often
      // omits Taxable on those; treat it as not taxable.
      const taxable = c.Taxable === true || (c.Taxable === undefined && (percent ?? 0) > 0)
      return { id: c.Id, name: c.Name, taxable, rateIds, percent }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface TaxCodePick {
  /** The code to put on the lines, or null when there is nothing to use. */
  id: string | null
  entry: TaxCatalogEntry | null
  /** False when a catalog was read and no code carries the invoice's rate. */
  matched: boolean
}

/**
 * The code for a taxed invoice. The workshop's chosen code wins when its rate
 * fits; otherwise any code with the rate; failing that the chosen code with a
 * flag, so the push can say so. An empty catalog means the rates could not be
 * read, and the chosen code is trusted.
 */
export function pickTaxableCode(
  catalog: TaxCatalogEntry[],
  rate: number,
  configured: string | null
): TaxCodePick {
  const chosen = configured ? (catalog.find((c) => c.id === configured) ?? null) : null
  if (catalog.length === 0) return { id: configured, entry: null, matched: true }
  if (chosen?.percent != null && ratesMatch(chosen.percent, rate)) {
    return { id: chosen.id, entry: chosen, matched: true }
  }
  const fits = catalog
    .filter((c) => c.percent != null && ratesMatch(c.percent, rate))
    .sort((a, b) => Number(b.taxable) - Number(a.taxable) || a.rateIds.length - b.rateIds.length)
  if (fits[0]) return { id: fits[0].id, entry: fits[0], matched: true }
  return { id: configured, entry: chosen, matched: false }
}

/** The code for an untaxed invoice: the chosen one, else a zero-rated code the company has. */
export function pickZeroCode(catalog: TaxCatalogEntry[], configured: string | null): string | null {
  if (configured) return configured
  const zero = catalog
    .filter((c) => c.percent === 0)
    .sort((a, b) => Number(a.taxable) - Number(b.taxable))
  return zero[0]?.id ?? null
}

/** The override for an automated-sales-tax company: the code says intent, the amount is ours. */
export function astTaxDetail(taxCode: string, taxAmount: number): Record<string, unknown> {
  return { TxnTaxCodeRef: { value: taxCode } satisfies QboRef, TotalTax: round2(taxAmount) }
}

/** The override for a company with real rates: the amount, and the one rate it belongs to. */
export function globalTaxDetail(input: {
  rateId: string
  percent: number
  taxAmount: number
  netTaxable: number
}): Record<string, unknown> {
  return {
    TotalTax: round2(input.taxAmount),
    TaxLine: [
      {
        Amount: round2(input.taxAmount),
        DetailType: 'TaxLineDetail',
        TaxLineDetail: {
          TaxRateRef: { value: input.rateId },
          PercentBased: true,
          TaxPercent: input.percent,
          NetAmountTaxable: round2(input.netTaxable),
        },
      },
    ],
  }
}
