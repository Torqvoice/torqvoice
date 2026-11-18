/**
 * What a customer-facing page sends to the browser.
 *
 * Whatever a server page passes to a client component is written into the
 * page, drawn or not, and whatever a portal action returns is the answer the
 * browser gets. So each surface below is run against a database row in which
 * every column the surface has no business with carries a marker, and the
 * marker must not be anywhere in what goes out.
 *
 * The rows are filled from the schema's own column lists: a column added
 * tomorrow gets the marker without anyone touching this file, and a page that
 * starts spreading a row fails here.
 *
 * The fake database honours `select` the way Prisma does, so a narrow select
 * counts as protection and losing one is caught too.
 */
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@/generated/prisma/browser'

const MARK = 'INTERNAL:'

// The first test in each group loads a whole page and its print builders cold.
vi.setConfig({ testTimeout: 30000 })

type Row = Record<string, unknown>
type Args = { select?: Record<string, unknown>; include?: Record<string, unknown> } | undefined

const fake = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>[]> = {}
  /** Relation keys per row, so `include` knows what to leave out by default. */
  const relations = new WeakMap<object, string[]>()

  const isPlain = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)

  function project(row: unknown, args: unknown): unknown {
    if (Array.isArray(row)) return row.map((r) => project(r, args))
    if (!isPlain(row)) return row
    const shape = isPlain(args) ? args : {}
    const related = relations.get(row) ?? []
    if (isPlain(shape.select)) {
      const out: Record<string, unknown> = {}
      for (const [key, want] of Object.entries(shape.select)) {
        if (!want || key === '_count') continue
        out[key] = related.includes(key) ? project(row[key] ?? null, want) : row[key]
      }
      return out
    }
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      if (!related.includes(key)) out[key] = value
    }
    if (isPlain(shape.include)) {
      for (const [key, want] of Object.entries(shape.include)) {
        if (want && key !== '_count') out[key] = project(row[key] ?? null, want)
      }
    }
    return out
  }

  const db = new Proxy(
    {},
    {
      get: (_target, model: string) =>
        new Proxy(
          {},
          {
            get: (_t, method: string) => async (args: unknown) => {
              const rows = tables[model] ?? []
              if (method === 'findMany') return project(rows, args)
              if (method === 'count') return rows.length
              if (method.startsWith('find')) return rows[0] ? project(rows[0], args) : null
              return null
            },
          }
        ),
    }
  )
  return { tables, relations, db }
})

vi.mock('@/lib/db', () => ({ db: fake.db }))
vi.mock('next-intl/server', async () => {
  const { useTranslations } = await import('next-intl')
  return {
    getTranslations: async (arg: string | { namespace: string }) =>
      useTranslations(typeof arg === 'string' ? arg : arg.namespace),
    getLocale: async () => 'en',
  }
})
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'accept-language': 'en' }),
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found')
  },
}))
vi.mock('@/lib/customer-session', () => ({
  getCustomerSession: async () => ({ customerId: 'cust1', organizationId: 'org1' }),
}))
vi.mock('@/lib/features', () => ({ getFeatures: async () => ({ brandingRemoved: true }) }))
vi.mock('@/features/status-reports/Actions/submitFeedback', () => ({
  submitStatusReportFeedback: vi.fn(),
}))

/**
 * A row of a table: every column the schema has carries the marker, then the
 * ones this surface is allowed to use are given real values on top.
 */
function row(columns: Record<string, string>, shown: Row, related: Row = {}): Row {
  const filled: Row = {}
  for (const column of Object.values(columns)) filled[column] = `${MARK}${column}`
  const made = { ...filled, ...shown, ...related }
  fake.relations.set(made, Object.keys(related))
  return made
}

function table(model: string, ...rows: Row[]) {
  fake.tables[model] = rows
}

const DAY = new Date('2026-11-10T09:00:00Z')

const customer = () =>
  row(Prisma.CustomerScalarFieldEnum, {
    id: 'cust1',
    name: 'Kari Nordmann',
    email: 'kari@example.com',
    phone: null,
    address: 'Storgata 1',
    company: null,
    taxId: null,
    customerNumber: null,
    invoiceDesignId: null,
  })

