/**
 * What a document with untaxed lines looks like once it leaves the editor:
 * on the printed invoice and quote, in QuickBooks, and in Fiken.
 *
 * And the two small pieces the save paths stand on: reading only what an
 * update was sent, and the server's word on a saved document's tax.
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { AccountingInvoice } from '@/features/integrations/Lib/accounting-sync'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { buildQuotePrintSpec } from '@/features/invoice-designer/Pdf/buildQuotePrint'
import { lineGroupsFor } from '@/features/invoice-designer/Pdf/lineGroups'
import { printFigures } from '@/features/invoice-designer/Pdf/printFigures'
import { taxLines } from '@/features/invoice-designer/Pdf/taxLines'
import type { DocumentSpec } from '@/features/invoice-designer/Spec/documentSpec'
import { updateQuoteSchema } from '@/features/quotes/Schema/quoteSchema'
import {
  readLineTaxSettings,
  readTaxApplies,
  readWorkshopTax,
  savedDocumentTax,
} from '@/features/settings/Lib/workshopTax'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'
import { updateServiceSchema } from '@/features/vehicles/Schema/serviceSchema'
import { buildSale, type SaleOptions } from '@/integrations/fiken/mapping'
import { buildInvoice } from '@/integrations/quickbooks/mapping'
import { parseSentFields } from '@/lib/parse-sent-fields'

/* -------------------------------------------------------------------------- */

describe('reading only what an update was sent', () => {
  it('shows what the defaults did: a bare parse invents every field', () => {
    // The reason parseSentFields exists. If this ever stops being true the
    // helper is harmless, but the comment on it is out of date.
    const bare = updateServiceSchema.parse({ id: 'sr-1' }) as Record<string, unknown>
    expect(bare.status).toBe('pending')
    expect(bare.subtotal).toBe(0)
  })

  it('returns the id and nothing else when nothing else was sent', () => {
    expect(parseSentFields(updateServiceSchema, { id: 'sr-1' })).toEqual({ id: 'sr-1' })
    expect(parseSentFields(updateQuoteSchema, { id: 'q-1' })).toEqual({ id: 'q-1' })
  })

  it('keeps what was sent, parsed and coerced as the schema says', () => {
    const parsed = parseSentFields(updateServiceSchema, {
      id: 'sr-1',
      subtotal: '500',
      taxRate: 8,
      laborItems: [{ description: 'Fit', hours: '2', rate: 100, total: 200 }],
    })
    expect(parsed).toEqual({
      id: 'sr-1',
      subtotal: 500,
      taxRate: 8,
      // Inside a line that was sent the defaults still apply: it is a whole line.
      laborItems: [{ description: 'Fit', hours: 2, rate: 100, total: 200, pricingType: 'hourly' }],
    })
  })

  it('treats a field sent as undefined as not sent', () => {
    expect(parseSentFields(updateServiceSchema, { id: 'sr-1', status: undefined })).toEqual({
      id: 'sr-1',
    })
  })

  it('keeps a value that was sent even when it equals the default', () => {
    expect(
      parseSentFields(updateServiceSchema, { id: 'sr-1', subtotal: 0, status: 'pending' })
    ).toEqual({ id: 'sr-1', subtotal: 0, status: 'pending' })
  })

  it('still refuses what the schema refuses', () => {
    expect(() => parseSentFields(updateServiceSchema, { id: 'sr-1', subtotal: -1 })).toThrow()
    expect(() => parseSentFields(updateServiceSchema, {})).toThrow()
  })

  it('leaves a schema without defaults as it parses', () => {
    const schema = z.object({ a: z.string(), b: z.number().optional() })
    expect(parseSentFields(schema, { a: 'x' })).toEqual({ a: 'x' })
  })
})

/* -------------------------------------------------------------------------- */

