import { describe, expect, it } from 'vitest'
import { calculateTotals, combinedTaxRate, splitTaxAmount } from '@/lib/tax'
import {
  parseTaxComponentDefinitions,
  parseTaxComponents,
  serializeTaxComponentDefinitions,
  TAX_COMPONENT_PRESETS,
  taxComponentLabel,
  taxComponentsJson,
} from '@/lib/tax-components'
import {
  documentTotals,
  readWorkshopTax,
  taxFieldsForNewDocument,
} from '@/features/settings/Lib/workshopTax'

/**
 * A document taxed in more than one part: Québec's GST and QST are the
 * worked example throughout, because the combined figure (14.975%) and the
 * half-cent cases (900 at 9.975% is 89.775) are where a naive split goes
 * wrong.
 */

const QUEBEC = [
  { name: 'GST', rate: 5 },
  { name: 'QST', rate: 9.975 },
]

describe('combinedTaxRate', () => {
  it('adds non-compounding rates exactly', () => {
    expect(combinedTaxRate(QUEBEC)).toBe(14.975)
    expect(
      combinedTaxRate([
        { name: 'CGST', rate: 9 },
        { name: 'SGST', rate: 9 },
      ])
    ).toBe(18)
  })

  it('gives the effective rate when a component compounds on the ones before it', () => {
    // 5% then 9.975% on the price plus the 5%: 1.05 × 1.09975 = 1.1547375
    expect(
      combinedTaxRate([
        { name: 'GST', rate: 5 },
        { name: 'QST', rate: 9.975, compound: true },
      ])
    ).toBeCloseTo(15.47375, 5)
  })

  it('is zero with no components', () => {
    expect(combinedTaxRate([])).toBe(0)
  })
})

describe('calculateTotals with components', () => {
  it('charges each component on the net base and sums them (exclusive)', () => {
    const r = calculateTotals({
      subtotal: 900,
      discountAmount: 0,
      taxRate: 14.975,
      taxInclusive: false,
      components: QUEBEC,
    })
    expect(r.components).toEqual([
      { name: 'GST', rate: 5, amount: 45 },
      { name: 'QST', rate: 9.975, amount: 89.78 },
    ])
    // The lines are what the customer adds up, so the tax is their sum.
    expect(r.taxAmount).toBe(134.78)
    expect(r.totalAmount).toBe(1034.78)
  })

  it('takes the discount off before either tax', () => {
    const r = calculateTotals({
      subtotal: 900,
      discountAmount: 90,
      taxRate: 14.975,
      taxInclusive: false,
      components: QUEBEC,
    })
    expect(r.components?.map((c) => c.amount)).toEqual([40.5, 80.8])
    expect(r.totalAmount).toBe(931.3)
  })

  it('reads the rate off the components rather than the argument', () => {
    // A stale combined rate on the row cannot change what the split charges.
    const r = calculateTotals({
      subtotal: 100,
      discountAmount: 0,
      taxRate: 99,
      taxInclusive: false,
      components: QUEBEC,
    })
    expect(r.taxAmount).toBeCloseTo(14.98, 2)
  })

  it('backs the combined tax out of a gross price and shares it by rate (inclusive)', () => {
    // 1034.78 gross at 14.975% is 900.00 net and 134.78 tax
    const r = calculateTotals({
      subtotal: 1034.78,
      discountAmount: 0,
      taxRate: 14.975,
      taxInclusive: true,
      components: QUEBEC,
    })
    expect(r.totalAmount).toBe(1034.78)
    expect(r.taxAmount).toBeCloseTo(134.78, 2)
    const [gst, qst] = r.components!
    expect(gst.amount).toBe(45)
    expect(qst.amount).toBe(89.78)
    // Whatever the rounding, the lines add up to the tax on the sheet.
    expect(gst.amount + qst.amount).toBeCloseTo(Math.round(r.taxAmount * 100) / 100, 2)
  })

  it('gives the last component the rounding remainder', () => {
    // Three equal thirds of 1.00 cannot each be a whole cent.
    const split = splitTaxAmount({
      base: 100,
      taxAmount: 1,
      taxInclusive: true,
      components: [
        { name: 'A', rate: 1 },
        { name: 'B', rate: 1 },
        { name: 'C', rate: 1 },
      ],
    })
    expect(split.map((c) => c.amount)).toEqual([0.33, 0.33, 0.34])
  })

  it('compounds when told to (exclusive)', () => {
    const r = calculateTotals({
      subtotal: 100,
      discountAmount: 0,
      taxRate: 0,
      taxInclusive: false,
      components: [
        { name: 'GST', rate: 5 },
        { name: 'QST', rate: 9.975, compound: true },
      ],
    })
    expect(r.components?.map((c) => c.amount)).toEqual([5, 10.47])
    expect(r.totalAmount).toBe(115.47)
  })

  it('is the single-rate calculation when there are no components', () => {
    const plain = calculateTotals({
      subtotal: 900,
      discountAmount: 0,
      taxRate: 25,
      taxInclusive: false,
    })
    expect(plain).toEqual({ taxAmount: 225, totalAmount: 1125, components: null })
    const empty = calculateTotals({
      subtotal: 900,
      discountAmount: 0,
      taxRate: 25,
      taxInclusive: false,
      components: [],
    })
    expect(empty.components).toBeNull()
    expect(empty.taxAmount).toBe(225)
  })

  it('carries zero-amount components on a zero-rate inclusive document', () => {
    const r = calculateTotals({
      subtotal: 100,
      discountAmount: 0,
      taxRate: 0,
      taxInclusive: true,
      components: [{ name: 'Exempt', rate: 0 }],
    })
    expect(r.taxAmount).toBe(0)
    expect(r.components).toEqual([{ name: 'Exempt', rate: 0, amount: 0 }])
  })
})