const vehicle = () =>
  row(
    Prisma.VehicleScalarFieldEnum,
    {
      id: 'veh1',
      make: 'Volvo',
      model: 'V70',
      year: 2012,
      vin: null,
      licensePlate: 'AB12345',
      hsn: null,
      tsn: null,
      mileage: 120000,
      bodyType: null,
      // The customer's own car, as their portal describes it to them.
      color: 'Blue',
      fuelType: 'Diesel',
      transmission: 'Manual',
      soldReportedAt: null,
      isArchived: false,
      customerId: 'cust1',
      organizationId: 'org1',
    },
    { customer: customer() }
  )

function serviceRecord(over: Row = {}) {
  return row(
    Prisma.ServiceRecordScalarFieldEnum,
    {
      id: 'rec1',
      title: 'Brake service',
      type: 'repair',
      status: 'completed',
      cost: 300,
      mileage: 120000,
      serviceDate: DAY,
      startDateTime: null,
      endDateTime: null,
      promisedAt: null,
      shopName: null,
      techName: 'Ola Mekaniker',
      invoiceNotes: '<p>Thank you for the visit</p>',
      subtotal: 300,
      taxRate: 0,
      taxAmount: 0,
      taxInclusive: false,
      taxComponents: null,
      taxableSubtotal: null,
      totalAmount: 300,
      invoiceNumber: 'INV-1',
      invoiceDate: DAY,
      invoiceDueDate: null,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      manuallyPaid: false,
      manuallyPaidAt: null,
      warrantyStatus: null,
      warrantyMonths: null,
      warrantyMileage: null,
      warrantyExpiresAt: null,
      warrantyNotes: null,
      conditionMapOnInvoice: null,
      publicToken: 'tok',
      sharedAt: DAY,
      shareExpiresAt: null,
      shareNeverExpires: true,
      shareRenewedAt: null,
      sentAt: DAY,
      createdAt: DAY,
      updatedAt: DAY,
      designId: null,
      issuedAt: null,
      issuedData: null,
      editUnlockedAt: null,
      inspectionId: null,
      organizationId: 'org1',
      vehicleId: 'veh1',
      customerId: null,
      ...over,
    },
    {
      partItems: [
        row(Prisma.ServicePartScalarFieldEnum, {
          id: 'part1',
          partNumber: 'BP-1',
          name: 'Brake pads',
          quantity: 1,
          unit: null,
          category: null,
          unitPrice: 100,
          total: 100,
          taxable: true,
        }),
      ],
      laborItems: [
        row(Prisma.ServiceLaborScalarFieldEnum, {
          id: 'lab1',
          description: 'Fit brake pads',
          hours: 2,
          rate: 100,
          total: 200,
          pricingType: 'hourly',
          taxable: true,
        }),
      ],
      payments: [
        row(Prisma.PaymentScalarFieldEnum, { id: 'pay1', amount: 50, date: DAY, method: 'cash' }),
      ],
      attachments: [
        row(Prisma.ServiceAttachmentScalarFieldEnum, {
          id: 'att1',
          fileName: 'pads.jpg',
          fileUrl: '/api/protected/files/org1/services/pads.jpg',
          fileType: 'image/jpeg',
          fileSize: 1,
          category: 'image',
          description: 'Worn pads',
          includeInInvoice: true,
        }),
        // One the workshop kept off the invoice: nothing of it may go out.
        row(Prisma.ServiceAttachmentScalarFieldEnum, {
          id: `${MARK}hidden-attachment`,
          fileUrl: `/api/protected/files/org1/services/${MARK}hidden.jpg`,
          fileType: 'image/jpeg',
          fileSize: 1,
          category: 'image',
          includeInInvoice: false,
        }),
      ],
      technician: null,
      customer: null,
      vehicle: vehicle(),
      issuedDesignSnapshot: null,
      issuedLogoSnapshot: null,
      issuedSignatureSnapshot: null,
      createdBy: { id: `${MARK}createdBy.id`, name: 'Ola Mekaniker' },
    }
  )
}

