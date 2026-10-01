import { describe, expect, it } from 'vitest'
import type {
  AccountingCustomer,
  AccountingInvoice,
} from '@/features/integrations/Lib/accounting-sync'
import { manifest } from '@/integrations/fiken/manifest'
import {
  allocate,
  buildContact,
  buildPayment,
  buildSale,
  carriesVat,
  contactName,
  faultMessage,
  fromCents,
  idFromLocation,
  localPaymentMethod,
  mergeContact,
  organizationNumber,
  toCents,
  vatTypeForRate,
} from '@/integrations/fiken/mapping'

const customer: AccountingCustomer = {
  id: 'cus1',
  name: 'Berg Transport AS',
  email: 'post@bergtransport.no',
  phone: '+47 912 34 567',
  address: 'Storgata 1\n0155 Oslo',
  company: 'Berg Transport AS',
  taxId: 'NO 987 654 321 MVA',
  taxExempt: false,
  customerNumber: 'C-0042',
}

const invoice: AccountingInvoice = {
  id: 'svc1',
  vehicleId: 'veh1',
  invoiceNumber: 'INV-2026-000123',
  status: 'completed',
  issuedAt: new Date('2026-09-04T10:00:00Z'),
  // Half past midnight on the 4th in Oslo, still the 3rd in UTC.
  invoiceDate: new Date('2026-09-03T22:30:00Z'),
  serviceDate: new Date('2026-09-02T09:00:00Z'),
  dueDate: new Date('2026-09-18T12:00:00Z'),
  mileage: 84200,
  notes: null,
  subtotal: 1500,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  taxRate: 25,
  taxAmount: 375,
  taxInclusive: false,
  totalAmount: 1875,
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
      quantity: 1,
      unitPrice: 500,
      total: 500,
    },
  ],
  payments: [],
}

const options = {
  customerId: 501,
  laborAccount: '3000',
  partsAccount: '3010',
  zeroAccount: null,
  vatType: 'HIGH',
  zeroVatType: 'NONE',
  timezone: 'Europe/Oslo',
}

type Line = { description: string; netPrice: number; vat: number; account: string; vatType: string }
const linesOf = (body: Record<string, unknown>) => body.lines as Line[]
const sum = (rows: Line[], key: 'netPrice' | 'vat') => rows.reduce((a, r) => a + r[key], 0)

