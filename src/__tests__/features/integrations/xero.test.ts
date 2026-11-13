import { describe, expect, it } from 'vitest'
import type {
  AccountingCustomer,
  AccountingInvoice,
} from '@/features/integrations/Lib/accounting-sync'
import {
  type InvoiceOptions,
  buildContact,
  buildInvoice,
  buildPayment,
  defaultDueDate,
  distribute,
  invoiceUrl,
  methodAccountKey,
  modifiedSinceHeader,
  parseXeroDate,
  referenceFor,
  sameName,
} from '@/integrations/xero/mapping'
import { pickTaxedRate, pickZeroRate, salesRates } from '@/integrations/xero/tax'

/**
 * What a Torqvoice invoice looks like when it reaches Xero. Field names and
 * codes are Xero's own (Accounting API v2, read from its OpenAPI spec and
 * docs on 9 Nov 2026), so a wrong one here is a refused invoice there.
 */

const customer: AccountingCustomer = {
  id: 'cus1',
  name: 'Anna Berg',
  email: 'anna@example.com',
  phone: '0412 345 678',
  address: '1 High Street\nSydney NSW 2000',
  company: null,
  taxId: null,
  taxExempt: false,
  customerNumber: 'C-0042',
}

const invoice: AccountingInvoice = {
  id: 'svc1',
  vehicleId: 'veh1',
  title: 'Brake service',
  invoiceNumber: 'INV-1001',
  status: 'completed',
  issuedAt: new Date('2026-11-04T01:00:00Z'),
  invoiceDate: new Date('2026-11-04T01:00:00Z'),
  serviceDate: new Date('2026-11-03T01:00:00Z'),
  dueDate: new Date('2026-11-18T01:00:00Z'),
  mileage: 84200,
  notes: 'Rear pads at 3 mm, replace next visit.',
  subtotal: 330,
  taxableSubtotal: null,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  taxRate: 10,
  taxAmount: 33,
  taxInclusive: false,
  totalAmount: 363,
  manuallyPaid: false,
  customer,
  vehicle: { year: 2018, make: 'Toyota', model: 'Corolla', licensePlate: 'ABC123' },
  lines: [
    {
      kind: 'labor',
      description: 'Brake service',
      partNumber: null,
      quantity: 2,
      unitPrice: 100,
      total: 200,
      taxable: true,
    },
    {
      kind: 'part',
      description: 'Brake pads',
      partNumber: 'BP-100',
      quantity: 1,
      unitPrice: 100,
      total: 100,
      taxable: true,
    },
    {
      kind: 'labor',
      description: 'Shop supplies',
      partNumber: null,
      quantity: 1,
      unitPrice: 30,
      total: 30,
      taxable: true,
      shopFee: true,
    },
  ],
  payments: [],
}

const options: InvoiceOptions = {
  contactId: 'contact-1',
  status: 'AUTHORISED',
  invoiceNumber: 'INV-1001',
  reference: 'ABC123 Toyota Corolla',
  dueDate: '2026-11-18',
  brandingThemeId: null,
  currency: null,
  timezone: 'Australia/Sydney',
  url: 'https://shop.example.com/vehicles/veh1/service/svc1',
  includeVehicle: true,
  includeNotes: true,
  notesAbove: false,
  includePartNumbers: true,
  distanceUnit: 'km',
  accounts: { labor: '210', parts: '200', shopFee: '220', fallback: '200' },
  items: { labor: null, parts: null },
  partItemCodes: new Set(),
  itemAccounts: new Map(),
  registeredForTax: true,
  taxType: 'OUTPUT',
  zeroTaxType: 'EXEMPTOUTPUT',
  billedTax: true,
  taxExempt: false,
  tracking: [],
  sentToContact: true,
}

type Line = Record<string, unknown>
const linesOf = (body: Record<string, unknown>) => body.LineItems as Line[]
const priced = (body: Record<string, unknown>) => linesOf(body).filter((l) => 'UnitAmount' in l)

