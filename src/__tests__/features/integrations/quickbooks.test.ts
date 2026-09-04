import { describe, expect, it } from 'vitest'
import type {
  AccountingCustomer,
  AccountingInvoice,
} from '@/features/integrations/Lib/accounting-sync'
import { manifest } from '@/integrations/quickbooks/manifest'
import {
  buildCustomer,
  buildInvoice,
  buildPayment,
  checksumOf,
  customerDisplayName,
  faultCode,
  faultMessage,
  localPaymentMethod,
  refField,
  sqlString,
} from '@/integrations/quickbooks/mapping'

const customer: AccountingCustomer = {
  id: 'cus1',
  name: "Anna O'Brien",
  email: 'anna@example.com',
  phone: '+47 912 34 567',
  address: 'Storgata 1\n0155 Oslo',
  company: 'Berg Transport AS',
  taxId: 'NO123456789MVA',
  taxExempt: false,
  customerNumber: 'C-0042',
}

const invoice: AccountingInvoice = {
  id: 'svc1',
  vehicleId: 'veh1',
  invoiceNumber: 'INV-2026-000123',
  status: 'completed',
  issuedAt: new Date('2026-09-04T10:00:00Z'),
  invoiceDate: new Date('2026-09-03T22:30:00Z'),
  serviceDate: new Date('2026-09-02T09:00:00Z'),
  dueDate: new Date('2026-09-18T12:00:00Z'),
  mileage: 84200,
  notes: 'Thank you',
  subtotal: 1500,
  discountType: 'percentage',
  discountValue: 10,
  discountAmount: 150,
  taxRate: 25,
  taxAmount: 337.5,
  taxInclusive: false,
  totalAmount: 1687.5,
  manuallyPaid: false,
  customer,
  vehicle: { year: 2018, make: 'Toyota', model: 'Corolla', licensePlate: 'AB 12345' },
  lines: [
    {
      kind: 'labor',
      description: 'Brake service',
      partNumber: null,
      quantity: 2,
      unitPrice: 500,
      total: 1000,
    },
    {
      kind: 'part',
      description: 'Brake pads',
      partNumber: 'BP-100',
      quantity: 2,
      unitPrice: 250,
      total: 500,
    },
  ],
  payments: [],
}

const options = {
  customerRef: '58',
  customerEmail: 'anna@example.com',
  laborItemId: '7',
  partsItemId: '8',
  taxCodeId: '3',
  zeroTaxCodeId: '4',
  globalTax: true,
  currency: null,
  timezone: 'Europe/Oslo',
  url: 'https://shop.example.com/vehicles/veh1/service/svc1',
  taxExempt: false,
  includeVehicle: false,
  customTxnNumbers: true,
}

/**
 * The shape QuickBooks receives is decided here, without a company to talk
 * to. Dates are the workshop's calendar day, references stop at the
 * vendor's 21 characters, and lines carry the tax code the settings chose.
 */
