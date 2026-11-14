import { describe, expect, it } from 'vitest'
import type {
  AccountingCustomer,
  AccountingInvoice,
} from '@/features/integrations/Lib/accounting-sync'
import { tokenUrlFor } from '@/features/integrations/Lib/oauth'
import { manifest } from '@/integrations/zoho-books/manifest'
import {
  type InvoiceOptions,
  apiBase,
  buildContact,
  buildInvoice,
  buildPayment,
  contactName,
  errorParts,
  exactCents,
  invoiceUrl,
  modifiedSince,
  paymentMode,
  referenceFor,
  sameName,
  webBase,
  zohoText,
} from '@/integrations/zoho-books/mapping'

/**
 * What a Torqvoice invoice looks like when it reaches Zoho Books. Field
 * names are Zoho's own (Books API v3); the rules about text, omitted fields
 * and lines were learned from a live organisation on 14 Nov 2026, so a
 * wrong one here is a refused invoice there.
 */

const customer: AccountingCustomer = {
  id: 'cus1',
  name: 'Kari Nordmann',
  email: 'kari@example.com',
  phone: '+47 912 34 567',
  address: 'Storgata 1\n0150 Oslo',
  company: null,
  taxId: null,
  taxExempt: false,
  customerNumber: 'C-0042',
}

const invoice: AccountingInvoice = {
  id: 'svc1',
  vehicleId: 'veh1',
  title: 'Oil service',
  invoiceNumber: '2026-1054',
  status: 'completed',
  issuedAt: new Date('2026-11-04T09:00:00Z'),
  invoiceDate: new Date('2026-11-04T09:00:00Z'),
  serviceDate: new Date('2026-11-03T09:00:00Z'),
  dueDate: new Date('2026-11-18T09:00:00Z'),
  mileage: 206382,
  notes: 'Brake pads at <3 mm, replace soon & check discs 🔧',
  subtotal: 4045,
  taxableSubtotal: null,
  discountType: 'percentage',
  discountValue: 10,
  discountAmount: 404.5,
  taxRate: 25,
  taxAmount: 910.13,
  taxInclusive: false,
  totalAmount: 4550.63,
  manuallyPaid: false,
  customer,
  vehicle: { year: 2019, make: 'BMW', model: '5-Serie', licensePlate: 'BT90387' },
  lines: [
    {
      kind: 'labor',
      description: 'Oil change',
      partNumber: null,
      quantity: 1,
      unitPrice: 350,
      total: 350,
      taxable: true,
    },
    {
      kind: 'part',
      description: 'Castrol Edge',
      partNumber: 'CEL-5W30',
      quantity: 7,
      unitPrice: 317,
      total: 2219,
      taxable: true,
    },
    {
      kind: 'part',
      description: 'Oil filter',
      partNumber: 'OX<371>',
      quantity: 1,
      unitPrice: 275,
      total: 275,
      taxable: true,
    },
    {
      kind: 'part',
      description: 'Diesel filter',
      partNumber: null,
      quantity: 1,
      unitPrice: 706,
      total: 706,
      taxable: true,
    },
    {
      kind: 'part',
      description: 'Air filter',
      partNumber: null,
      quantity: 1,
      unitPrice: 495,
      total: 495,
      taxable: true,
    },
  ],
  payments: [],
}

function options(overrides: Partial<InvoiceOptions> = {}): InvoiceOptions {
  return {
    customerId: 'zc1',
    invoiceNumber: '2026-1054',
    reference: 'BT90387 BMW 5-Serie',
    dueDate: '2026-11-18',
    timezone: 'Europe/Oslo',
    includeVehicle: true,
    includeNotes: true,
    notesPosition: 'customerNotes',
    includePartNumbers: true,
    distanceUnit: 'km',
    templateId: null,
    locationId: null,
    currencyId: null,
    accounts: { labor: 'acc-labour', parts: 'acc-parts', shopFee: null },
    items: { labor: null, parts: null },
    partItems: new Map(),
    taxId: 'tax25',
    zeroTaxId: '',
    taxExempt: false,
    lineIds: [],
    adjustment: 0,
    ...overrides,
  }
}

type Line = Record<string, unknown> & { rate: number; quantity: number; discount: number }

function linesOf(body: Record<string, unknown>): Line[] {
  return body.line_items as Line[]
}

/** What Zoho computes from the body: line totals after discount, then tax per rate, rounded once. */
function zohoTotal(body: Record<string, unknown>, rate: number): number {
  const lines = linesOf(body)
  const net = lines.reduce((a, l) => a + Math.round((l.rate * l.quantity - l.discount) * 100), 0)
  const taxed = lines
    .filter((l) => l.tax_id)
    .reduce((a, l) => a + Math.round((l.rate * l.quantity - l.discount) * 100), 0)
  const tax = Math.round((taxed * rate) / 100)
  return (net + tax) / 100
}