function quote() {
  return row(
    Prisma.QuoteScalarFieldEnum,
    {
      id: 'quote1',
      quoteNumber: 'Q-1',
      title: 'New clutch',
      description: '<p>Includes fitting</p>',
      status: 'sent',
      validUntil: new Date('2026-12-10T09:00:00Z'),
      createdAt: DAY,
      sentAt: DAY,
      sharedAt: DAY,
      shareExpiresAt: null,
      shareNeverExpires: true,
      shareRenewedAt: null,
      subtotal: 300,
      taxRate: 0,
      taxAmount: 0,
      taxInclusive: false,
      taxComponents: null,
      taxableSubtotal: null,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      totalAmount: 300,
      warrantyStatus: null,
      warrantyMonths: null,
      warrantyMileage: null,
      warrantyNotes: null,
      publicToken: 'tok',
      organizationId: 'org1',
      customerId: 'cust1',
      vehicleId: 'veh1',
      inspectionId: null,
    },
    {
      partItems: [
        row(Prisma.QuotePartScalarFieldEnum, {
          id: 'qpart1',
          partNumber: 'CL-1',
          name: 'Clutch kit',
          quantity: 1,
          unit: null,
          category: null,
          unitPrice: 100,
          total: 100,
          excluded: false,
          taxable: true,
        }),
      ],
      laborItems: [
        row(Prisma.QuoteLaborScalarFieldEnum, {
          id: 'qlab1',
          description: 'Fit clutch',
          hours: 2,
          rate: 100,
          total: 200,
          pricingType: 'hourly',
          excluded: false,
          taxable: true,
        }),
      ],
      attachments: [
        row(Prisma.QuoteAttachmentScalarFieldEnum, {
          id: 'qatt1',
          fileName: 'clutch.jpg',
          fileUrl: '/api/protected/files/org1/quotes/clutch.jpg',
          fileType: 'image/jpeg',
          category: 'image',
          description: 'The kit',
        }),
      ],
      customer: customer(),
      vehicle: vehicle(),
    }
  )
}

function inspection() {
  return row(
    Prisma.InspectionScalarFieldEnum,
    {
      id: 'insp1',
      status: 'completed',
      mileage: 120000,
      notes: 'Ready for winter',
      publicToken: 'tok',
      sharedAt: DAY,
      shareExpiresAt: null,
      shareNeverExpires: true,
      shareRenewedAt: null,
      completedAt: DAY,
      createdAt: DAY,
      severityScale: null,
      country: null,
      vehicleCategory: null,
      nextTestDue: null,
      certificateNumber: null,
      inspectorName: 'Ola Mekaniker',
      testLocation: null,
      designSnapshotId: null,
      signatureSnapshotId: null,
      organizationId: 'org1',
      vehicleId: 'veh1',
    },
    {
      vehicle: vehicle(),
      template: { name: 'Winter check', severityScale: null, country: null },
      technician: { name: 'Ola Mekaniker' },
      items: [
        row(Prisma.InspectionItemScalarFieldEnum, {
          id: 'item1',
          name: 'Brake pads',
          section: 'Brakes',
          sectionCode: null,
          code: null,
          sortOrder: 0,
          condition: 'fail',
          notes: 'Worn to the metal',
          imageUrls: ['/api/protected/files/org1/inspections/pads.jpg'],
          inputType: 'condition',
          unit: null,
          minValue: null,
          maxValue: null,
          measuredValue: null,
          textValue: null,
          photoRequired: false,
        }),
      ],
      attachments: [
        row(Prisma.InspectionAttachmentScalarFieldEnum, {
          id: 'iatt1',
          fileName: 'overview.jpg',
          fileUrl: '/api/protected/files/org1/inspections/overview.jpg',
          fileType: 'image/jpeg',
          description: 'The car',
          includeInReport: true,
        }),
      ],
      quotes: [],
      designSnapshot: null,
      signatureSnapshot: null,
    }
  )
}

/** Everything a page handed its client component, as the browser would receive it. */
function sent(element: unknown): string {
  const { expiryNote: _chrome, ...props } = (element as ReactElement<Row>).props
  return JSON.stringify(props)
}

function propsOf<T = Row>(element: unknown): T {
  return (element as ReactElement<T>).props
}

const params = Promise.resolve({ orgId: 'org1', token: 'tok' })

beforeEach(() => {
  for (const key of Object.keys(fake.tables)) delete fake.tables[key]
  process.env.BETTER_AUTH_SECRET = 'test-secret-for-handoff-tokens'
  table('organization', { id: 'org1', name: 'Nordvik Motor', portalSlug: null })
})

