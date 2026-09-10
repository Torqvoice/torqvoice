import { describe, expect, it } from 'vitest'
import { buildSampleData } from '@/features/invoice-designer/Components/sample'
import type { DesignerWorkshop } from '@/features/invoice-designer/Components/types'

/**
 * The designer's sample job follows the workshop's tax. A workshop that
 * splits its tax sees its own lines and registration numbers on the canvas,
 * because that is the sheet it will print; every other workshop sees the
 * sample it always has.
 */

const t = (key: string) => key
const labels = {
  subtotal: 'Subtotal',
  tax: 'Tax ({rate}%)',
  total: 'Total',
  taxRegistrationLabel: '{name} No.',
  orgNumberLabel: 'Org. Number',
}

const workshop: DesignerWorkshop = {
  name: 'Garage Tremblay',
  address: '',
  phone: '',
  email: '',
  slogan: '',
  orgNumber: '',
  paymentTerms: '',
  logoUrl: '',
}

describe('the designer sample and a split tax', () => {
  it('taxes the sample job the workshop way, one line per tax', () => {
    const data = buildSampleData(
      {
        ...workshop,
        taxComponents: [
          { name: 'GST', rate: 5, registrationNumber: '123456789 RT0001' },
          { name: 'QST', rate: 9.975, registrationNumber: '1234567890 TQ0001' },
        ],
      },
      [],
      t,
      labels,
      'invoice'
    )
    const totals = data.totals.map((line) => [line.label, line.value])
    // 480.00 net: GST 24.00, QST 47.88, total 551.88
    expect(totals).toEqual(
      expect.arrayContaining([
        ['Subtotal', '€ 480.00'],
        ['GST (5%)', '€ 24.00'],
        ['QST (9.975%)', '€ 47.88'],
        ['Total', '€ 551.88'],
      ])
    )
    expect(totals.some(([label]) => label.startsWith('Tax ('))).toBe(false)
    expect(data.payment.map((pair) => [pair.label, pair.value])).toEqual(
      expect.arrayContaining([
        ['GST No.', '123456789 RT0001'],
        ['QST No.', '1234567890 TQ0001'],
      ])
    )
  })

  it('leaves a component without a registration off the payment panel', () => {
    const data = buildSampleData(
      {
        ...workshop,
        taxComponents: [
          { name: 'GST', rate: 5 },
          { name: 'PST', rate: 7 },
        ],
      },
      [],
      t,
      labels,
      'invoice'
    )
    expect(data.payment.some((pair) => pair.label.endsWith('No.'))).toBe(false)
    expect(data.totals.map((line) => line.label)).toEqual(
      expect.arrayContaining(['GST (5%)', 'PST (7%)'])
    )
  })

  it('shows the single 25% line to everyone else', () => {
    const data = buildSampleData(workshop, [], t, labels, 'invoice')
    expect(data.totals.map((line) => [line.label, line.value])).toEqual(
      expect.arrayContaining([
        ['Tax (25%)', '€ 120.00'],
        ['Total', '€ 600.00'],
      ])
    )
    expect(data.payment.some((pair) => pair.label.endsWith('No.'))).toBe(false)
  })
})