const AU_RATES = [
  {
    Name: 'GST on Income',
    TaxType: 'OUTPUT',
    EffectiveRate: 10,
    Status: 'ACTIVE',
    CanApplyToRevenue: true,
  },
  {
    Name: 'GST Free Income',
    TaxType: 'EXEMPTOUTPUT',
    EffectiveRate: 0,
    Status: 'ACTIVE',
    CanApplyToRevenue: true,
  },
  {
    Name: 'BAS Excluded',
    TaxType: 'BASEXCLUDED',
    EffectiveRate: 0,
    Status: 'ACTIVE',
    CanApplyToRevenue: true,
  },
  {
    Name: 'GST on Expenses',
    TaxType: 'INPUT',
    EffectiveRate: 10,
    Status: 'ACTIVE',
    CanApplyToRevenue: false,
  },
]
const NZ_RATES = [
  {
    Name: '15% GST on Income',
    TaxType: 'OUTPUT2',
    EffectiveRate: '15.0000',
    Status: 'ACTIVE',
    CanApplyToRevenue: true,
  },
  {
    Name: 'Zero Rated',
    TaxType: 'ZERORATED',
    EffectiveRate: 0,
    Status: 'ACTIVE',
    CanApplyToRevenue: true,
  },
  { Name: 'No GST', TaxType: 'NONE', EffectiveRate: 0, Status: 'ACTIVE', CanApplyToRevenue: true },
]

describe('tax rates', () => {
  it('books Australian GST under GST on Income and tax-free lines under GST Free Income', () => {
    const rates = salesRates(AU_RATES)
    expect(pickTaxedRate(rates, 10, null).entry?.taxType).toBe('OUTPUT')
    expect(pickZeroRate(rates, null)?.taxType).toBe('EXEMPTOUTPUT')
    // A purchase rate is never offered for a sale.
    expect(rates.map((r) => r.taxType)).not.toContain('INPUT')
  })

  it('books New Zealand GST under OUTPUT2 and tax-free lines as Zero Rated', () => {
    const rates = salesRates(NZ_RATES)
    expect(pickTaxedRate(rates, 15, null)).toMatchObject({
      entry: { taxType: 'OUTPUT2' },
      matched: true,
    })
    expect(pickZeroRate(rates, null)?.taxType).toBe('ZERORATED')
  })

  it('uses a chosen rate whatever its percentage, and says when it does not match', () => {
    const rates = salesRates(AU_RATES)
    expect(pickTaxedRate(rates, 15, 'OUTPUT')).toMatchObject({
      entry: { taxType: 'OUTPUT' },
      matched: false,
    })
    expect(pickTaxedRate(rates, 15, null)).toEqual({ entry: null, matched: false })
  })
})