describe('the workshop rule in settings', () => {
  it('taxes everything unless the workshop taxes only some charges', () => {
    expect(readTaxApplies({})).toEqual({ parts: true, labor: true, shopFee: true })
    expect(readTaxApplies({ 'workshop.taxAppliesToLabor': 'false' })).toEqual({
      parts: true,
      labor: true,
      shopFee: true,
    })
    expect(
      readTaxApplies({ 'workshop.taxSelective': 'true', 'workshop.taxAppliesToLabor': 'false' })
    ).toEqual({ parts: true, labor: false, shopFee: true })
  })

  it('tells the editors whether to offer the choice on each line', () => {
    expect(readLineTaxSettings({}).selective).toBe(false)
    expect(readLineTaxSettings({ 'workshop.taxSelective': 'true' })).toEqual({
      selective: true,
      applies: { parts: true, labor: true, shopFee: true },
    })
  })

  it('carries the rule with the rest of the workshop tax', () => {
    const tax = readWorkshopTax({
      'workshop.defaultTaxRate': '8',
      'workshop.taxSelective': 'true',
      'workshop.taxAppliesToShopFee': 'false',
    })
    expect(tax.rate).toBe(8)
    expect(tax.applies).toEqual({ parts: true, labor: true, shopFee: false })
  })
})

describe("the server's word on a saved document's tax", () => {
  const base = {
    subtotal: 500,
    discountAmount: 0,
    taxRate: 8,
    taxInclusive: false,
    taxComponents: null,
  }

  it('lets the caller figures stand while every line is taxed and the tax is one rate', () => {
    expect(
      savedDocumentTax({
        ...base,
        parts: [{ total: 200, taxable: true }],
        labor: [{ total: 300, taxable: true }],
      })
    ).toEqual({ taxableSubtotal: null, totals: null })
  })

  it('states the totals itself once a line is left out', () => {
    expect(
      savedDocumentTax({
        ...base,
        parts: [{ total: 200, taxable: true }],
        labor: [{ total: 300, taxable: false }],
      })
    ).toEqual({
      taxableSubtotal: 200,
      totals: { taxAmount: 16, totalAmount: 516, taxComponents: undefined },
    })
  })

  it('does not count an untaxed line of nothing as a reason to restate', () => {
    expect(
      savedDocumentTax({
        ...base,
        parts: [{ total: 500, taxable: true }],
        labor: [{ total: 0, taxable: false }],
      }).totals
    ).toBeNull()
  })

  it('skips the lines a customer declined', () => {
    expect(
      savedDocumentTax({
        ...base,
        parts: [
          { total: 200, taxable: true },
          { total: 400, taxable: true, excluded: true },
        ],
        labor: [{ total: 300, taxable: false }],
      }).taxableSubtotal
    ).toBe(200)
  })

  it('splits the tax on the taxable part when the document has components', () => {
    const result = savedDocumentTax({
      ...base,
      taxRate: 14.975,
      taxComponents: [
        { name: 'GST', rate: 5, amount: 0 },
        { name: 'QST', rate: 9.975, amount: 0 },
      ],
      parts: [{ total: 200, taxable: true }],
      labor: [{ total: 300, taxable: false }],
    })
    expect(result.taxableSubtotal).toBe(200)
    expect(result.totals).toEqual({
      taxAmount: 29.95,
      totalAmount: 529.95,
      taxComponents: [
        { name: 'GST', rate: 5, amount: 10 },
        { name: 'QST', rate: 9.975, amount: 19.95 },
      ],
    })
  })
})

/* -------------------------------------------------------------------------- */

const invoice = {
  id: 'svc_1',
  title: 'Brakes',
  description: null,
  type: 'repair',
  serviceDate: new Date('2026-09-10'),
  invoiceDate: new Date('2026-09-10'),
  invoiceDueDate: null,
  shopName: 'Main Street Auto',
  techName: null,
  mileage: null,
  diagnosticNotes: null,
  invoiceNotes: null,
  subtotal: 500,
  taxRate: 8,
  taxAmount: 16,
  taxInclusive: false,
  taxComponents: null,
  taxableSubtotal: 200,
  totalAmount: 516,
  cost: 516,
  invoiceNumber: 'INV-1',
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  partItems: [
    { partNumber: 'P1', name: 'Pads', quantity: 1, unitPrice: 200, total: 200, taxable: true },
  ],
  laborItems: [{ description: 'Fit', hours: 3, rate: 100, total: 300, taxable: false }],
  customFields: [],
  findings: [],
  customer: null,
  vehicle: null,
} as unknown as InvoiceData