describe('stored shape', () => {
  it('reads a stored breakdown and drops what is not one', () => {
    const stored = [{ name: 'GST', rate: 5, amount: 45, registrationNumber: '123456789 RT0001' }]
    expect(parseTaxComponents(stored)).toEqual(stored)
    expect(parseTaxComponents(JSON.stringify(stored))).toEqual(stored)
    expect(parseTaxComponents(null)).toBeNull()
    expect(parseTaxComponents([])).toBeNull()
    expect(parseTaxComponents('not json')).toBeNull()
    expect(parseTaxComponents({ name: 'GST' })).toBeNull()
    expect(parseTaxComponents([{ name: '', rate: 5, amount: 1 }])).toBeNull()
  })

  it('reads the settings definition without amounts', () => {
    expect(parseTaxComponentDefinitions('[{"name":"GST","rate":"5"}]')).toEqual([
      { name: 'GST', rate: 5 },
    ])
    expect(parseTaxComponentDefinitions('')).toBeNull()
    expect(parseTaxComponentDefinitions(undefined)).toBeNull()
  })

  it('strips empty optional fields on the way in and out', () => {
    const parsed = parseTaxComponents([
      { name: 'GST', rate: 5, amount: 1, registrationNumber: '', compound: false },
    ])
    expect(parsed).toEqual([{ name: 'GST', rate: 5, amount: 1 }])
    expect(
      taxComponentsJson([{ name: 'QST', rate: 9.975, amount: 2, registrationNumber: '' }])
    ).toEqual([{ name: 'QST', rate: 9.975, amount: 2 }])
    expect(serializeTaxComponentDefinitions([{ name: 'GST', rate: 5, compound: false }])).toBe(
      '[{"name":"GST","rate":5}]'
    )
  })

  it('labels a component the way the sheet prints it', () => {
    expect(taxComponentLabel({ name: 'QST', rate: 9.975 })).toBe('QST (9.975%)')
  })

  it('ships presets that add up to the published combined rates', () => {
    const byId = Object.fromEntries(TAX_COMPONENT_PRESETS.map((p) => [p.id, p]))
    expect(combinedTaxRate(byId['ca-qc'].components)).toBe(14.975)
    expect(combinedTaxRate(byId['ca-bc'].components)).toBe(12)
    expect(combinedTaxRate(byId['ca-sk'].components)).toBe(11)
    expect(combinedTaxRate(byId['ca-mb'].components)).toBe(12)
    expect(combinedTaxRate(byId['in-intra'].components)).toBe(18)
    for (const preset of TAX_COMPONENT_PRESETS) {
      for (const c of preset.components) expect(c.registrationNumber).toBeUndefined()
    }
  })
})

describe('workshop tax settings', () => {
  const split = {
    'workshop.taxEnabled': 'true',
    'workshop.defaultTaxRate': '14.975',
    'workshop.taxInclusive': 'false',
    'workshop.taxMode': 'split',
    'workshop.taxComponents': JSON.stringify([
      { name: 'GST', rate: 5, registrationNumber: '123456789 RT0001' },
      { name: 'QST', rate: 9.975, registrationNumber: '1234567890 TQ0001' },
    ]),
  }

  it('reads components only in split mode', () => {
    expect(readWorkshopTax(split).components).toHaveLength(2)
    expect(readWorkshopTax({ ...split, 'workshop.taxMode': 'single' }).components).toBeNull()
    expect(readWorkshopTax({ ...split, 'workshop.taxMode': '' }).components).toBeNull()
    expect(readWorkshopTax({ ...split, 'workshop.taxEnabled': 'false' })).toEqual({
      enabled: false,
      rate: 0,
      inclusive: false,
      components: null,
    })
  })

  it('starts a new document with the split at zero, and none for an exempt customer', () => {
    const fields = taxFieldsForNewDocument(readWorkshopTax(split))
    expect(fields.taxRate).toBe(14.975)
    expect(fields.taxComponents).toEqual([
      { name: 'GST', rate: 5, amount: 0, registrationNumber: '123456789 RT0001' },
      { name: 'QST', rate: 9.975, amount: 0, registrationNumber: '1234567890 TQ0001' },
    ])
    const exempt = taxFieldsForNewDocument(readWorkshopTax(split), { customerExempt: true })
    expect(exempt).toEqual({ taxRate: 0, taxInclusive: false, taxComponents: undefined })
  })

  it('re-totals a document from the split stored on it', () => {
    const fields = taxFieldsForNewDocument(readWorkshopTax(split))
    const totals = documentTotals({
      subtotal: 900,
      discountAmount: 0,
      taxRate: 14.975,
      taxInclusive: false,
      taxComponents: fields.taxComponents,
    })
    expect(totals.taxAmount).toBe(134.78)
    expect(totals.totalAmount).toBe(1034.78)
    expect(totals.taxComponents).toEqual([
      { name: 'GST', rate: 5, amount: 45, registrationNumber: '123456789 RT0001' },
      { name: 'QST', rate: 9.975, amount: 89.78, registrationNumber: '1234567890 TQ0001' },
    ])
  })

  it('leaves a single-rate document exactly as before', () => {
    const totals = documentTotals({
      subtotal: 900,
      discountAmount: 0,
      taxRate: 25,
      taxInclusive: false,
      taxComponents: null,
    })
    expect(totals).toEqual({ taxAmount: 225, totalAmount: 1125, taxComponents: undefined })
  })
})