describe('buildInvoice', () => {
  it('sends an approved sales invoice with every line booked where the workshop chose', () => {
    const body = buildInvoice(invoice, options)
    expect(body).toMatchObject({
      Type: 'ACCREC',
      Contact: { ContactID: 'contact-1' },
      Date: '2026-11-04',
      DueDate: '2026-11-18',
      InvoiceNumber: 'INV-1001',
      Reference: 'ABC123 Toyota Corolla',
      LineAmountTypes: 'Exclusive',
      Status: 'AUTHORISED',
      SentToContact: true,
      Url: 'https://shop.example.com/vehicles/veh1/service/svc1',
    })
    // Only the contact's id: anything more would overwrite the contact in Xero.
    expect(Object.keys(body.Contact as object)).toEqual(['ContactID'])
    expect(linesOf(body)[0]).toEqual({
      Description: 'Vehicle: 2018 Toyota Corolla, ABC123, 84,200 km',
    })
    expect(priced(body)).toEqual([
      {
        Description: 'Brake service',
        Quantity: 2,
        UnitAmount: 100,
        AccountCode: '210',
        TaxType: 'OUTPUT',
        TaxAmount: 20,
      },
      {
        Description: 'BP-100 Brake pads',
        Quantity: 1,
        UnitAmount: 100,
        AccountCode: '200',
        TaxType: 'OUTPUT',
        TaxAmount: 10,
      },
      {
        Description: 'Shop supplies',
        Quantity: 1,
        UnitAmount: 30,
        AccountCode: '220',
        TaxType: 'OUTPUT',
        TaxAmount: 3,
      },
    ])
    expect(linesOf(body).at(-1)).toEqual({ Description: 'Rear pads at 3 mm, replace next visit.' })
  })

  it('spreads a fixed discount over the lines so Xero taxes what is left, to the cent', () => {
    const discounted = {
      ...invoice,
      discountType: 'fixed',
      discountValue: 33,
      discountAmount: 33,
      taxAmount: 29.7,
      totalAmount: 326.7,
    }
    const lines = priced(buildInvoice(discounted, options))
    expect(lines.map((l) => l.DiscountAmount)).toEqual([20, 10, 3])
    expect(lines.reduce((sum, l) => sum + (l.TaxAmount as number), 0)).toBeCloseTo(29.7, 10)
  })

  it('splits the billed tax in whole cents that add up to the invoice tax', () => {
    const odd = { ...invoice, taxAmount: 33.01 }
    const taxes = priced(buildInvoice(odd, options)).map((l) => l.TaxAmount as number)
    expect(taxes.every((t) => Math.abs(Math.round(t * 100) - t * 100) < 1e-6)).toBe(true)
    expect(taxes.reduce((a, b) => a + b, 0)).toBeCloseTo(33.01, 10)
  })

  it('lets Xero work the tax out when the workshop asks it to', () => {
    const lines = priced(buildInvoice(invoice, { ...options, billedTax: false }))
    expect(lines.every((l) => !('TaxAmount' in l) && l.TaxType === 'OUTPUT')).toBe(true)
  })

  it('books an untaxed line, and every line of a tax-exempt customer, at the zero rate', () => {
    const partsOnly = {
      ...invoice,
      lines: invoice.lines.map((l) => (l.kind === 'labor' ? { ...l, taxable: false } : l)),
      taxAmount: 10,
    }
    expect(priced(buildInvoice(partsOnly, options)).map((l) => [l.TaxType, l.TaxAmount])).toEqual([
      ['EXEMPTOUTPUT', 0],
      ['OUTPUT', 10],
      ['EXEMPTOUTPUT', 0],
    ])
    const exempt = priced(buildInvoice(invoice, { ...options, taxExempt: true }))
    expect(exempt.every((l) => l.TaxType === 'EXEMPTOUTPUT' && !('TaxAmount' in l))).toBe(true)
  })

  it('sends tax-inclusive prices as they were billed', () => {
    const body = buildInvoice(
      { ...invoice, taxInclusive: true, totalAmount: 330, taxAmount: 30 },
      options
    )
    expect(body.LineAmountTypes).toBe('Inclusive')
    expect(priced(body)[0]).toMatchObject({ UnitAmount: 100, TaxAmount: 18.18 })
  })

  it('leaves tax off entirely for an organisation that is not registered for it', () => {
    const body = buildInvoice(invoice, { ...options, registeredForTax: false })
    expect(body.LineAmountTypes).toBe('NoTax')
    expect(priced(body).every((l) => !('TaxType' in l) && !('TaxAmount' in l))).toBe(true)
  })

  it('sends a line whose total was edited by hand as one unit at that total', () => {
    const edited = {
      ...invoice,
      subtotal: 250,
      taxAmount: 25,
      totalAmount: 275,
      lines: [{ ...invoice.lines[0], quantity: 3, unitPrice: 100, total: 250 }],
    }
    expect(priced(buildInvoice(edited, options))[0]).toMatchObject({
      Description: 'Brake service (3 × 100)',
      Quantity: 1,
      UnitAmount: 250,
    })
  })

  it('adds up to the printed subtotal, tax and total when lines carry fractions of a cent', () => {
    // 1.5 h and 0.5 h at 33.33: 49.995 + 16.665 = 66.66 exactly, but each
    // line on its own prints as 50.00 and 16.67, which Xero would add to 66.67.
    const fractional: AccountingInvoice = {
      ...invoice,
      subtotal: 66.66,
      taxAmount: 6.67,
      totalAmount: 73.33,
      lines: [
        {
          kind: 'labor',
          description: 'Diagnosis',
          partNumber: null,
          quantity: 1.5,
          unitPrice: 33.33,
          total: 49.995,
          taxable: true,
        },
        {
          kind: 'labor',
          description: 'Road test',
          partNumber: null,
          quantity: 0.5,
          unitPrice: 33.33,
          total: 16.665,
          taxable: true,
        },
      ],
    }
    const lines = priced(buildInvoice(fractional, options))
    const amounts = lines.map((l) => (l.Quantity as number) * (l.UnitAmount as number))
    // Every line is a whole number of cents, so Xero has nothing to round.
    expect(amounts.every((a) => Math.abs(Math.round(a * 100) - a * 100) < 1e-6)).toBe(true)
    expect(amounts.reduce((a, b) => a + b, 0)).toBeCloseTo(66.66, 10)
    expect(lines.reduce((a, l) => a + (l.TaxAmount as number), 0)).toBeCloseTo(6.67, 10)
    // The quantity and price stay readable where the line had to go as one unit.
    expect(lines[0].Description).toBe('Diagnosis (1.5 × 33.33)')
  })

  it('keeps quantity and price when they make the line exactly', () => {
    const hourly = {
      ...invoice,
      subtotal: 1425,
      taxAmount: 142.5,
      totalAmount: 1567.5,
      lines: [{ ...invoice.lines[0], quantity: 1.5, unitPrice: 950, total: 1425 }],
    }
    expect(priced(buildInvoice(hourly, options))[0]).toMatchObject({
      Quantity: 1.5,
      UnitAmount: 950,
    })
  })

  it('rounds the discount and tax the way the printed invoice does', () => {
    // A 10% discount on 333.33 is 33.333; the sheet prints 33.33 and taxes 300.00.
    const discounted: AccountingInvoice = {
      ...invoice,
      subtotal: 333.33,
      discountType: 'percentage',
      discountValue: 10,
      discountAmount: 33.333,
      taxAmount: 30,
      totalAmount: 330,
      lines: [{ ...invoice.lines[0], quantity: 1, unitPrice: 333.33, total: 333.33 }],
    }
    const [line] = priced(buildInvoice(discounted, options))
    expect(line).toMatchObject({ UnitAmount: 333.33, DiscountAmount: 33.33, TaxAmount: 30 })
  })

  it('lets Xero number the invoice, and only marks approved invoices as sent', () => {
    const body = buildInvoice(invoice, { ...options, invoiceNumber: null, status: 'DRAFT' })
    expect(body).not.toHaveProperty('InvoiceNumber')
    expect(body).not.toHaveProperty('SentToContact')
    expect(body.Status).toBe('DRAFT')
  })

  it('sells a part as the Xero item with its part number, and tags lines with tracking', () => {
    const lines = priced(
      buildInvoice(invoice, {
        ...options,
        accounts: { labor: null, parts: null, shopFee: null, fallback: '200' },
        items: { labor: 'LAB', parts: null },
        partItemCodes: new Set(['BP-100']),
        itemAccounts: new Map([['LAB', '210']]),
        tracking: [{ Name: 'Branch', Option: 'Parramatta' }],
      })
    )
    // Every line names an account: the item's own, else the default sales
    // account, since Xero refuses a line without one (seen live, 9 Nov 2026).
    expect(lines[0]).toMatchObject({
      ItemCode: 'LAB',
      AccountCode: '210',
      Tracking: [{ Name: 'Branch', Option: 'Parramatta' }],
    })
    expect(lines[1]).toMatchObject({ ItemCode: 'BP-100', AccountCode: '200' })
    expect(lines[2]).toMatchObject({ ItemCode: 'LAB', AccountCode: '210' })
  })

  it('puts the customer notes right after the vehicle line when they go above the charges', () => {
    const notes = { Description: 'Rear pads at 3 mm, replace next visit.' }
    const below = linesOf(buildInvoice(invoice, options))
    expect(below[0].Description).toMatch(/^Vehicle: /)
    expect(below.at(-1)).toEqual(notes)
    expect(below.filter((l) => l.Description === notes.Description)).toHaveLength(1)

    const above = linesOf(buildInvoice(invoice, { ...options, notesAbove: true }))
    expect(above[0].Description).toMatch(/^Vehicle: /)
    expect(above[1]).toEqual(notes)
    expect(above.filter((l) => l.Description === notes.Description)).toHaveLength(1)
    // The charges follow, in the same order and to the same amounts.
    expect(above.slice(2)).toEqual(below.slice(1, -1))

    // Without a vehicle line the notes lead.
    const alone = linesOf(
      buildInvoice(invoice, { ...options, notesAbove: true, includeVehicle: false })
    )
    expect(alone[0]).toEqual(notes)
  })

  it('leaves out the vehicle, notes and part numbers when switched off', () => {
    const body = buildInvoice(invoice, {
      ...options,
      includeVehicle: false,
      includeNotes: false,
      includePartNumbers: false,
    })
    expect(linesOf(body)).toHaveLength(3)
    expect(priced(body)[1].Description).toBe('Brake pads')
  })
})