const labels = {
  subtotal: 'Subtotal',
  subtotalInclTax: 'Subtotal (incl. tax)',
  tax: 'Tax ({rate}%)',
  taxIncluded: 'Includes tax ({rate}%)',
  taxableAmount: 'Taxable amount',
  total: 'Total',
  parts: 'Parts',
  labor: 'Labor',
}

function textOf(spec: DocumentSpec): string[] {
  const seen: string[] = []
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (key === 'text' && typeof value === 'string') seen.push(value)
        else walk(value)
      }
    }
  }
  walk(spec)
  return seen
}

/** The amount printed on the row after a label, as the totals box lays it out. */
function amountAfter(text: string[], label: string): string | undefined {
  const at = text.indexOf(label)
  return at === -1 ? undefined : text[at + 1]
}

const settings = { currencyCode: 'USD', currencyFormat: 'code' as const }

describe('a printed invoice with untaxed labor', () => {
  it('says what the tax was charged on, above the tax', () => {
    const text = textOf(buildInvoicePrintSpec({ data: invoice, labels, invoiceSettings: settings }))
    expect(text).toContain('Taxable amount')
    expect(amountAfter(text, 'Taxable amount')).toContain('200.00')
    expect(amountAfter(text, 'Tax (8%)')).toContain('16.00')
    expect(amountAfter(text, 'Subtotal')).toContain('500.00')
    expect(amountAfter(text, 'Total')).toContain('516.00')
    expect(text.indexOf('Taxable amount')).toBeLessThan(text.indexOf('Tax (8%)'))
  })

  it('does not print the row on an invoice whose every line is taxed', () => {
    const all = {
      ...invoice,
      taxableSubtotal: null,
      taxAmount: 40,
      totalAmount: 540,
      laborItems: [{ description: 'Fit', hours: 3, rate: 100, total: 300, taxable: true }],
    } as unknown as InvoiceData
    const text = textOf(buildInvoicePrintSpec({ data: all, labels, invoiceSettings: settings }))
    expect(text).not.toContain('Taxable amount')
    expect(amountAfter(text, 'Tax (8%)')).toContain('40.00')
  })

  it('does not print the row for lines that predate the flag', () => {
    // Stored before a line could be untaxed: no flag at all means taxed.
    const legacy = {
      ...invoice,
      taxableSubtotal: undefined,
      taxAmount: 40,
      totalAmount: 540,
      partItems: [{ partNumber: 'P1', name: 'Pads', quantity: 1, unitPrice: 200, total: 200 }],
      laborItems: [{ description: 'Fit', hours: 3, rate: 100, total: 300 }],
    } as unknown as InvoiceData
    const text = textOf(buildInvoicePrintSpec({ data: legacy, labels, invoiceSettings: settings }))
    expect(text).not.toContain('Taxable amount')
  })

  it('adds tax to the taxed line only when lines are printed with tax in them', () => {
    const text = textOf(
      buildInvoicePrintSpec({
        data: invoice,
        labels,
        invoiceSettings: { ...settings, lineItemsInclTax: true },
      })
    )
    // The pads at 200 read 216 with their tax; the labor stays 300.
    expect(text.some((s) => s.includes('216.00'))).toBe(true)
    expect(text.some((s) => s.includes('300.00'))).toBe(true)
    expect(text.some((s) => s.includes('324.00'))).toBe(false)
    // And the subtotal is their sum, which is the total the customer pays.
    expect(amountAfter(text, 'Subtotal (incl. tax)')).toContain('516.00')
    expect(amountAfter(text, 'Total')).toContain('516.00')
  })

  it('takes tax out of the taxed line only when prices were entered with it', () => {
    const inclusive = {
      ...invoice,
      subtotal: 516,
      taxableSubtotal: 216,
      taxInclusive: true,
      partItems: [
        { partNumber: 'P1', name: 'Pads', quantity: 1, unitPrice: 216, total: 216, taxable: true },
      ],
    } as unknown as InvoiceData
    const text = textOf(
      buildInvoicePrintSpec({ data: inclusive, labels, invoiceSettings: settings })
    )
    expect(amountAfter(text, 'Subtotal')).toContain('500.00')
    expect(amountAfter(text, 'Taxable amount')).toContain('200.00')
    expect(amountAfter(text, 'Tax (8%)')).toContain('16.00')
    expect(amountAfter(text, 'Total')).toContain('516.00')
    expect(text.some((s) => s.includes('277.78'))).toBe(false)
  })
})