describe('text Zoho Books accepts', () => {
  it('turns angle brackets into lookalikes, since Zoho refuses a whole request over one', () => {
    expect(zohoText('Torque 5<10 Nm, a > b', 100)).toBe('Torque 5‹10 Nm, a › b')
  })

  it('drops emoji, which Zoho would store as question marks, and keeps letters like æøå', () => {
    expect(zohoText('Check discs 🔧 on the Ærø ferry 👍🏽', 100)).toBe(
      'Check discs  on the Ærø ferry'
    )
  })

  it('keeps ampersands, quotes and line breaks, which Zoho takes as they are', () => {
    expect(zohoText('a & b\n"50" it\'s', 100)).toBe('a & b\n"50" it\'s')
  })

  it('cuts to the field length', () => {
    expect(zohoText('x'.repeat(3000), 2000)).toHaveLength(2000)
  })
})

describe('invoices', () => {
  it('adds up to the printed total, with the discount on the lines and the tax left to Zoho', () => {
    const body = buildInvoice(invoice, options())
    expect(zohoTotal(body, 25)).toBe(4550.63)
    expect(linesOf(body).reduce((a, l) => a + l.discount, 0)).toBeCloseTo(404.5, 2)
    expect(body.discount_type).toBe('item_level')
    expect(body.is_discount_before_tax).toBe(true)
  })

  it('always sends notes, adjustment and every line discount, since Zoho keeps old values for fields left out', () => {
    const body = buildInvoice(
      { ...invoice, notes: null, discountAmount: 0, taxAmount: 1011.25, totalAmount: 5056.25 },
      options({ includeVehicle: false })
    )
    expect(body).toHaveProperty('notes', '')
    expect(body).toHaveProperty('adjustment', 0)
    expect(body).toHaveProperty('adjustment_description', '')
    for (const l of linesOf(body)) expect(l).toHaveProperty('discount', 0)
  })

  it('puts the vehicle and the plain-text notes in Zoho’s customer notes, made safe', () => {
    const body = buildInvoice(invoice, options())
    expect(body.notes).toBe(
      'Vehicle: 2019 BMW 5-Serie, BT90387, 206,382 km\n\nBrake pads at ‹3 mm, replace soon & check discs'
    )
    expect(String(body.notes)).not.toMatch(/[<>]/)
  })

  it('puts them in a text line below or above the charges when asked, and leaves the notes field empty', () => {
    const below = buildInvoice(invoice, options({ notesPosition: 'below' }))
    expect(below.notes).toBe('')
    const last = linesOf(below).at(-1)
    expect(last).toMatchObject({ rate: 0, quantity: 1, tax_id: '' })
    expect(String(last?.description)).toContain('Vehicle: 2019 BMW')
    const above = buildInvoice(invoice, options({ notesPosition: 'above' }))
    expect(String(linesOf(above)[0].description)).toContain('Brake pads at ‹3 mm')
  })

  it('writes part numbers safely in front of the part, and books each kind of line to its account', () => {
    const lines = linesOf(buildInvoice(invoice, options()))
    expect(lines[0]).toMatchObject({ description: 'Oil change', account_id: 'acc-labour' })
    expect(lines[1]).toMatchObject({
      description: 'CEL-5W30 Castrol Edge',
      account_id: 'acc-parts',
    })
    expect(lines[2].description).toBe('OX‹371› Oil filter')
  })

  it('leaves out the vehicle, notes and part numbers when switched off', () => {
    const body = buildInvoice(
      invoice,
      options({ includeVehicle: false, includeNotes: false, includePartNumbers: false })
    )
    expect(body.notes).toBe('')
    expect(linesOf(body)[1].description).toBe('Castrol Edge')
  })

  it('sends the Torqvoice number, or none so Zoho numbers it', () => {
    expect(buildInvoice(invoice, options()).invoice_number).toBe('2026-1054')
    expect(buildInvoice(invoice, options({ invoiceNumber: null }))).not.toHaveProperty(
      'invoice_number'
    )
  })

  it('books untaxed lines without tax, or under the chosen 0% tax, and a tax-exempt customer the same', () => {
    const mixed: AccountingInvoice = {
      ...invoice,
      discountAmount: 0,
      taxableSubtotal: 3690,
      taxAmount: 922.5,
      totalAmount: 4967.5,
      lines: invoice.lines.map((l, i) => (i === 0 ? { ...l, taxable: false } : l)),
    }
    expect(linesOf(buildInvoice(mixed, options()))[0].tax_id).toBe('')
    expect(linesOf(buildInvoice(mixed, options({ zeroTaxId: 'tax0' })))[0].tax_id).toBe('tax0')
    const exempt = linesOf(buildInvoice(mixed, options({ taxExempt: true, zeroTaxId: 'tax0' })))
    expect(exempt.every((l) => l.tax_id === 'tax0')).toBe(true)
  })

  it('sends a line whose price has more than two places as one unit at its amount, keeping the figures in the text', () => {
    const odd: AccountingInvoice = {
      ...invoice,
      discountAmount: 0,
      subtotal: 50,
      taxAmount: 12.5,
      totalAmount: 62.5,
      lines: [
        {
          kind: 'labor',
          description: 'Diagnosis',
          partNumber: null,
          quantity: 1.5,
          unitPrice: 33.3333,
          total: 50,
          taxable: true,
        },
      ],
    }
    const [line] = linesOf(
      buildInvoice(odd, options({ includeVehicle: false, includeNotes: false }))
    )
    expect(line).toMatchObject({ quantity: 1, rate: 50, description: 'Diagnosis (1.5 × 33.3333)' })
  })

  it('keeps line ids by position so an edit changes lines instead of replacing them', () => {
    const lines = linesOf(buildInvoice(invoice, options({ lineIds: ['l1', 'l2'] })))
    expect(lines[0].line_item_id).toBe('l1')
    expect(lines[1].line_item_id).toBe('l2')
    expect(lines[2]).not.toHaveProperty('line_item_id')
  })

  it('sends a tax-inclusive invoice’s discount net of tax, since Zoho takes it off before tax', () => {
    // XT-1018 from the walk: prices with 25% tax, 100 off, 1449.70 to pay.
    const inclusive: AccountingInvoice = {
      ...invoice,
      taxInclusive: true,
      subtotal: 1549.7,
      discountType: 'fixed',
      discountValue: 100,
      discountAmount: 100,
      taxAmount: 289.94,
      totalAmount: 1449.7,
      lines: [
        {
          kind: 'labor',
          description: 'Wheel change',
          partNumber: null,
          quantity: 1,
          unitPrice: 1250,
          total: 1250,
          taxable: true,
        },
        {
          kind: 'part',
          description: 'Valve',
          partNumber: null,
          quantity: 3,
          unitPrice: 99.9,
          total: 299.7,
          taxable: true,
        },
      ],
    }
    const body = buildInvoice(inclusive, options({ includeVehicle: false, includeNotes: false }))
    const lines = linesOf(body)
    expect(lines.reduce((a, l) => a + l.discount, 0)).toBeCloseTo(80, 2)
    // Zoho: net = gross / 1.25 less the discount, tax 25% of that, rounded once.
    const net = lines.reduce(
      (a, l) => a + Math.round(((l.rate * l.quantity) / 1.25 - l.discount) * 100),
      0
    )
    const total = (net + Math.round(net * 0.25)) / 100
    expect(total).toBeCloseTo(1449.7, 1)
  })

  it('marks a tax-inclusive invoice as such only when it carries tax', () => {
    expect(buildInvoice({ ...invoice, taxInclusive: true }, options()).is_inclusive_tax).toBe(true)
    expect(
      buildInvoice({ ...invoice, taxInclusive: true }, options({ taxId: null })).is_inclusive_tax
    ).toBe(false)
  })

  it('finds a cent-exact quantity and rate, and says when there is none', () => {
    expect(exactCents(7, 317)).toBe(221900)
    expect(exactCents(1.5, 33.33)).toBeNull()
    expect(exactCents(1, 512.373)).toBeNull()
  })
})