describe('contacts, payments and references', () => {
  it('bills a business customer in the company name, with the person beside it', () => {
    const body = buildContact(
      { ...customer, company: 'Berg Transport Pty Ltd', taxId: '51 824 753 556' },
      'Berg Transport Pty Ltd'
    )
    expect(body).toEqual({
      Name: 'Berg Transport Pty Ltd',
      ContactNumber: 'TV-C-0042',
      EmailAddress: 'anna@example.com',
      FirstName: 'Anna',
      LastName: 'Berg',
      Phones: [{ PhoneType: 'DEFAULT', PhoneNumber: '0412 345 678' }],
      Addresses: [
        { AddressType: 'POBOX', AddressLine1: '1 High Street', AddressLine2: 'Sydney NSW 2000' },
      ],
      TaxNumber: '51 824 753 556',
    })
  })

  it('records a payment against the invoice into the account for its method', () => {
    const p = {
      id: 'pay1',
      serviceRecordId: 'svc1',
      amount: 363,
      date: new Date('2026-11-05T01:00:00Z'),
      method: 'card',
      note: null,
      provider: 'stripe',
      externalId: 'pi_123',
    }
    expect(
      buildPayment(p, { invoiceId: 'inv-1', accountId: 'acc-1', timezone: 'Australia/Sydney' })
    ).toEqual({
      Invoice: { InvoiceID: 'inv-1' },
      Account: { AccountID: 'acc-1' },
      Date: '2026-11-05',
      Amount: 363,
      Reference: 'Torqvoice card, via stripe, pi_123',
    })
    expect(methodAccountKey(p)).toBe('onlineAccount')
    expect(methodAccountKey({ method: 'cash', provider: null })).toBe('cashAccount')
    expect(methodAccountKey({ method: 'other', provider: null })).toBeNull()
  })

  it('fills the reference from the workshop’s choice', () => {
    expect(referenceFor(invoice, 'vehicle')).toBe('ABC123 Toyota Corolla')
    expect(referenceFor(invoice, 'title')).toBe('Brake service')
    expect(referenceFor(invoice, 'invoiceNumber')).toBe('INV-1001')
    expect(referenceFor(invoice, 'none')).toBeNull()
  })
})

