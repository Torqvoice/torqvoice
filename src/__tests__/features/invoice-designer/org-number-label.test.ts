import { describe, expect, it } from 'vitest'
import { withOrgNumberLabel } from '@/features/invoice-designer/Lib/labelOverrides'
import { loadPrintLabels } from '@/features/invoice-designer/Pdf/printLabels'

describe('organisation number label', () => {
  it('leaves the translated caption alone when the workshop has not named it', () => {
    const labels = { orgNumberLabel: 'Org. Number', org: 'Org: {org}' }
    expect(withOrgNumberLabel(labels, '')).toEqual(labels)
    expect(withOrgNumberLabel(labels, '   ')).toEqual(labels)
    expect(withOrgNumberLabel(labels, undefined)).toEqual(labels)
  })

  it("uses the workshop's own caption in both places the number is printed", () => {
    const labels = withOrgNumberLabel({ orgNumberLabel: 'Org. Number', org: 'Org: {org}' }, ' ABN ')
    expect(labels.orgNumberLabel).toBe('ABN')
    expect(labels.org).toBe('ABN: {org}')
  })

  it('reaches the printed labels through the settings, for invoices and quotes', async () => {
    const invoice = await loadPrintLabels('en', { 'workshop.orgNumberLabel': 'Company no.' })
    const quote = await loadPrintLabels('nb', { 'workshop.orgNumberLabel': 'CVR' }, 'quote')
    expect(invoice.orgNumberLabel).toBe('Company no.')
    expect(quote.orgNumberLabel).toBe('CVR')
    const plain = await loadPrintLabels('en', {})
    expect(plain.orgNumberLabel).toBe('Org. Number')
  })
})