describe('contacts', () => {
  it('names the primary person with email and phone, and keeps that person on an update', () => {
    const body = buildContact(customer, contactName(customer), 'cp1')
    expect(body).toMatchObject({
      contact_name: 'Kari Nordmann',
      company_name: '',
      contact_type: 'customer',
      customer_sub_type: 'individual',
      billing_address: { address: 'Storgata 1', street2: '0150 Oslo' },
    })
    expect((body.contact_persons as Record<string, unknown>[])[0]).toEqual({
      contact_person_id: 'cp1',
      first_name: 'Kari',
      last_name: 'Nordmann',
      email: 'kari@example.com',
      phone: '+47 912 34 567',
      is_primary_contact: true,
    })
  })

  it('bills a business in the company name', () => {
    const business = { ...customer, company: 'Nordmann Transport AS' }
    expect(buildContact(business, contactName(business))).toMatchObject({
      contact_name: 'Nordmann Transport AS',
      company_name: 'Nordmann Transport AS',
      customer_sub_type: 'business',
    })
  })

  it('tells customers apart by name, so a shared email alone is not enough', () => {
    expect(sameName(customer, { contact_name: 'kari nordmann' })).toBe(true)
    expect(
      sameName(customer, { contact_name: 'X', first_name: 'Kari', last_name: 'Nordmann' })
    ).toBe(true)
    expect(sameName(customer, { contact_name: 'Ola Nordmann' })).toBe(false)
  })
})