describe('QuickBooks invoice mapping', () => {
  it('builds lines, discount, dates and tax mode from the invoice', () => {
    const body = buildInvoice(invoice, options)
    expect(body.CustomerRef).toEqual({ value: '58' })
    // 22:30 UTC on the 3rd is already the 4th in Oslo.
    expect(body.TxnDate).toBe('2026-09-04')
    expect(body.DueDate).toBe('2026-09-18')
    expect(body.DocNumber).toBe('INV-2026-000123')
    expect(body.GlobalTaxCalculation).toBe('TaxExcluded')
    expect(body.BillEmail).toEqual({ Address: 'anna@example.com' })
    expect(body.CustomerMemo).toEqual({ value: 'Thank you' })
    expect(body.PrivateNote).toContain('https://shop.example.com/vehicles/veh1/service/svc1')
    const lines = body.Line as Record<string, unknown>[]
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({
      DetailType: 'SalesItemLineDetail',
      Amount: 1000,
      Description: 'Brake service',
      SalesItemLineDetail: {
        ItemRef: { value: '7' },
        Qty: 2,
        UnitPrice: 500,
        TaxCodeRef: { value: '3' },
      },
    })
    expect(lines[1]).toMatchObject({
      Amount: 500,
      Description: 'BP-100 Brake pads',
      SalesItemLineDetail: { ItemRef: { value: '8' }, Qty: 2, UnitPrice: 250 },
    })
    expect(lines[2]).toEqual({
      DetailType: 'DiscountLineDetail',
      Amount: 150,
      DiscountLineDetail: { PercentBased: true, DiscountPercent: 10 },
    })
  })

  it('books a hand-edited line total as one unit so quantity times price still adds up', () => {
    const body = buildInvoice(
      {
        ...invoice,
        lines: [
          {
            kind: 'labor',
            description: 'Diagnosis',
            partNumber: null,
            quantity: 1.5,
            unitPrice: 800,
            total: 1000,
          },
        ],
      },
      options
    )
    const [line] = body.Line as Record<string, Record<string, unknown>>[]
    expect(line.SalesItemLineDetail.Qty).toBe(1)
    expect(line.SalesItemLineDetail.UnitPrice).toBe(1000)
    expect(line.Amount).toBe(1000)
  })

  it('uses the tax-free code and NotApplicable for exempt and untaxed invoices', () => {
    const exempt = buildInvoice(invoice, { ...options, taxExempt: true })
    const [line] = exempt.Line as Record<string, Record<string, unknown>>[]
    expect(line.SalesItemLineDetail.TaxCodeRef).toEqual({ value: '4' })
    expect(exempt.GlobalTaxCalculation).toBe('NotApplicable')

    const inclusive = buildInvoice({ ...invoice, taxInclusive: true }, options)
    expect(inclusive.GlobalTaxCalculation).toBe('TaxInclusive')

    const us = buildInvoice(invoice, { ...options, globalTax: false })
    expect(us.GlobalTaxCalculation).toBeUndefined()
  })

  it('leaves out lines whose item is unknown and fixed discounts stay fixed', () => {
    const body = buildInvoice(
      { ...invoice, discountType: 'fixed', discountValue: 150 },
      { ...options, partsItemId: null }
    )
    const lines = body.Line as Record<string, unknown>[]
    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatchObject({ DiscountLineDetail: { PercentBased: false } })
  })

  it('names the vehicle in a text line above the charges when asked', () => {
    const body = buildInvoice(invoice, { ...options, includeVehicle: true })
    const lines = body.Line as Record<string, unknown>[]
    expect(lines).toHaveLength(4)
    expect(lines[0]).toEqual({
      DetailType: 'DescriptionOnly',
      Description: 'Vehicle: 2018 Toyota Corolla, AB 12345, 84200 km',
      DescriptionLineDetail: { ServiceDate: '2026-09-02' },
    })
    expect(lines[0]).not.toHaveProperty('Amount')
    const noVehicle = buildInvoice(
      { ...invoice, vehicle: null },
      { ...options, includeVehicle: true }
    )
    expect((noVehicle.Line as unknown[]).length).toBe(3)
  })

  it('dates every charge line with the day the work was done', () => {
    const body = buildInvoice(invoice, options)
    const [labor, part] = body.Line as Record<string, Record<string, unknown>>[]
    expect(labor.SalesItemLineDetail.ServiceDate).toBe('2026-09-02')
    expect(part.SalesItemLineDetail.ServiceDate).toBe('2026-09-02')
  })

  it('taxes after the discount, as the app does, and only says so when there is one', () => {
    expect(buildInvoice(invoice, options).ApplyTaxAfterDiscount).toBe(true)
    expect(
      buildInvoice({ ...invoice, discountAmount: 0, discountValue: 0 }, options)
        .ApplyTaxAfterDiscount
    ).toBeUndefined()
  })

  it('sends no document number when the company numbers invoices itself', () => {
    expect(buildInvoice(invoice, { ...options, customTxnNumbers: false }).DocNumber).toBeUndefined()
    expect(buildInvoice(invoice, options).DocNumber).toBe('INV-2026-000123')
  })

  it('cuts a long invoice number at the 21 characters QuickBooks keeps', () => {
    const long = buildInvoice({ ...invoice, invoiceNumber: 'WORKSHOP-2026-09-000000123' }, options)
    expect(long.DocNumber).toBe('WORKSHOP-2026-09-0000')
  })

  it('carries the currency only when told to', () => {
    expect(buildInvoice(invoice, options).CurrencyRef).toBeUndefined()
    expect(buildInvoice(invoice, { ...options, currency: 'NOK' }).CurrencyRef).toEqual({
      value: 'NOK',
    })
  })

  it('is stable for an unchanged invoice and changes when a line does', () => {
    const a = checksumOf(buildInvoice(invoice, options))
    const b = checksumOf(buildInvoice(invoice, options))
    const c = checksumOf(buildInvoice({ ...invoice, totalAmount: 1 }, options))
    const d = checksumOf(
      buildInvoice({ ...invoice, lines: [{ ...invoice.lines[0], total: 999 }] }, options)
    )
    expect(a).toBe(b)
    // Totals are not in the body; QuickBooks computes them.
    expect(a).toBe(c)
    expect(a).not.toBe(d)
  })
})

