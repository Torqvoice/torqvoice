import { describe, expect, it } from 'vitest'
import { buildSampleData } from '@/features/invoice-designer/Components/sample'
import type { DesignerWorkshop } from '@/features/invoice-designer/Components/types'
import { formatCurrency, formatDateForPdf } from '@/lib/format'

/**
 * The designer's sample sheet is written in the workshop's own money and date
 * format, the way its printed sheets are. A workshop in dollars used to
 * preview "€ 149.00" and a European date.
 */

const t = (key: string) => key
const labels = { subtotal: 'Subtotal', tax: 'Tax ({rate}%)', total: 'Total' }
const workshop: DesignerWorkshop = {
  name: 'Fjord Bil',
  address: '',
  phone: '',
  email: '',
  slogan: '',
  orgNumber: '',
  paymentTerms: '',
  logoUrl: '',
}

describe('the designer sample in the workshop currency', () => {
  it('writes every amount and date the way the workshop prints them', () => {
    const nok = {
      money: (amount: number) => formatCurrency(amount, 'NOK', 'symbol'),
      date: (date: Date) => formatDateForPdf(date, 'dd.MM.yyyy'),
    }
    const data = buildSampleData(workshop, [], t, labels, 'invoice', nok)
    const totals = Object.fromEntries(data.totals.map((line) => [line.label, line.value]))
    expect(totals.Subtotal).toBe(formatCurrency(480, 'NOK', 'symbol'))
    expect(totals.Total).toBe(formatCurrency(600, 'NOK', 'symbol'))
    expect(data.meta.date).toBe('14.08.2026')
    expect(data.meta.due).toBe('28.08.2026')
    expect(JSON.stringify(data)).not.toContain('€')
  })

  it('falls back to the app default currency, not euros', () => {
    const data = buildSampleData(workshop, [], t, labels, 'invoice')
    const totals = Object.fromEntries(data.totals.map((line) => [line.label, line.value]))
    expect(totals.Total).toBe('$600.00')
    expect(JSON.stringify(data)).not.toContain('€')
  })
})
