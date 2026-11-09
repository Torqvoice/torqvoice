/**
 * Which Xero tax rate a line is booked under.
 *
 * Every Xero organisation has its own list of tax rates, each known by a
 * TaxType code: GST on Income is OUTPUT in Australia and OUTPUT2 in New
 * Zealand, a custom rate is TAX001 and up. So nothing is hard-coded: the
 * organisation's sales rates are read, and the one whose percentage matches
 * the invoice is used, unless the workshop chose one. Lines without tax go
 * under a zero rate, preferring the codes that report a tax-free sale as one.
 */

export interface XeroTaxRate {
  Name?: string
  TaxType?: string
  Status?: string
  /** The rate as a number of percent, such as 10 or 15. */
  EffectiveRate?: number | string
  DisplayTaxRate?: number | string
  CanApplyToRevenue?: boolean
  ReportTaxType?: string
}

export interface TaxRateEntry {
  taxType: string
  name: string
  percent: number
  reportTaxType: string | null
}

/**
 * Zero-rated sales codes, best first: GST Free Income (AU), Zero Rated (NZ is
 * ZERORATED, the UK ZERORATEDOUTPUT), then No GST / Tax Exempt (NONE).
 */
const ZERO_PREFERENCE = ['EXEMPTOUTPUT', 'ZERORATED', 'ZERORATEDOUTPUT', 'NONE']

function percentOf(r: XeroTaxRate): number | null {
  const raw = r.EffectiveRate ?? r.DisplayTaxRate
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''))
  return Number.isFinite(n) ? n : null
}

/** The organisation's active rates that a sale can carry. */
export function salesRates(rates: XeroTaxRate[]): TaxRateEntry[] {
  const out: TaxRateEntry[] = []
  for (const r of rates) {
    if (!r.TaxType || (r.Status && r.Status !== 'ACTIVE')) continue
    if (r.CanApplyToRevenue === false) continue
    const percent = percentOf(r)
    if (percent === null) continue
    out.push({
      taxType: r.TaxType,
      name: r.Name ?? r.TaxType,
      percent,
      reportTaxType: r.ReportTaxType ?? null,
    })
  }
  return out
}

const samePercent = (a: number, b: number) => Math.abs(a - b) < 0.0005

/**
 * The rate for taxed lines. A rate the workshop chose is used whatever its
 * percentage, and `matched` says whether it agrees with the invoice. With
 * none chosen, the first rate carrying the invoice's percentage wins, the
 * standard output codes before custom ones.
 */
export function pickTaxedRate(
  rates: TaxRateEntry[],
  percent: number,
  chosen: string | null
): { entry: TaxRateEntry | null; matched: boolean } {
  if (chosen) {
    const entry = rates.find((r) => r.taxType === chosen) ?? null
    return { entry, matched: Boolean(entry && samePercent(entry.percent, percent)) }
  }
  const candidates = rates.filter((r) => r.percent > 0 && samePercent(r.percent, percent))
  const standard = candidates.find((r) => /^OUTPUT\d*$/.test(r.taxType))
  const entry = standard ?? candidates[0] ?? null
  return { entry, matched: Boolean(entry) }
}

/** The rate for lines without tax: the workshop's choice, else the best zero rate there is. */
export function pickZeroRate(rates: TaxRateEntry[], chosen: string | null): TaxRateEntry | null {
  if (chosen) return rates.find((r) => r.taxType === chosen) ?? null
  const zero = rates.filter((r) => samePercent(r.percent, 0))
  for (const code of ZERO_PREFERENCE) {
    const hit = zero.find((r) => r.taxType === code)
    if (hit) return hit
  }
  return zero[0] ?? null
}

/** How a rate shows in the settings list. */
export function rateLabel(r: TaxRateEntry): string {
  return `${r.name} (${r.percent}%)`
}
