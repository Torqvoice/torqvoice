import { describe, expect, it } from 'vitest'
import {
  astTaxDetail,
  buildTaxCatalog,
  globalTaxDetail,
  pickTaxableCode,
  pickZeroCode,
  ratesMatch,
} from '@/integrations/quickbooks/tax'

const rates = [
  { Id: 'r20', RateValue: 20 },
  { Id: 'r5', RateValue: 5 },
  { Id: 'r7', RateValue: 7 },
  { Id: 'r0', RateValue: 0 },
]

const codes = [
  {
    Id: 'S',
    Name: '20.0% S',
    Taxable: true,
    SalesTaxRateList: { TaxRateDetail: [{ TaxRateRef: { value: 'r20' } }] },
  },
  {
    Id: 'HST',
    Name: 'GST+PST',
    Taxable: true,
    SalesTaxRateList: {
      TaxRateDetail: [
        { TaxRateRef: { value: 'r5' }, TaxTypeApplicable: 'TaxOnAmount' },
        { TaxRateRef: { value: 'r7' }, TaxTypeApplicable: 'TaxOnAmount' },
      ],
    },
  },
  { Id: 'Z', Name: 'Zero', SalesTaxRateList: { TaxRateDetail: { TaxRateRef: { value: 'r0' } } } },
  { Id: 'X', Name: 'Exempt', Taxable: false },
  {
    Id: 'U',
    Name: 'Unknown rate',
    SalesTaxRateList: { TaxRateDetail: [{ TaxRateRef: { value: 'gone' } }] },
  },
  { Id: 'old', Name: 'Retired', Active: false, Taxable: true },
]

describe('QuickBooks tax catalog', () => {
  const catalog = buildTaxCatalog(codes, rates)

  it('adds a code’s rates up, reads one or many rate details, and drops inactive codes', () => {
    expect(catalog.map((c) => [c.id, c.percent, c.rateIds])).toEqual([
      ['S', 20, ['r20']],
      ['X', null, []],
      ['HST', 12, ['r5', 'r7']],
      ['U', null, ['gone']],
      ['Z', 0, ['r0']],
    ])
  })

  it('infers taxable from the rate when the flag is missing', () => {
    expect(catalog.find((c) => c.id === 'Z')?.taxable).toBe(false)
    expect(catalog.find((c) => c.id === 'S')?.taxable).toBe(true)
  })

  it('prefers the chosen code when its rate fits, else any code with the rate', () => {
    expect(pickTaxableCode(catalog, 20, 'S')).toMatchObject({ id: 'S', matched: true })
    expect(pickTaxableCode(catalog, 12, 'S')).toMatchObject({ id: 'HST', matched: true })
    expect(pickTaxableCode(catalog, 20, null)).toMatchObject({ id: 'S', matched: true })
  })

  it('flags a rate no code carries and falls back to the chosen code', () => {
    expect(pickTaxableCode(catalog, 19, 'S')).toMatchObject({ id: 'S', matched: false })
    expect(pickTaxableCode(catalog, 19, null)).toMatchObject({ id: null, matched: false })
  })

  it('trusts the chosen code when the catalog could not be read', () => {
    expect(pickTaxableCode([], 19, 'S')).toEqual({ id: 'S', entry: null, matched: true })
  })

  it('finds a zero-rated code for untaxed invoices when none is chosen', () => {
    expect(pickZeroCode(catalog, 'X')).toBe('X')
    expect(pickZeroCode(catalog, null)).toBe('Z')
    expect(pickZeroCode([], null)).toBeNull()
  })

  it('treats rates that print the same as equal', () => {
    expect(ratesMatch(20, 20.004)).toBe(true)
    expect(ratesMatch(20, 20.01)).toBe(false)
  })

  it('shapes the two overrides the way Intuit documents them', () => {
    expect(astTaxDetail('TAX', 43.749)).toEqual({
      TxnTaxCodeRef: { value: 'TAX' },
      TotalTax: 43.75,
    })
    expect(globalTaxDetail({ rateId: 'r20', percent: 20, taxAmount: 60, netTaxable: 300 })).toEqual(
      {
        TotalTax: 60,
        TaxLine: [
          {
            Amount: 60,
            DetailType: 'TaxLineDetail',
            TaxLineDetail: {
              TaxRateRef: { value: 'r20' },
              PercentBased: true,
              TaxPercent: 20,
              NetAmountTaxable: 300,
            },
          },
        ],
      }
    )
  })
})