describe('a printed quote with untaxed labor', () => {
  const quote = {
    id: 'q1',
    quoteNumber: 'QT-1',
    title: 'Brakes',
    description: null,
    status: 'draft',
    validUntil: null,
    createdAt: new Date('2026-09-10'),
    subtotal: 500,
    taxRate: 8,
    taxAmount: 16,
    taxInclusive: false,
    taxComponents: null,
    discountType: null,
    discountValue: 0,
    discountAmount: 0,
    totalAmount: 516,
    notes: null,
    partItems: [
      { partNumber: 'P1', name: 'Pads', quantity: 1, unitPrice: 200, total: 200, taxable: true },
      {
        partNumber: 'P2',
        name: 'Rotors',
        quantity: 1,
        unitPrice: 400,
        total: 400,
        taxable: true,
        excluded: true,
      },
    ],
    laborItems: [{ description: 'Fit', hours: 3, rate: 100, total: 300, taxable: false }],
    customer: null,
    vehicle: null,
  }

  it('works the tax out from the lines the customer kept, and only the taxed ones', () => {
    const text = textOf(
      buildQuotePrintSpec({
        data: quote as never,
        labels,
        currencyCode: 'USD',
        currencyFormat: 'code',
      })
    )
    expect(amountAfter(text, 'Subtotal')).toContain('500.00')
    expect(amountAfter(text, 'Taxable amount')).toContain('200.00')
    expect(amountAfter(text, 'Tax (8%)')).toContain('16.00')
    expect(amountAfter(text, 'Total')).toContain('516.00')
  })
})

