/**
 * The inspection report names the vehicle by the fleet / unit number its owner
 * knows it by, on one line beside the licence plate: in the PDF the workshop
 * downloads, in the PDF the customer gets, and on the page the customer opens
 * by link.
 *
 * Only for a workshop that has the field on, on a plan that has custom fields,
 * and only for a vehicle that has a number. Otherwise every one of them is
 * what it was before: no caption, no empty line, and no key in what the share
 * page sends to the browser. A workshop's designed certificate does not print
 * it either.
 */
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 30000 })

const state = vi.hoisted(() => ({
  settings: [] as { key: string; value: string }[],
  features: { customFields: true, brandingRemoved: true },
  fleetNumber: 'T-208' as string | null,
  designed: false,
  rendered: [] as unknown[],
}))

const inspectionRow = () => ({
  id: 'insp1',
  status: 'completed',
  mileage: 120000,
  notes: null,
  publicToken: 'tok',
  completedAt: new Date('2026-11-10T09:00:00Z'),
  createdAt: new Date('2026-11-10T09:00:00Z'),
  severityScale: 'basic',
  country: null,
  vehicleCategory: null,
  nextTestDue: null,
  certificateNumber: null,
  inspectorName: null,
  testLocation: null,
  inputType: null,
  vehicleId: 'veh1',
  markTypesSnapshot: null,
  vehicle: {
    bodyType: null,
    make: 'Volvo',
    model: 'FH16',
    year: 2021,
    vin: 'YV2RT40A0MA123456',
    hsn: null,
    tsn: null,
    licensePlate: 'EL12345',
    fleetNumber: state.fleetNumber,
    mileage: 120000,
    customer: { name: 'Nordmann Transport AS' },
  },
  template: { name: 'Winter check', severityScale: 'basic', country: null },
  technician: { name: 'Ola Mekaniker' },
  items: [
    {
      id: 'item1',
      name: 'Brake pads',
      section: 'Brakes',
      sectionCode: null,
      code: null,
      sortOrder: 0,
      condition: 'pass',
      notes: null,
      imageUrls: [],
      inputType: 'condition',
      unit: null,
      minValue: null,
      maxValue: null,
      measuredValue: null,
      textValue: null,
    },
  ],
  attachments: [],
  quotes: [],
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    inspection: { findFirst: vi.fn(async () => inspectionRow()) },
    appSetting: {
      findMany: vi.fn(async () => state.settings),
      findUnique: vi.fn(async () => null),
    },
    organization: {
      findUnique: vi.fn(async () => ({ name: 'Nordvik Motor', portalSlug: null })),
    },
    inspectionQuoteRequest: { findFirst: vi.fn(async () => null) },
  },
}))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn(async () => state.features) }))
vi.mock('@/lib/torqvoice-branding', () => ({ getTorqvoiceLogoDataUri: async () => undefined }))
vi.mock('@/lib/app-url', () => ({ getAppBaseUrl: () => 'https://app.example' }))
vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: async () => ({ organizationId: 'org1', userId: 'user1' }),
}))
vi.mock('@/i18n/locale-from-request', () => ({
  resolveDocumentLocale: async () => 'en',
  resolveCustomerLocale: async () => 'en',
}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'accept-language': 'en' }),
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found')
  },
}))
vi.mock('@/lib/share-link.server', () => ({
  lookUpShareLink: async () => ({
    status: 'open',
    organizationId: 'org1',
    shared: { expiry: null },
  }),
}))
vi.mock('@/features/inspections/Pdf/certificateDesign', () => ({
  certificateDesignSource: async () => (state.designed ? { kind: 'designed' } : null),
  loadCertificateLabels: async () => ({}),
}))
vi.mock('@/features/invoice-designer/Lib/designSource', () => ({
  templateConfigFromSource: () => ({ layoutConfig: {} }),
}))
const buildCertificatePrintSpec = vi.fn((_input: unknown) => ({ pages: [] }))
vi.mock('@/features/inspections/Pdf/buildCertificatePrint', () => ({
  buildCertificatePrintSpec: (input: unknown) => buildCertificatePrintSpec(input),
}))
vi.mock('@/features/signatures/Lib/memberSignature.server', () => ({
  certificateSignatureDataUri: async () => undefined,
}))
// The workshop's designed certificate is a different document; this file is
// about the built-in report, which is what prints when there is no design.
vi.mock('@/features/inspections/Pdf/buildCertificatePdfBuffer', () => ({
  buildCertificatePdfBuffer: async () => null,
}))
vi.mock('@/features/inspections/Lib/linkedCertificate.server', () => ({
  linkedCertificateInspectionId: async () => null,
}))
vi.mock('@/features/vehicles/Components/invoice-pdf/fonts', () => ({
  pdfFontsReady: async () => undefined,
}))
vi.mock('@/features/inspections/Lib/certificateDocuments', () => ({
  certificateDocuments: () => [],
  appendCertificateDocuments: async (buffer: unknown) => buffer,
}))
// The PDF's elements, kept to be read as text instead of drawn as a PDF.
vi.mock('@react-pdf/renderer', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    renderToBuffer: async (element: unknown) => {
      state.rendered.push(element)
      return Buffer.from('%PDF')
    },
  }
})
vi.mock('@/features/inspections/Components/QuoteRequestDialog', () => ({
  QuoteRequestDialog: () => null,
}))

const FLEET_SWITCH = { key: 'vehicle.fleetNumberEnabled', value: 'true' }
const LONG = 'NORDMANN-TRANSPORT-NORTH-DEPOT-UNIT-0042'