describe('QuickBooks customer and payment mapping', () => {
  it('splits the address into lines and keeps the tax id in the notes', () => {
    const body = buildCustomer(customer, customerDisplayName(customer))
    expect(body.DisplayName).toBe("Anna O'Brien")
    expect(body.CompanyName).toBe('Berg Transport AS')
    expect(body.PrimaryEmailAddr).toEqual({ Address: 'anna@example.com' })
    expect(body.BillAddr).toEqual({ Line1: 'Storgata 1', Line2: '0155 Oslo' })
    expect(body.Notes).toContain('C-0042')
    expect(body.Notes).toContain('NO123456789MVA')
    expect(body.Taxable).toBe(true)
    expect(buildCustomer({ ...customer, taxExempt: true }, 'x').Taxable).toBe(false)
  })

  it('fixes the currency on a new customer only when given one', () => {
    expect(buildCustomer(customer, 'x').CurrencyRef).toBeUndefined()
    expect(buildCustomer(customer, 'x', { currency: 'NOK' }).CurrencyRef).toEqual({ value: 'NOK' })
  })

  it('keeps every field inside the lengths QuickBooks accepts', () => {
    const body = buildCustomer(
      {
        ...customer,
        company: 'C'.repeat(200),
        phone: '1'.repeat(50),
        email: `${'e'.repeat(120)}@x.io`,
        address: Array.from({ length: 8 }, (_, i) => `Line ${i}`).join('\n'),
        taxId: 'T'.repeat(3000),
      },
      'N'.repeat(600)
    )
    expect((body.CompanyName as string).length).toBe(100)
    expect((body.PrimaryPhone as { FreeFormNumber: string }).FreeFormNumber.length).toBe(30)
    expect((body.PrimaryEmailAddr as { Address: string }).Address.length).toBe(100)
    expect(Object.keys(body.BillAddr as object)).toEqual([
      'Line1',
      'Line2',
      'Line3',
      'Line4',
      'Line5',
    ])
    expect((body.Notes as string).length).toBe(2000)
    expect(customerDisplayName({ ...customer, name: 'N'.repeat(600) }).length).toBe(500)
  })

  it('links a payment to its invoice and trims the reference', () => {
    const body = buildPayment(
      {
        id: 'pay1',
        serviceRecordId: 'svc1',
        amount: 1687.499,
        date: new Date('2026-09-05T23:30:00Z'),
        method: 'card',
        note: null,
        provider: 'stripe',
        externalId: 'pi_3Nz1234567890abcdefXYZ',
      },
      {
        customerRef: '58',
        invoiceRemoteId: '145',
        depositAccountId: '35',
        currency: null,
        timezone: 'Europe/Oslo',
      }
    )
    expect(body.TotalAmt).toBe(1687.5)
    expect(body.TxnDate).toBe('2026-09-06')
    expect(body.PaymentRefNum).toBe('pi_3Nz1234567890abcde')
    expect(body.DepositToAccountRef).toEqual({ value: '35' })
    expect(body.Line).toEqual([
      { Amount: 1687.5, LinkedTxn: [{ TxnId: '145', TxnType: 'Invoice' }] },
    ])
    expect(String(body.PrivateNote)).toContain('card')
  })

  it('maps ledger payment method names onto the app’s own', () => {
    expect(localPaymentMethod('Cash')).toBe('cash')
    expect(localPaymentMethod('Credit Card')).toBe('card')
    expect(localPaymentMethod('Bank transfer')).toBe('transfer')
    expect(localPaymentMethod('Check')).toBe('other')
    expect(localPaymentMethod(undefined)).toBe('other')
  })
})

describe('QuickBooks API helpers', () => {
  it('escapes query strings and trims references', () => {
    expect(sqlString("Anna O'Brien")).toBe("'Anna O\\'Brien'")
    expect(refField('  INV-1  ')).toBe('INV-1')
    expect(refField('x'.repeat(30))).toHaveLength(21)
    expect(refField(null)).toBeUndefined()
  })

  it('reads the vendor’s fault message and code', () => {
    const body = JSON.stringify({
      Fault: {
        Error: [
          { Message: 'Object Not Found', Detail: 'Object Not Found : Invoice 9', code: '610' },
        ],
        type: 'ValidationFault',
      },
    })
    expect(faultMessage(body)).toBe('Object Not Found: Object Not Found : Invoice 9')
    expect(faultCode(body)).toBe('610')
    expect(faultMessage('<html>gateway</html>')).toBe('<html>gateway</html>')
    expect(faultCode('nope')).toBeNull()
  })

  it('declares the company id as a callback parameter and Basic token auth', () => {
    expect(manifest.auth.type).toBe('oauth2')
    if (manifest.auth.type !== 'oauth2') return
    expect(manifest.auth.callbackParams).toEqual(['realmId'])
    expect(manifest.auth.tokenAuth).toBe('basic')
    expect(manifest.auth.pkce).toBeFalsy()
  })
})