describe('dates, money and links', () => {
  it('works out a due date from the organisation’s sales terms', () => {
    expect(defaultDueDate('2026-11-04', { Sales: { Day: 14, Type: 'DAYSAFTERBILLDATE' } })).toBe(
      '2026-11-18'
    )
    expect(defaultDueDate('2026-11-04', { Sales: { Day: 20, Type: 'OFFOLLOWINGMONTH' } })).toBe(
      '2026-12-20'
    )
    expect(defaultDueDate('2026-11-04', { Sales: { Day: 31, Type: 'OFCURRENTMONTH' } })).toBe(
      '2026-11-30'
    )
    expect(defaultDueDate('2026-11-04', { Sales: { Day: 7, Type: 'DAYSAFTERBILLMONTH' } })).toBe(
      '2026-12-07'
    )
    expect(defaultDueDate('2026-11-04', undefined)).toBe('2026-11-04')
  })

  it('splits an amount into cents that add up exactly', () => {
    expect(distribute(10, [1, 1, 1])).toEqual([3.34, 3.33, 3.33])
    expect(distribute(0, [1, 2])).toEqual([0, 0])
  })

  it('reads Xero’s dates and writes its If-Modified-Since', () => {
    expect(parseXeroDate('/Date(1762300800000+0000)/')?.toISOString()).toBe(
      '2025-11-05T00:00:00.000Z'
    )
    expect(modifiedSinceHeader(new Date('2026-11-09T12:34:56.789Z'))).toBe('2026-11-09T12:34:56')
  })

  it('links to the invoice in Xero the way Xero documents', () => {
    expect(invoiceUrl('!NLglS', 'abc')).toBe(
      'https://go.xero.com/organisationlogin/default.aspx?shortcode=!NLglS&redirecturl=/AccountsReceivable/View.aspx?InvoiceID=abc'
    )
  })
})

