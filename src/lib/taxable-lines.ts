/**
 * Which lines of a document are taxed.
 *
 * A workshop says which kinds of charge its tax applies to: parts, labor and
 * the shop fee. That answer is the default for a new line of that kind. The
 * line then carries its own flag, because the rule has exceptions the kind
 * cannot express (a disposal fee among the parts, fabrication labor that is
 * taxed where repair labor is not), and because a later change in settings
 * must not re-tax a job that already went out.
 *
 * Nothing here reads settings or the database: it is shared by the editors,
 * which total a document as it is typed, and the server, which has the last
 * word on what is stored.
 */

import { roundMoney } from './money'

/** The kinds of charge the workshop's tax can be switched on or off for. */
export interface TaxApplies {
  parts: boolean
  labor: boolean
  shopFee: boolean
}

/** Every kind taxed: how every workshop starts, and what "no setting" means. */
export const TAX_APPLIES_TO_ALL: TaxApplies = { parts: true, labor: true, shopFee: true }

export type TaxLineKind = keyof TaxApplies

/** A shop fee is stored among the labor lines and told apart by how it is priced. */
export function laborLineKind(line: { pricingType?: string | null }): 'labor' | 'shopFee' {
  return line.pricingType === 'shopFee' ? 'shopFee' : 'labor'
}

/**
 * Whether a line is taxed: what the line itself says, or the workshop's
 * answer for its kind when it says nothing. A line says nothing until
 * somebody chooses for it, or when it comes from a client built before
 * lines could be untaxed.
 */
export function resolveTaxable(
  explicit: boolean | null | undefined,
  kind: TaxLineKind,
  applies: TaxApplies = TAX_APPLIES_TO_ALL
): boolean {
  return typeof explicit === 'boolean' ? explicit : applies[kind]
}

export function partTaxable(
  line: { taxable?: boolean | null },
  applies: TaxApplies = TAX_APPLIES_TO_ALL
): boolean {
  return resolveTaxable(line.taxable, 'parts', applies)
}

export function laborTaxable(
  line: { taxable?: boolean | null; pricingType?: string | null },
  applies: TaxApplies = TAX_APPLIES_TO_ALL
): boolean {
  return resolveTaxable(line.taxable, laborLineKind(line), applies)
}

type MoneyLine = { total?: number | null; taxable?: boolean | null }

const sum = (lines: readonly MoneyLine[], pick: (line: MoneyLine) => boolean): number =>
  lines.reduce((acc, line) => (pick(line) ? acc + (Number(line.total) || 0) : acc), 0)

/** The taxable share of a list of part lines. */
export function taxablePartsTotal(
  parts: readonly MoneyLine[],
  applies: TaxApplies = TAX_APPLIES_TO_ALL
): number {
  return sum(parts, (line) => partTaxable(line, applies))
}

/** The taxable share of a list of labor lines, shop fee included. */
export function taxableLaborTotal(
  labor: readonly (MoneyLine & { pricingType?: string | null })[],
  applies: TaxApplies = TAX_APPLIES_TO_ALL
): number {
  return sum(labor, (line) => laborTaxable(line, applies))
}

/**
 * The sum of a document's taxable lines: the `taxableSubtotal` its totals
 * are built from. Pass the lines the subtotal was summed from and no others
 * (a quote leaves out the lines the customer declined).
 */
export function taxableSubtotalOf(
  parts: readonly MoneyLine[],
  labor: readonly (MoneyLine & { pricingType?: string | null })[],
  applies: TaxApplies = TAX_APPLIES_TO_ALL
): number {
  return roundMoney(taxablePartsTotal(parts, applies) + taxableLaborTotal(labor, applies))
}

/** True when at least one line of the document is left out of the tax. */
export function hasUntaxedLines(
  parts: readonly MoneyLine[],
  labor: readonly (MoneyLine & { pricingType?: string | null })[],
  applies: TaxApplies = TAX_APPLIES_TO_ALL
): boolean {
  return (
    parts.some((line) => !partTaxable(line, applies)) ||
    labor.some((line) => !laborTaxable(line, applies))
  )
}

/**
 * Part lines with the flag settled: each keeps what it said, and one that
 * said nothing takes the workshop's answer for parts. What the server stores,
 * so a stored line always carries a plain yes or no.
 */
export function withTaxableParts<T extends { taxable?: boolean | null }>(
  lines: readonly T[],
  applies: TaxApplies
): (Omit<T, 'taxable'> & { taxable: boolean })[] {
  return lines.map((line) => ({ ...line, taxable: partTaxable(line, applies) }))
}

/** Labor lines with the flag settled; a shop fee line takes the answer for the fee. */
export function withTaxableLabor<
  T extends { taxable?: boolean | null; pricingType?: string | null },
>(lines: readonly T[], applies: TaxApplies): (Omit<T, 'taxable'> & { taxable: boolean })[] {
  return lines.map((line) => ({ ...line, taxable: laborTaxable(line, applies) }))
}

/**
 * How much of a document is taxed, for the places that show its totals: the
 * taxable part of the parts, of the labor and of the subtotal, in the terms
 * the lines were entered in, and what the tax was charged on once the
 * discount is counted. Only ever built for a document with at least one
 * untaxed line; where every line is taxed there is nothing to say, and the
 * totals read as they always have.
 */
export interface TaxableShare {
  parts: number
  labor: number
  subtotal: number
  /** The "Taxable amount" a totals box shows above the tax. */
  taxableAmount: number
}

/**
 * The sum of a template's lines that the workshop taxes today, for the
 * invoice about to be generated from it. A template's lines carry no tax
 * choice of their own, so each follows the rule for its kind; a shop fee is
 * a labor row told apart by how it is priced, and has its own rule.
 */
export function recurringTaxableSubtotal(
  template: {
    cost: number
    templateParts: { quantity: number; unitPrice: number }[]
    templateLabor: { hours: number; rate: number; pricingType?: string | null }[]
  },
  applies: TaxApplies
): number {
  const parts = template.templateParts.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0)
  const labor = template.templateLabor.reduce(
    (sum, l) => (laborTaxable(l, applies) ? sum + l.hours * l.rate : sum),
    0
  )
  return template.cost + (applies.parts ? parts : 0) + labor
}