describe('the pieces the sheets share', () => {
  it('converts each sum in its taxable part only', () => {
    const figures = printFigures({
      taxRate: 25,
      taxInclusive: true,
      linesInclTax: false,
      parts: [{ total: 125 }, { total: 50, taxable: false }],
      labor: [
        { total: 300, taxable: false },
        { total: 999, excluded: true },
      ],
    })
    expect(figures.partsTotal).toBe(175)
    expect(figures.laborTotal).toBe(300)
    expect(figures.partsShown).toBe(150)
    expect(figures.laborShown).toBe(300)
    expect(figures.taxableSubtotal).toBe(125)
    expect(figures.subtotalShown(475)).toBe(450)
    expect(figures.shown(125)).toBe(100)
    expect(figures.shown(50, false)).toBe(50)
    expect(figures.taxableAmount(475, 0)).toBe(100)
  })

  it('has nothing to say about a taxable amount when every line is taxed, or none is', () => {
    const all = printFigures({
      taxRate: 25,
      taxInclusive: false,
      linesInclTax: false,
      parts: [{ total: 100 }],
      labor: [{ total: 300, taxable: null }],
    })
    expect(all.taxableSubtotal).toBeNull()
    expect(all.taxableAmount(400, 0)).toBeNull()
    const noRate = printFigures({
      taxRate: 0,
      taxInclusive: false,
      linesInclTax: false,
      parts: [{ total: 100 }],
      labor: [{ total: 300, taxable: false }],
    })
    expect(noRate.taxableAmount(400, 0)).toBeNull()
  })

  it('puts the taxable amount above a single tax and above a split one', () => {
    const money = (value: number) => value.toFixed(2)
    expect(
      taxLines({
        taxRate: 8,
        taxAmount: 16,
        components: null,
        linesInclTax: false,
        labels,
        money,
        taxableAmount: 200,
      }).map((line) => [line.label, line.value])
    ).toEqual([
      ['Taxable amount', '200.00'],
      ['Tax (8%)', '16.00'],
    ])
    expect(
      taxLines({
        taxRate: 14.975,
        taxAmount: 29.95,
        components: [
          { name: 'GST', rate: 5, amount: 10 },
          { name: 'QST', rate: 9.975, amount: 19.95 },
        ],
        linesInclTax: false,
        labels,
        money,
        taxableAmount: 200,
      }).map((line) => line.label)
    ).toEqual(['Taxable amount', 'GST (5%)', 'QST (9.975%)'])
    // Without it, the rows every document printed before.
    expect(
      taxLines({ taxRate: 8, taxAmount: 40, components: null, linesInclTax: false, labels, money })
    ).toHaveLength(1)
  })

  it('adds a group up line by line, so a mixed group is right', () => {
    const display = (amount: number, taxable = true) => (taxable ? amount * 1.25 : amount)
    const groups = lineGroupsFor({
      parts: [
        { category: 'Brakes', total: 100 },
        { category: 'Brakes', total: 40, taxable: false },
      ],
      labor: [{ total: 300, taxable: false }],
      labels: {},
      shown: display,
      money: (amount) => amount.toFixed(2),
    })
    expect(groups?.map((g) => [g.key, g.subtotal])).toEqual([
      ['labor', '300.00'],
      ['category:Brakes', '165.00'],
    ])
  })
})

/* -------------------------------------------------------------------------- */

const accounting: AccountingInvoice = {
  id: 'svc1',
  vehicleId: 'veh1',
  invoiceNumber: 'INV-1',
  status: 'completed',
  issuedAt: new Date('2026-09-04T10:00:00Z'),
  invoiceDate: new Date('2026-09-04T10:00:00Z'),
  serviceDate: new Date('2026-09-02T09:00:00Z'),
  dueDate: null,
  mileage: null,
  notes: null,
  subtotal: 500,
  taxableSubtotal: 200,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  taxRate: 8,
  taxAmount: 16,
  taxInclusive: false,
  totalAmount: 516,
  manuallyPaid: false,
  customer: null,
  vehicle: null,
  lines: [
    {
      kind: 'labor',
      description: 'Fit pads',
      partNumber: null,
      quantity: 3,
      unitPrice: 100,
      total: 300,
      taxable: false,
    },
    {
      kind: 'part',
      description: 'Brake pads',
      partNumber: 'BP-100',
      quantity: 1,
      unitPrice: 200,
      total: 200,
      taxable: true,
    },
  ],
  payments: [],
}