/** What a PDF says, as text: the elements react-pdf would have drawn. */
function pdfText(): string {
  const element = state.rendered.at(-1) as ReactElement
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    return renderToStaticMarkup(element).replace(/<[^>]+>/g, '\n')
  } finally {
    errors.mockRestore()
  }
}

async function workshopPdf(): Promise<string> {
  const { GET } = await import('@/app/api/protected/inspections/[id]/pdf/route')
  const response = await GET(new Request('http://localhost/api'), {
    params: Promise.resolve({ id: 'insp1' }),
  })
  expect(response.status).toBe(200)
  return pdfText()
}

async function customerPdf(): Promise<string> {
  const { buildCustomerCertificatePdf } = await import(
    '@/features/inspections/Pdf/customerCertificatePdf'
  )
  const result = await buildCustomerCertificatePdf({
    inspectionId: 'insp1',
    organizationId: 'org1',
    locale: 'en',
  })
  expect(result).not.toBeNull()
  return pdfText()
}

type ViewProps = { inspection: { vehicle: Record<string, unknown> } }

async function sharePage(): Promise<ReactElement<ViewProps>> {
  const { default: Page } = await import('@/app/(public)/share/inspection/[orgId]/[token]/page')
  return (await Page({
    params: Promise.resolve({ orgId: 'org1', token: 'tok' }),
  })) as ReactElement<ViewProps>
}

async function renderSharePage() {
  const element = await sharePage()
  const { InspectionView } = await import(
    '@/app/(public)/share/inspection/[orgId]/[token]/inspection-view'
  )
  const props = element.props as unknown as React.ComponentProps<typeof InspectionView>
  return render(<InspectionView {...props} expiryNote={null} />)
}

beforeEach(() => {
  state.settings = [FLEET_SWITCH]
  state.features = { customFields: true, brandingRemoved: true }
  state.fleetNumber = 'T-208'
  state.designed = false
  state.rendered = []
  buildCertificatePrintSpec.mockClear()
})

describe('the inspection report PDF', () => {
  it('prints the fleet number beside the plate for a workshop that has it on', async () => {
    for (const text of [await workshopPdf(), await customerPdf()]) {
      expect(text).toContain('Plate: EL12345')
      expect(text).toContain('Fleet no.: T-208')
    }
  })

  it('prints a long fleet number whole', async () => {
    state.fleetNumber = LONG
    expect(await workshopPdf()).toContain(`Fleet no.: ${LONG}`)
  })

  it('prints no fleet line while the switch is off', async () => {
    state.settings = []
    for (const text of [await workshopPdf(), await customerPdf()]) {
      expect(text).toContain('Plate: EL12345')
      expect(text).not.toContain('Fleet no.')
      expect(text).not.toContain('T-208')
    }
  })

  it('prints no fleet line for a vehicle without a number', async () => {
    state.fleetNumber = null
    for (const text of [await workshopPdf(), await customerPdf()]) {
      expect(text).not.toContain('Fleet no.')
    }
  })

  it('prints no fleet line after the plan loses custom fields, whatever the switch says', async () => {
    state.features = { customFields: false, brandingRemoved: true }
    for (const text of [await workshopPdf(), await customerPdf()]) {
      expect(text).not.toContain('Fleet no.')
      expect(text).not.toContain('T-208')
    }
  })

  it('prints the same report with the switch off as for a vehicle without a number', async () => {
    state.settings = []
    const off = await workshopPdf()
    state.settings = [FLEET_SWITCH]
    state.fleetNumber = null
    expect(await workshopPdf()).toBe(off)
  })
})

describe('the shared inspection page', () => {
  it('shows the fleet number under the plate for a workshop that has it on', async () => {
    await renderSharePage()
    expect(screen.getByText('EL12345')).toBeInTheDocument()
    const caption = screen.getByText('Fleet no.')
    expect(caption.tagName).toBe('DT')
    expect(caption.nextElementSibling?.textContent).toBe('T-208')
  })

  it('lets a long fleet number wrap rather than push the page wider', async () => {
    state.fleetNumber = LONG
    await renderSharePage()
    expect(screen.getByText(LONG).className).toContain('wrap-anywhere')
  })

  it('shows nothing and sends no fleet number while the switch is off', async () => {
    state.settings = []
    const element = await sharePage()
    expect(element.props.inspection.vehicle).not.toHaveProperty('fleetNumber')
    expect(JSON.stringify(element.props)).not.toContain('T-208')
    await renderSharePage()
    expect(screen.queryByText('Fleet no.')).not.toBeInTheDocument()
  })

  it('shows nothing and sends no key for a vehicle without a number', async () => {
    state.fleetNumber = null
    const element = await sharePage()
    expect(element.props.inspection.vehicle).not.toHaveProperty('fleetNumber')
    await renderSharePage()
    expect(screen.queryByText('Fleet no.')).not.toBeInTheDocument()
  })

  it('shows nothing and sends nothing after the plan loses custom fields', async () => {
    state.features = { customFields: false, brandingRemoved: true }
    const element = await sharePage()
    expect(element.props.inspection.vehicle).not.toHaveProperty('fleetNumber')
    expect(JSON.stringify(element.props)).not.toContain('T-208')
    await renderSharePage()
    expect(screen.queryByText('Fleet no.')).not.toBeInTheDocument()
  })

  it('leaves a designed certificate as it was, and sends no fleet number beside it', async () => {
    state.designed = true
    const element = await sharePage()
    expect(element.props.inspection.vehicle).not.toHaveProperty('fleetNumber')
    expect(JSON.stringify(element.props)).not.toContain('T-208')
    const input = buildCertificatePrintSpec.mock.calls[0]?.[0] as {
      data: { vehicle: Record<string, unknown> }
    }
    expect(input.data.vehicle).not.toHaveProperty('fleetNumber')
  })
})
