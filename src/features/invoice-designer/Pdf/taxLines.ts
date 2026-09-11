import type { TaxComponent } from '@/lib/tax'
import { taxComponentLabel } from '@/lib/tax-components'
import type { TotalLine } from '../Spec/buildSpec'

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((str, [key, val]) => str.replace(`{${key}}`, val), template)
}

/**
 * The tax rows of a totals box: one line per component when the document
 * carries a split (GST and QST each on their own line, as Québec expects),
 * otherwise the single line every document printed before. A document with
 * no tax prints none.
 *
 * Shared by the invoice and the quote so the two sheets cannot drift.
 */
export function taxLines(args: {
  taxRate: number
  taxAmount: number
  components: TaxComponent[] | null
  /** The lines are printed with tax in them, so the row says how much of it is tax. */
  linesInclTax: boolean
  labels: Record<string, string>
  money: (value: number) => string
}): TotalLine[] {
  const { taxRate, taxAmount, components, linesInclTax, labels, money } = args
  const L = (key: string, fallback: string) => labels[key] || fallback

  if (components && components.length > 0) {
    return components.map((component) => ({
      label: linesInclTax
        ? fillTemplate(L('taxIncludedNamed', 'Includes {name} ({rate}%)'), {
            name: component.name,
            rate: String(component.rate),
          })
        : taxComponentLabel(component),
      value: money(component.amount),
      kind: 'line' as const,
    }))
  }

  if (taxRate <= 0) return []
  const rate = { rate: String(taxRate) }
  return [
    {
      label: linesInclTax
        ? fillTemplate(L('taxIncluded', 'Includes tax ({rate}%)'), rate)
        : labels.tax
          ? fillTemplate(labels.tax, rate)
          : `Tax (${taxRate}%)`,
      value: money(taxAmount),
      kind: 'line',
    },
  ]
}