describe('QuickBooks, for an invoice with untaxed labor', () => {
  const options = {
    customerRef: '58',
    customerEmail: null,
    laborItemId: '7',
    partsItemId: '8',
    taxCodeId: 'TAX',
    zeroTaxCodeId: 'NON',
    globalTax: false,
    currency: null,
    timezone: 'America/New_York',
    url: 'https://shop.example.com/x',
    taxExempt: false,
    includeVehicle: false,
    customTxnNumbers: true,
    txnTaxDetail: null,
  }
  type QboLine = { Amount: number; SalesItemLineDetail?: { TaxCodeRef?: { value: string } } }
  const codes = (body: Record<string, unknown>) =>
    (body.Line as QboLine[]).map((line) => line.SalesItemLineDetail?.TaxCodeRef?.value)

  it('books the labor under the non-taxable code and the parts under the taxable one', () => {
    expect(codes(buildInvoice(accounting, options))).toEqual(['NON', 'TAX'])
  })

  it('books every line as non-taxable for an exempt customer', () => {
    expect(codes(buildInvoice(accounting, { ...options, taxExempt: true }))).toEqual(['NON', 'NON'])
  })

  it('takes the tax out of the taxed line only, for a US company with inclusive prices', () => {
    const inclusive: AccountingInvoice = {
      ...accounting,
      subtotal: 516,
      taxableSubtotal: 216,
      taxInclusive: true,
      discountType: 'fixed',
      discountValue: 51.6,
      discountAmount: 51.6,
      lines: [accounting.lines[0], { ...accounting.lines[1], unitPrice: 216, total: 216 }],
    }
    const lines = buildInvoice(inclusive, options).Line as QboLine[]
    expect(lines[0].Amount).toBe(300)
    expect(lines[1].Amount).toBe(200)
    // A tenth off: 50 of the 500 net, not 51.60 and not 47.78.
    expect(lines[2].Amount).toBe(50)
  })

  it('is unchanged for an invoice whose every line is taxed', () => {
    const all: AccountingInvoice = {
      ...accounting,
      taxableSubtotal: null,
      lines: accounting.lines.map((line) => ({ ...line, taxable: true })),
    }
    expect(codes(buildInvoice(all, options))).toEqual(['TAX', 'TAX'])
  })
})

describe('Fiken, for an invoice with untaxed labor', () => {
  const options: SaleOptions = {
    customerId: 501,
    laborAccount: '3000',
    partsAccount: '3010',
    zeroAccount: '3100',
    vatType: 'HIGH',
    zeroVatType: 'NONE',
    timezone: 'Europe/Oslo',
  }
  type Line = { netPrice: number; vat?: number; account: string; vatType: string }
  const linesOf = (body: Record<string, unknown>) => body.lines as Line[]

  it('puts the VAT on the taxed line alone, and files the other as a sale without VAT', () => {
    const lines = linesOf(buildSale(accounting, options))
    expect(lines).toEqual([
      expect.objectContaining({ netPrice: 30000, account: '3100', vatType: 'NONE' }),
      expect.objectContaining({ netPrice: 20000, vat: 1600, account: '3010', vatType: 'HIGH' }),
    ])
    expect(lines[0].vat).toBeUndefined()
  })

  it('keeps the sale to the øre with a discount shared over both lines', () => {
    const discounted: AccountingInvoice = {
      ...accounting,
      discountType: 'percentage',
      discountValue: 10,
      discountAmount: 50,
      taxAmount: 14.4,
      totalAmount: 464.4,
    }
    const lines = linesOf(buildSale(discounted, options))
    expect(lines.map((l) => l.netPrice)).toEqual([27000, 18000])
    expect(lines.map((l) => l.vat ?? 0)).toEqual([0, 1440])
    const gross = lines.reduce((sum, l) => sum + l.netPrice + (l.vat ?? 0), 0)
    expect(gross).toBe(46440)
  })

  it('finds the VAT inside the taxed line when prices include it', () => {
    const inclusive: AccountingInvoice = {
      ...accounting,
      subtotal: 516,
      taxableSubtotal: 216,
      taxInclusive: true,
      lines: [accounting.lines[0], { ...accounting.lines[1], unitPrice: 216, total: 216 }],
    }
    const lines = linesOf(buildSale(inclusive, options))
    expect(lines.map((l) => l.netPrice)).toEqual([30000, 20000])
    expect(lines.map((l) => l.vat ?? 0)).toEqual([0, 1600])
  })

  it('is unchanged for an invoice whose every line is taxed', () => {
    const all: AccountingInvoice = {
      ...accounting,
      taxableSubtotal: null,
      taxAmount: 40,
      totalAmount: 540,
      lines: accounting.lines.map((line) => ({ ...line, taxable: true })),
    }
    const lines = linesOf(buildSale(all, options))
    expect(lines.map((l) => [l.netPrice, l.vat, l.account, l.vatType])).toEqual([
      [30000, 2400, '3000', 'HIGH'],
      [20000, 1600, '3010', 'HIGH'],
    ])
  })
})