describe('Fiken mapping: money', () => {
  it('counts in whole øre', () => {
    expect(toCents(1875)).toBe(187500)
    expect(toCents(0.29)).toBe(29)
    expect(toCents(1.005)).toBe(101)
    expect(fromCents(187550)).toBe(1875.5)
  })

  it('names the Norwegian VAT type for a rate, and none for a rate Norway does not have', () => {
    expect(vatTypeForRate(25)).toBe('HIGH')
    expect(vatTypeForRate(15)).toBe('MEDIUM')
    expect(vatTypeForRate(12)).toBe('LOW')
    expect(vatTypeForRate(11.11)).toBe('RAW_FISH')
    expect(vatTypeForRate(20)).toBeNull()
    expect(vatTypeForRate(0)).toBeNull()
  })

  it('splits an amount so the parts always add up to it', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(allocate(10, [3, 0, 7])).toEqual([3, 0, 7])
    expect(allocate(-100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(-100)
    expect(allocate(999, [200, -50, 150]).reduce((a, b) => a + b, 0)).toBe(999)
    expect(allocate(50, [])).toEqual([])
    expect(allocate(50, [0, 0])).toEqual([0, 0])
  })
})

describe('Fiken mapping: a sale', () => {
  it('books an invoice as an externally numbered sale, dated in the workshop timezone', () => {
    expect(buildSale(invoice, options)).toEqual({
      saleNumber: 'INV-2026-000123',
      date: '2026-09-04',
      kind: 'external_invoice',
      lines: [
        {
          description: 'Brake service',
          netPrice: 100000,
          vat: 25000,
          account: '3000',
          vatType: 'HIGH',
        },
        {
          description: 'BP-100 Brake pads',
          netPrice: 50000,
          vat: 12500,
          account: '3010',
          vatType: 'HIGH',
        },
      ],
      customerId: 501,
      currency: 'NOK',
      dueDate: '2026-09-18',
    })
  })

  it('spreads a discount over the lines and keeps the billed total to the øre', () => {
    // 10% off 1500 is 1350 net, 337.50 VAT, 1687.50 to pay.
    const body = buildSale(
      {
        ...invoice,
        discountType: 'percentage',
        discountValue: 10,
        discountAmount: 150,
        taxAmount: 337.5,
        totalAmount: 1687.5,
      },
      options
    )
    const lines = linesOf(body)
    expect(lines.map((l) => l.netPrice)).toEqual([90000, 45000])
    expect(lines.map((l) => l.vat)).toEqual([22500, 11250])
    expect(sum(lines, 'netPrice') + sum(lines, 'vat')).toBe(168750)
  })

  it('takes the VAT out of prices entered with VAT included', () => {
    // Lines are gross: 1250 + 625 = 1875, of which 375 is VAT.
    const body = buildSale(
      {
        ...invoice,
        taxInclusive: true,
        lines: [
          { ...invoice.lines[0], unitPrice: 625, total: 1250 },
          { ...invoice.lines[1], unitPrice: 625, total: 625 },
        ],
      },
      options
    )
    const lines = linesOf(body)
    expect(lines.map((l) => l.netPrice)).toEqual([100000, 50000])
    expect(lines.map((l) => l.vat)).toEqual([25000, 12500])
  })

  it('never loses an øre to rounding, whatever the lines are', () => {
    const body = buildSale(
      {
        ...invoice,
        taxAmount: 83.33,
        totalAmount: 416.66,
        lines: [
          { ...invoice.lines[0], quantity: 1, unitPrice: 111.11, total: 111.11 },
          { ...invoice.lines[1], quantity: 1, unitPrice: 111.11, total: 111.11 },
          { ...invoice.lines[1], quantity: 1, unitPrice: 111.11, total: 111.11 },
        ],
      },
      options
    )
    const lines = linesOf(body)
    expect(sum(lines, 'netPrice')).toBe(33333)
    expect(sum(lines, 'vat')).toBe(8333)
    expect(lines.map((l) => l.netPrice)).toEqual([11111, 11111, 11111])
  })

  it('books an invoice without VAT under the chosen type and account', () => {
    const body = buildSale(
      { ...invoice, taxRate: 25, taxAmount: 0, totalAmount: 1500 },
      { ...options, zeroVatType: 'EXEMPT', zeroAccount: '3100' }
    )
    expect(linesOf(body)).toEqual([
      {
        description: 'Brake service',
        netPrice: 100000,
        vat: 0,
        account: '3100',
        vatType: 'EXEMPT',
      },
      {
        description: 'BP-100 Brake pads',
        netPrice: 50000,
        vat: 0,
        account: '3100',
        vatType: 'EXEMPT',
      },
    ])
    expect(carriesVat({ ...invoice, taxAmount: 0 })).toBe(false)
  })

  it('keeps the income accounts for a tax-free invoice when no other is chosen', () => {
    const body = buildSale({ ...invoice, taxAmount: 0, totalAmount: 1500 }, options)
    expect(linesOf(body).map((l) => [l.account, l.vatType])).toEqual([
      ['3000', 'NONE'],
      ['3010', 'NONE'],
    ])
  })

  it('leaves out lines that carry no money and shortens long descriptions', () => {
    const body = buildSale(
      {
        ...invoice,
        lines: [
          { ...invoice.lines[0], description: 'x'.repeat(300) },
          { ...invoice.lines[1], quantity: 1, unitPrice: 0, total: 0 },
          { ...invoice.lines[1] },
        ],
      },
      options
    )
    const lines = linesOf(body)
    expect(lines).toHaveLength(2)
    expect(lines[0].description).toHaveLength(200)
    expect(sum(lines, 'netPrice') + sum(lines, 'vat')).toBe(187500)
  })

  it('books an old record with a total and no lines as one line', () => {
    const body = buildSale({ ...invoice, lines: [], dueDate: null }, options)
    expect(linesOf(body)).toEqual([
      {
        description: 'Faktura INV-2026-000123',
        netPrice: 150000,
        vat: 37500,
        account: '3000',
        vatType: 'HIGH',
      },
    ])
    expect(body).not.toHaveProperty('dueDate')
  })
})

describe('Fiken mapping: contacts and payments', () => {
  it('reads a Norwegian organisation number however it was typed', () => {
    expect(organizationNumber('NO 987 654 321 MVA')).toBe('987654321')
    expect(organizationNumber('987654321')).toBe('987654321')
    expect(organizationNumber('GB123456789012')).toBeNull()
    expect(organizationNumber(null)).toBeNull()
  })

  it('builds a customer contact without guessing an address', () => {
    expect(buildContact(customer)).toEqual({
      name: 'Berg Transport AS',
      email: 'post@bergtransport.no',
      organizationNumber: '987654321',
      phoneNumber: '+47 912 34 567',
      memberNumberString: 'C-0042',
      customer: true,
    })
    expect(
      buildContact({ ...customer, email: null, phone: null, taxId: null, customerNumber: null })
    ).toEqual({ name: 'Berg Transport AS', customer: true })
    expect(contactName({ ...customer, name: '  ', company: 'Berg AS' })).toBe('Berg AS')
  })

  it('updates a contact without wiping what the bookkeeper filled in', () => {
    const current = {
      contactId: 501,
      name: 'Berg Transport',
      email: 'faktura@bergtransport.no',
      organizationNumber: '987654321',
      customer: true,
      supplier: true,
      customerNumber: 10042,
      customerAccountCode: '1500:10042',
      address: { streetAddress: 'Storgata 1', postCode: '0155', city: 'Oslo', country: 'Norway' },
      language: 'Norwegian',
      daysUntilInvoicingDueDate: 14,
    }
    expect(mergeContact(current, buildContact({ ...customer, email: null }))).toEqual({
      supplier: true,
      language: 'Norwegian',
      daysUntilInvoicingDueDate: 14,
      address: { streetAddress: 'Storgata 1', postCode: '0155', city: 'Oslo', country: 'Norway' },
      email: 'faktura@bergtransport.no',
      organizationNumber: '987654321',
      name: 'Berg Transport AS',
      phoneNumber: '+47 912 34 567',
      memberNumberString: 'C-0042',
      customer: true,
    })
  })

  it('dates a payment in the workshop timezone and counts it in øre', () => {
    expect(
      buildPayment(
        { amount: 1875, date: new Date('2026-09-05T22:30:00Z') },
        { account: '1920:10001', timezone: 'Europe/Oslo' }
      )
    ).toEqual({ date: '2026-09-06', account: '1920:10001', amount: 187500 })
  })

  it('reads cash from the account a Fiken payment landed on', () => {
    expect(localPaymentMethod('1900')).toBe('cash')
    expect(localPaymentMethod('1920:10001')).toBe('transfer')
    expect(localPaymentMethod(undefined)).toBe('transfer')
  })

  it('takes a new record id from the Location header', () => {
    expect(idFromLocation('https://api.fiken.no/api/v2/companies/verksted-as/sales/9001')).toBe(
      9001
    )
    expect(idFromLocation('https://api.fiken.no/api/v2/companies/x/contacts/501/')).toBe(501)
    expect(idFromLocation('https://api.fiken.no/api/v2/companies/x/sales')).toBeNull()
    expect(idFromLocation(null)).toBeNull()
  })

  it("passes on Fiken's own wording for a failure", () => {
    expect(faultMessage(JSON.stringify({ error: 'x', error_description: 'Ugyldig konto' }))).toBe(
      'Ugyldig konto'
    )
    expect(faultMessage(JSON.stringify([{ message: 'A' }, { message: 'B' }]))).toBe('A; B')
    expect(faultMessage('<html>502</html>')).toBe('<html>502</html>')
  })
})

describe('Fiken manifest', () => {
  it('asks for the company first and uses Fiken OAuth as documented', () => {
    expect(manifest.settings[0]).toMatchObject({ key: 'companySlug', required: true })
    expect(manifest.auth).toMatchObject({
      type: 'oauth2',
      authorizeUrl: 'https://fiken.no/oauth/authorize',
      tokenUrl: 'https://fiken.no/oauth/token',
      scopes: [],
      tokenAuth: 'basic',
      stateOnExchange: true,
    })
  })
})
