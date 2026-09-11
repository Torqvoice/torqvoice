import { parseTaxComponents } from '@/lib/tax-components'
import type { TaxByRate } from '../Schema/reportTypes'

/**
 * The "tax by rate" table of the tax report, built one invoice at a time.
 *
 * A single-rate invoice lands under its rate, as it always has. An invoice
 * that carries tax components lands under each of them by name, so a Québec
 * workshop reads its GST total and its QST total straight off the report at
 * filing time, which is the figure each return asks for. Two rates with the
 * same name and rate share a row; "GST (5%)" and a plain 5% rate do not,
 * because they are declared on different returns.
 */
export class TaxByRateTable {
  private readonly rows = new Map<string, TaxByRate>()

  add(record: { taxRate: number; taxAmount: number; taxComponents?: unknown }): void {
    const components = parseTaxComponents(record.taxComponents)
    if (components) {
      for (const component of components) {
        this.bump(`${component.name}|${component.rate}`, component.rate, component.amount, {
          name: component.name,
        })
      }
      return
    }
    this.bump(String(record.taxRate), record.taxRate, record.taxAmount)
  }

  private bump(key: string, taxRate: number, amount: number, extra: { name?: string } = {}) {
    const row = this.rows.get(key) ?? { taxRate, taxCollected: 0, invoiceCount: 0, ...extra }
    row.taxCollected += amount
    row.invoiceCount += 1
    this.rows.set(key, row)
  }

  list(): TaxByRate[] {
    return [...this.rows.values()]
  }
}