describe('the shared invoice', () => {
  it('sends the page its amounts and attachments and nothing else of the job', async () => {
    table('serviceRecord', serviceRecord())
    const { default: Page } = await import('@/app/(public)/share/invoice/[orgId]/[token]/page')
    const element = await Page({ params })

    expect(sent(element)).not.toContain(MARK)
    const { record } = propsOf<{ record: Row }>(element)
    expect(record.invoiceNumber).toBe('INV-1')
    expect(record.attachments).toEqual([
      {
        id: 'att1',
        fileName: 'pads.jpg',
        fileUrl: '/api/public/files/tok/services/pads.jpg',
        fileType: 'image/jpeg',
        description: 'Worn pads',
      },
    ])
    expect(Object.keys(record).sort()).toEqual([
      'attachments',
      'cost',
      'discountAmount',
      'discountType',
      'discountValue',
      'id',
      'invoiceDate',
      'invoiceNumber',
      'laborItems',
      'manuallyPaid',
      'partItems',
      'payments',
      'serviceDate',
      'shopName',
      'startDateTime',
      'taxInclusive',
      'taxRate',
      'totalAmount',
      'vehicle',
    ])
  })

  it('sends no more of an issued invoice, whose stored copy stays on the server', async () => {
    table(
      'serviceRecord',
      serviceRecord({
        issuedAt: DAY,
        issuedData: {
          version: 1,
          workshop: { name: 'Nordvik Motor', address: '', phone: '', email: '' },
          invoiceSettings: {},
          customer: { name: 'Kari Nordmann' },
          vehicle: { make: 'Volvo', model: 'V70', year: 2012 },
          technicianName: 'Ola Mekaniker',
          findings: [],
          customFields: [],
          // Anything a snapshot holds beyond what the sheet prints.
          unprinted: `${MARK}issuedData`,
        },
      })
    )
    const { default: Page } = await import('@/app/(public)/share/invoice/[orgId]/[token]/page')
    const element = await Page({ params })

    expect(sent(element)).not.toContain(MARK)
    expect(propsOf<{ record: Row }>(element).record.invoiceNumber).toBe('INV-1')
  })
})

describe('the shared quote', () => {
  it('sends the page the quote’s number, state and dates and nothing else of it', async () => {
    table('quote', quote())
    const { default: Page } = await import('@/app/(public)/share/quote/[orgId]/[token]/page')
    const element = await Page({ params })

    expect(sent(element)).not.toContain(MARK)
    const props = propsOf<{ quote: Row; imageAttachments: Row[] }>(element)
    expect(Object.keys(props.quote).sort()).toEqual([
      'createdAt',
      'id',
      'quoteNumber',
      'status',
      'validUntil',
    ])
    expect(props.imageAttachments).toEqual([
      {
        id: 'qatt1',
        fileName: 'clutch.jpg',
        fileUrl: '/api/public/files/tok/quotes/clutch.jpg',
        fileType: 'image/jpeg',
        description: 'The kit',
      },
    ])
  })
})

describe('the shared inspection', () => {
  it('sends the page the checks and the car and nothing else of the inspection', async () => {
    table('inspection', inspection())
    const { default: Page } = await import('@/app/(public)/share/inspection/[orgId]/[token]/page')
    const element = await Page({ params })

    expect(sent(element)).not.toContain(MARK)
    const shown = propsOf<{ inspection: { notes: string; items: Row[] } }>(element).inspection
    expect(shown.notes).toBe('Ready for winter')
    expect(shown.items[0]).toMatchObject({
      name: 'Brake pads',
      notes: 'Worn to the metal',
      imageUrls: ['/api/public/files/tok/inspections/pads.jpg'],
    })
  })
})

describe('the shared status report', () => {
  it('sends the page the report and the car and nothing of the job behind it', async () => {
    table(
      'statusReport',
      row(
        Prisma.StatusReportScalarFieldEnum,
        {
          id: 'rep1',
          title: 'Halfway there',
          message: 'The pads are on',
          videoUrl: null,
          videoFileName: null,
          publicToken: 'tok',
          status: 'viewed',
          viewedAt: DAY,
          customerFeedback: null,
          feedbackAt: null,
          expiresAt: null,
          createdAt: DAY,
          organizationId: 'org1',
        },
        {
          serviceRecord: serviceRecord(),
          inspection: null,
          technician: { name: 'Ola Mekaniker' },
          organization: { name: 'Nordvik Motor' },
        }
      )
    )
    const { default: Page } = await import(
      '@/app/(public)/share/status-report/[orgId]/[token]/page'
    )
    const element = await Page({ params })

    expect(sent(element)).not.toContain(MARK)
    expect(propsOf<{ report: Row }>(element).report.title).toBe('Halfway there')
  })
})