describe('payments and references', () => {
  it('records a payment against the invoice into the chosen account, by Zoho’s payment mode', () => {
    const body = buildPayment(
      {
        id: 'p1',
        serviceRecordId: 'svc1',
        amount: 1000,
        date: new Date('2026-11-14T23:30:00Z'),
        method: 'card',
        note: 'Terminal <2>',
        provider: null,
        externalId: null,
      },
      {
        customerId: 'zc1',
        invoiceId: 'zi1',
        accountId: 'acc-bank',
        timezone: 'Europe/Oslo',
        amount: 1000,
      }
    )
    expect(body).toEqual({
      customer_id: 'zc1',
      payment_mode: 'creditcard',
      amount: 1000,
      // 23:30 UTC is already the next day in Oslo.
      date: '2026-11-15',
      reference_number: 'Torqvoice card',
      description: 'Terminal ‹2›',
      account_id: 'acc-bank',
      invoices: [{ invoice_id: 'zi1', amount_applied: 1000 }],
    })
    expect(paymentMode({ method: 'cash', provider: null })).toBe('cash')
    expect(paymentMode({ method: 'transfer', provider: null })).toBe('banktransfer')
    expect(paymentMode({ method: 'stripe', provider: 'stripe' })).toBe('others')
  })

  it('fills the reference from the workshop’s choice', () => {
    expect(referenceFor(invoice, 'vehicle')).toBe('BT90387 BMW 5-Serie')
    expect(referenceFor(invoice, 'title')).toBe('Oil service')
    expect(referenceFor(invoice, 'invoiceNumber')).toBe('2026-1054')
    expect(referenceFor(invoice, 'none')).toBe('')
  })
})

describe('regions and hosts', () => {
  it('calls the API host Zoho named for the account’s region, and no other', () => {
    expect(apiBase('https://www.zohoapis.eu')).toBe('https://www.zohoapis.eu/books/v3')
    expect(apiBase('https://www.zohoapis.com.au')).toBe('https://www.zohoapis.com.au/books/v3')
    expect(apiBase(undefined)).toBe('https://www.zohoapis.com/books/v3')
    expect(() => apiBase('https://evil.example')).toThrow(/not Zoho/)
    expect(() => apiBase('http://www.zohoapis.eu')).toThrow(/not Zoho/)
  })

  it('links into the Books web app of the same region', () => {
    expect(webBase('https://www.zohoapis.eu')).toBe('https://books.zoho.eu')
    expect(webBase('https://www.zohoapis.ca')).toBe('https://books.zohocloud.ca')
    expect(invoiceUrl('https://www.zohoapis.eu', '201', 'i9')).toBe(
      'https://books.zoho.eu/app/201#/invoices/i9'
    )
  })

  it('sends the code exchange and refreshes to the region’s sign-in server, and refuses any other', () => {
    if (manifest.auth.type !== 'oauth2') throw new Error('oauth2 expected')
    const spec = manifest.auth
    expect(tokenUrlFor(spec, { 'accounts-server': 'https://accounts.zoho.eu' })).toBe(
      'https://accounts.zoho.eu/oauth/v2/token'
    )
    expect(tokenUrlFor(spec, { 'accounts-server': 'https://accounts.zohocloud.ca' })).toBe(
      'https://accounts.zohocloud.ca/oauth/v2/token'
    )
    expect(tokenUrlFor(spec, {})).toBe('https://accounts.zoho.com/oauth/v2/token')
    expect(() => tokenUrlFor(spec, { 'accounts-server': 'https://attacker.example' })).toThrow(
      /not one of the provider/
    )
    expect(() => tokenUrlFor(spec, { 'accounts-server': 'http://accounts.zoho.eu' })).toThrow()
  })

  it('asks for comma-joined scopes and a refresh token every time', () => {
    if (manifest.auth.type !== 'oauth2') throw new Error('oauth2 expected')
    expect(manifest.auth.scopeSeparator).toBe(',')
    expect(manifest.auth.authorizeParams).toEqual({ access_type: 'offline', prompt: 'consent' })
    expect(manifest.auth.authScheme).toBe('Zoho-oauthtoken')
  })

  it('reads Zoho’s error code and sentence, and writes its modified-since time', () => {
    expect(errorParts('{"code":1001,"message":"Invoice 2026-1054 already exists"}')).toEqual({
      code: 1001,
      message: 'Invoice 2026-1054 already exists',
    })
    expect(modifiedSince(new Date('2026-11-14T19:05:06.789Z'))).toBe('2026-11-14T19:05:06+0000')
  })
})