describe('rounding against the printed invoice', () => {
  /** A small seeded generator, so a failure names a case that can be run again. */
  function rng(seed: number) {
    let s = seed >>> 0
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 2 ** 32
    }
  }

  /** What Xero makes of the body: each line's amount less its discount, then the tax. */
  function xeroTotals(body: Record<string, unknown>) {
    const lines = priced(body)
    let lineCents = 0
    let taxCents = 0
    for (const l of lines) {
      const exact = Math.round((l.Quantity as number) * (l.UnitAmount as number) * 100)
      // Xero would round this itself; the mapping must never leave it anything to round.
      expect(
        Math.abs(exact - (l.Quantity as number) * (l.UnitAmount as number) * 100)
      ).toBeLessThan(1e-6)
      lineCents += exact - Math.round(((l.DiscountAmount as number | undefined) ?? 0) * 100)
      taxCents += Math.round(((l.TaxAmount as number | undefined) ?? 0) * 100)
    }
    const inclusive = body.LineAmountTypes === 'Inclusive'
    return { totalCents: inclusive ? lineCents : lineCents + taxCents, taxCents }
  }

  it('lands on the printed total and tax for thousands of invoices', async () => {
    const { calculateTotals, discountAmountFor, storedTaxableSubtotal } = await import('@/lib/tax')
    const next = rng(20261109)
    const pick = <T>(xs: T[]) => xs[Math.floor(next() * xs.length)]
    for (let n = 0; n < 3000; n++) {
      const lines = Array.from({ length: 1 + Math.floor(next() * 6) }, (_, i) => {
        const quantity = pick([0.25, 0.3, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.3, 7])
        const unitPrice = Math.round(next() * 50_000) / 100
        return {
          kind: (i % 2 ? 'part' : 'labor') as 'part' | 'labor',
          description: `Line ${i}`,
          partNumber: null,
          quantity,
          unitPrice,
          // Stored as the form computes it: not rounded.
          total: quantity * unitPrice,
          taxable: next() > 0.2,
        }
      })
      const subtotal = lines.reduce((a, l) => a + l.total, 0)
      const taxableRaw = lines.filter((l) => l.taxable).reduce((a, l) => a + l.total, 0)
      const discountType = pick([null, 'percentage', 'fixed'])
      const discountValue =
        discountType === 'percentage' ? pick([5, 7.5, 10, 12.5]) : Math.round(next() * 5000) / 100
      const discountAmount = discountAmountFor(subtotal, discountType, discountValue)
      const taxRate = pick([10, 15])
      const taxInclusive = next() > 0.5
      const taxableSubtotal = storedTaxableSubtotal(subtotal, taxableRaw)
      const totals = calculateTotals({
        subtotal,
        discountAmount,
        taxRate,
        taxInclusive,
        taxableSubtotal,
      })
      const inv: AccountingInvoice = {
        ...invoice,
        subtotal,
        taxableSubtotal,
        discountType,
        discountValue,
        discountAmount,
        taxRate,
        taxInclusive,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        lines,
      }
      const seen = xeroTotals(buildInvoice(inv, options))
      const label = `case ${n}: ${JSON.stringify({ lines: lines.map((l) => [l.quantity, l.unitPrice, l.taxable]), discountType, discountValue, taxRate, taxInclusive })}`
      expect(seen.totalCents, label).toBe(Math.round(totals.totalAmount * 100))
      expect(seen.taxCents, label).toBe(Math.round(totals.taxAmount * 100))
    }
  })
})