describe('the customer portal', () => {
  it('answers with a quote’s sheet and nothing else of the quote', async () => {
    table('quote', quote())
    const { getPortalQuote } = await import('@/features/portal/Actions/getPortalQuote')
    const result = await getPortalQuote('quote1')

    expect(result.success).toBe(true)
    expect(result.data?.quoteNumber).toBe('Q-1')
    expect(JSON.stringify(result)).not.toContain(MARK)
  })

  it('answers with an invoice’s sheet and nothing else of the job', async () => {
    table('serviceRecord', serviceRecord())
    const { getPortalInvoiceSheet } = await import('@/features/portal/Actions/portalActions')
    const result = await getPortalInvoiceSheet('rec1')

    expect(result.success).toBe(true)
    expect(result.data?.invoiceNumber).toBe('INV-1')
    expect(JSON.stringify(result)).not.toContain(MARK)
  })

  it('answers with an inspection’s checks and nothing else of the inspection', async () => {
    table('inspection', inspection())
    const { getPortalInspection } = await import('@/features/portal/Actions/getPortalInspection')
    const result = await getPortalInspection('insp1')

    expect(result.success).toBe(true)
    expect(result.data?.notes).toBe('Ready for winter')
    expect(JSON.stringify(result)).not.toContain(MARK)
  })

  it('lists invoices, quotes, inspections and vehicles without the rest of their rows', async () => {
    table('serviceRecord', serviceRecord())
    table('quote', quote())
    table('inspection', inspection())
    table(
      'vehicle',
      (() => {
        const car = vehicle()
        fake.relations.set(car, ['customer', 'serviceRecords', 'inspections'])
        return Object.assign(car, {
          serviceRecords: [serviceRecord()],
          inspections: [inspection()],
        })
      })()
    )
    const portal = await import('@/features/portal/Actions/portalActions')
    const lists = await Promise.all([
      portal.getPortalInvoices(),
      portal.getPortalQuotes(),
      portal.getPortalInspections(),
      portal.getPortalVehicles(),
      portal.getPortalVehicleDetail('veh1'),
    ])

    for (const list of lists) expect(list.success).toBe(true)
    expect(JSON.stringify(lists)).not.toContain(MARK)
  })
})

describe('the page a phone opens from a code on the desk', () => {
  it('shows a job’s number and car and nothing of the job', async () => {
    table('serviceRecord', serviceRecord())
    const { createPhotoHandoffToken } = await import('@/lib/photo-handoff')
    const { token } = createPhotoHandoffToken({
      organizationId: 'org1',
      serviceRecordId: 'rec1',
      concernId: null,
      purpose: 'photos',
      userId: 'user1',
    })
    const { default: Page } = await import('@/app/(public)/p/[token]/page')
    const element = await Page({
      params: Promise.resolve({ token }),
      searchParams: Promise.resolve({}),
    })

    expect(sent(element)).not.toContain(MARK)
    expect(propsOf<{ job: Row }>(element).job).toEqual({
      number: 'INV-1',
      plate: 'AB12345',
      vehicle: 'Volvo V70',
    })
  })

  it('shows an inspection’s checks by name and nothing they say', async () => {
    table('inspection', inspection())
    const { createInspectionHandoffToken } = await import('@/lib/photo-handoff')
    const { token } = createInspectionHandoffToken({
      organizationId: 'org1',
      inspectionId: 'insp1',
      userId: 'user1',
    })
    const { default: Page } = await import('@/app/(public)/p/[token]/page')
    const outer = await Page({
      params: Promise.resolve({ token }),
      searchParams: Promise.resolve({}),
    })
    // The inspection's page is a server component of its own; run it.
    const { type, props } = outer as ReactElement<Row>
    const element = await (type as (p: Row) => Promise<ReactElement>)(props)

    const out = sent(element)
    expect(out).not.toContain(MARK)
    expect(out).toContain('Brake pads')
    expect(out).not.toContain('Worn to the metal')
  })
})