describe('review fixes', () => {
  it('leaves purchase rates out of the sales lists, as a global organisation reports them', () => {
    // A Norwegian organisation on Xero's global edition, as read on 9 Nov 2026.
    const rates = salesRates([
      {
        Name: 'Tax Exempt',
        TaxType: 'NONE',
        EffectiveRate: 0,
        Status: 'ACTIVE',
        ReportTaxType: 'NONE',
        CanApplyToRevenue: true,
      },
      {
        Name: 'Tax on Purchases',
        TaxType: 'INPUT',
        EffectiveRate: 0,
        Status: 'ACTIVE',
        ReportTaxType: 'INPUT',
        CanApplyToRevenue: true,
      },
      {
        Name: 'Tax on Sales',
        TaxType: 'OUTPUT',
        EffectiveRate: 0,
        Status: 'ACTIVE',
        ReportTaxType: 'OUTPUT',
        CanApplyToRevenue: true,
      },
      {
        Name: 'MVA 25%',
        TaxType: 'TAX001',
        EffectiveRate: 25,
        Status: 'ACTIVE',
        ReportTaxType: 'OUTPUT',
        CanApplyToRevenue: true,
      },
    ])
    expect(rates.map((r) => r.taxType)).toEqual(['NONE', 'OUTPUT', 'TAX001'])
    expect(pickTaxedRate(rates, 25, null).entry?.taxType).toBe('TAX001')
  })

  it('never books an untaxed line under a rate with a percentage, even when one was chosen', () => {
    const rates = salesRates(AU_RATES)
    expect(pickZeroRate(rates, 'OUTPUT')?.taxType).toBe('EXEMPTOUTPUT')
    expect(pickZeroRate(rates, 'BASEXCLUDED')?.taxType).toBe('BASEXCLUDED')
  })

  it('keeps a payment on its day in New Zealand, where noon UTC is already tomorrow', async () => {
    const { paymentDay } = await import('@/integrations/xero/mapping')
    const { zonedDayKey } = await import('@/lib/timezone')
    // Xero's 9 Nov 2026, midnight UTC.
    const day = paymentDay('/Date(1762646400000+0000)/', 'Pacific/Auckland')
    expect(zonedDayKey(day, 'Pacific/Auckland')).toBe('2025-11-09')
  })

  it('sends an old invoice that carries only its total as one line for that total', () => {
    const costOnly: AccountingInvoice = {
      ...invoice,
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 450,
      taxRate: 0,
      lines: [],
    }
    const body = buildInvoice(costOnly, options)
    expect(priced(body)).toEqual([
      expect.objectContaining({ Description: 'Brake service', Quantity: 1, UnitAmount: 450 }),
    ])
  })

  it('carries the printed figures of an amount stored a hair off half a cent', () => {
    // 0.18 plus 25%, stored before totals were held to the cent: it prints as 0.22.
    const legacy: AccountingInvoice = {
      ...invoice,
      subtotal: 0.18,
      taxRate: 25,
      taxAmount: 0.04499999999999999,
      totalAmount: 0.22499999999999998,
      lines: [{ ...invoice.lines[0], quantity: 1, unitPrice: 0.18, total: 0.18 }],
    }
    const lines = priced(buildInvoice(legacy, options))
    const sum = lines.reduce((a, l) => a + (l.UnitAmount as number) + (l.TaxAmount as number), 0)
    expect(Number(sum.toFixed(2))).toBe(0.22)
  })

  it('keeps the quantity of a stock item, so Xero takes the right count off the shelf', () => {
    const stock: AccountingInvoice = {
      ...invoice,
      subtotal: 49.975,
      taxAmount: 5,
      totalAmount: 54.98,
      lines: [{ ...invoice.lines[1], quantity: 2.5, unitPrice: 19.99, total: 49.975 }],
    }
    const [line] = priced(buildInvoice(stock, { ...options, partItemCodes: new Set(['BP-100']) }))
    expect(line).toMatchObject({ ItemCode: 'BP-100', Quantity: 2.5, UnitAmount: 19.992 })
    // 2.5 x 19.992 is exactly the 49.98 the invoice printed.
    expect((line.Quantity as number) * (line.UnitAmount as number)).toBeCloseTo(49.98, 10)
  })
})

describe('telling customers apart by name', () => {
  const anna = { name: 'Anna Berg', company: null }
  it('matches the same name written another way', () => {
    expect(sameName(anna, { Name: 'anna  berg' })).toBe(true)
    expect(sameName(anna, { Name: 'Berg family', FirstName: 'Anna', LastName: 'Berg' })).toBe(true)
    expect(
      sameName(
        { name: 'Bob', company: 'Campbell Transport' },
        { Name: 'Campbell Transport Services Pty Ltd' }
      )
    ).toBe(true)
    expect(
      sameName({ name: 'Bob', company: 'Smith & Sons Ltd.' }, { Name: 'SMITH AND SONS' })
    ).toBe(true)
    expect(sameName({ name: 'Zoë Ødegård', company: null }, { Name: 'Zoe Odegard' })).toBe(true)
  })
  it('does not take another person who shares the address for the customer', () => {
    expect(sameName(anna, { Name: 'Dummy Customer' })).toBe(false)
    expect(sameName(anna, { Name: 'Lars Berg', FirstName: 'Lars', LastName: 'Berg' })).toBe(false)
    expect(sameName({ name: 'Berg', company: null }, { Name: 'Lars Berg' })).toBe(false)
  })
})
