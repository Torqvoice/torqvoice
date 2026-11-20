/**
 * The fleet / unit number on a designed inspection certificate: a line of the
 * vehicle block a design switches on, the way the invoice offers it.
 *
 * Off in the default certificate, in every starting point and in every design
 * saved before it existed, so a certificate prints what it printed until a
 * workshop asks for it. Once a design has it on, it prints only for a workshop
 * that has the fleet number switched on, on a plan with custom fields, and for
 * a vehicle that has one. The design is frozen onto a completed inspection;
 * the vehicle's values are read when it prints, the plate's and the fleet
 * number's alike.
 */
import type { ReactElement } from 'react'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FleetNumberProvider } from '@/components/fleet-number-context'
import { DesignerInspector } from '@/features/invoice-designer/Components/DesignerInspector'
import {
  type CertificatePrintInput,
  buildCertificatePrintSpec,
} from '@/features/inspections/Pdf/buildCertificatePrint'
import { defaultCertificateDesign } from '@/features/inspections/Lib/defaultCertificateDesign'
import {
  DESIGNER_LAYOUT_VERSION,
  type InvoiceLayoutConfig,
  getDefaultLayout,
  mergeWithDefaults,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { buildLayoutFromPreset, certificatePresets } from '@/features/settings/Schema/layoutPresets'

vi.setConfig({ testTimeout: 30000 })

const LINE = 'Fleet no.: T-208'

const state = vi.hoisted(() => ({
  settings: [] as { key: string; value: string }[],
  features: { customFields: true, brandingRemoved: true },
  fleetNumber: 'T-208' as string | null,
  design: null as { layout: unknown; template: unknown } | null,
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
  inspectorName: 'Ola Mekaniker',
  testLocation: null,
  vehicleId: 'veh1',
  designSnapshotId: 'snap1',
  signatureSnapshotId: null,
  markTypesSnapshot: null,
  vehicle: {
    id: 'veh1',
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
vi.mock('@/lib/features', () => ({
  getFeatures: vi.fn(async () => state.features),
  isCloudMode: () => false,
}))
vi.mock('@/lib/torqvoice-branding', () => ({ getTorqvoiceLogoDataUri: async () => undefined }))
vi.mock('@/lib/app-url', () => ({ getAppBaseUrl: () => 'https://app.example' }))
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
// The design frozen on the inspection; the rest of the module is the real one.
vi.mock('@/features/inspections/Pdf/certificateDesign', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, certificateDesignSource: async () => state.design }
})
vi.mock('@/features/signatures/Lib/memberSignature.server', () => ({
  certificateSignatureDataUri: async () => undefined,
}))
vi.mock('@/features/vehicles/Components/invoice-pdf/fonts', () => ({
  pdfFontsReady: async () => undefined,
}))
vi.mock('@/features/inspections/Lib/certificateDocuments', () => ({
  certificateDocuments: () => [],
  appendCertificateDocuments: async (buffer: unknown) => buffer,
}))
// The PDF's element, kept to be read as the sheet it describes.
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

/** A certificate design with every vehicle line it had, and the fleet number set as given. */
function withFleetNumber(layout: InvoiceLayoutConfig, visible: boolean): InvoiceLayoutConfig {
  return {
    ...layout,
    sections: layout.sections.map((s) =>
      s.id === 'vehicle'
        ? {
            ...s,
            visible: true,
            fields: (s.fields ?? []).map((f) => (f.id === 'fleet_number' ? { ...f, visible } : f)),
          }
        : s
    ),
  }
}

const designed = (fleetOn: boolean) => {
  const { layout, template } = defaultCertificateDesign()
  return { layout: withFleetNumber(layout, fleetOn), template }
}

const printData = (fleetNumber: string | null): CertificatePrintInput['data'] =>
  ({
    ...inspectionRow(),
    vehicle: { ...inspectionRow().vehicle, fleetNumber },
  }) as unknown as CertificatePrintInput['data']

const certificate = (layoutConfig: InvoiceLayoutConfig, fleetNumber: string | null = 'T-208') =>
  JSON.stringify(
    buildCertificatePrintSpec({
      data: printData(fleetNumber),
      labels: { fleetNumber: 'Fleet no.', plate: 'Plate: {plate}' },
      layoutConfig,
    })
  )

beforeEach(() => {
  state.settings = [FLEET_SWITCH]
  state.features = { customFields: true, brandingRemoved: true }
  state.fleetNumber = 'T-208'
  state.design = designed(true)
  state.rendered = []
})

describe('the certificate design', () => {
  it('prints the same certificate with a fleet number as without, from every starting point', () => {
    const layouts = [
      getDefaultLayout('certificate'),
      defaultCertificateDesign().layout,
      ...certificatePresets.map(buildLayoutFromPreset),
    ]
    for (const layout of layouts) {
      const vehicle = layout.sections.find((s) => s.id === 'vehicle')
      const field = vehicle?.fields?.find((f) => f.id === 'fleet_number')
      if (field) expect(field.visible).toBe(false)
      expect(certificate(layout)).toBe(certificate(layout, null))
      expect(certificate(layout)).not.toContain('T-208')
    }
  })

  it('keeps it off in a certificate design saved before the field existed', () => {
    for (const preset of certificatePresets) {
      const layout = buildLayoutFromPreset(preset)
      const saved = {
        ...layout,
        version: DESIGNER_LAYOUT_VERSION,
        sections: layout.sections.map((s) =>
          s.id === 'vehicle'
            ? {
                ...s,
                visible: true,
                fields: s.fields
                  ?.filter((f) => f.id !== 'fleet_number')
                  .map((f) => ({ ...f, visible: true })),
              }
            : s
        ),
      }
      const merged = mergeWithDefaults({ ...saved, documentType: 'certificate' })
      const vehicle = merged.sections.find((s) => s.id === 'vehicle')
      expect(vehicle?.fields?.find((f) => f.id === 'fleet_number')?.visible).toBe(false)
      expect(certificate(merged)).toBe(certificate(merged, null))
    }
  })

  it('prints the fleet number once the design switches the field on', () => {
    expect(certificate(designed(true).layout)).toContain(LINE)
  })

  it('prints no caption for a vehicle without a number, with the field on', () => {
    const spec = certificate(designed(true).layout, null)
    expect(spec).not.toContain('Fleet no.')
  })
})

describe('the designer', () => {
  const inspector = (enabled: boolean) => {
    const layout = mergeWithDefaults({ ...defaultCertificateDesign().layout })
    const noop = () => undefined
    return render(
      <FleetNumberProvider enabled={enabled}>
        <DesignerInspector
          layout={layout}
          template={defaultCertificateDesign().template as never}
          customFields={[]}
          selected="vehicle"
          onSelect={noop}
          onSection={noop}
          onPlaceInFlow={noop}
          onSectionStyle={noop}
          onDocument={noop}
          onTemplate={noop}
          logoUrl=""
          ownLogo={false}
          onLogo={noop}
          sloganSet={false}
          paymentTermsSet={false}
          documentTitleDefault=""
          equipmentTitleDefault=""
          orgNumberLabel=""
          orgNumberLabelDefault=""
          onOrgNumberLabel={noop}
          signatureSet={false}
        />
      </FleetNumberProvider>
    )
  }

  it('offers the fleet number on the certificate’s vehicle block, off, to a workshop that records it', () => {
    inspector(true)
    const row = screen.getByText('Fleet / unit number').closest('div')
    expect(row).not.toBeNull()
    const toggle = within(row as HTMLElement).queryByRole('switch')
    if (toggle) expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('does not offer it to a workshop that has the field off', () => {
    inspector(false)
    expect(screen.queryByText('Fleet / unit number')).not.toBeInTheDocument()
  })
})

/** The sheet the certificate PDF was built from, as text. */
function pdfSheet(): string {
  const element = state.rendered.at(-1) as ReactElement<CertificatePrintInput>
  return JSON.stringify(buildCertificatePrintSpec(element.props))
}

async function workshopPdf(): Promise<string> {
  const { buildCertificatePdfBuffer } = await import(
    '@/features/inspections/Pdf/buildCertificatePdfBuffer'
  )
  const result = await buildCertificatePdfBuffer({
    inspectionId: 'insp1',
    organizationId: 'org1',
    locale: 'en',
    audience: 'workshop',
  })
  expect(result).not.toBeNull()
  return pdfSheet()
}

async function customerPdf(): Promise<string> {
  const { buildCustomerCertificatePdf } = await import(
    '@/features/inspections/Pdf/customerCertificatePdf'
  )
  expect(
    await buildCustomerCertificatePdf({
      inspectionId: 'insp1',
      organizationId: 'org1',
      locale: 'en',
    })
  ).not.toBeNull()
  return pdfSheet()
}

type PageProps = { inspection: { vehicle: Record<string, unknown> }; spec?: unknown }

async function sharePage(): Promise<PageProps> {
  const { default: Page } = await import('@/app/(public)/share/inspection/[orgId]/[token]/page')
  const element = (await Page({
    params: Promise.resolve({ orgId: 'org1', token: 'tok' }),
  })) as ReactElement<PageProps>
  return element.props
}

describe('the certificate as it prints', () => {
  it('prints the fleet number in the PDFs and on the share page when the design has it on', async () => {
    expect(await workshopPdf()).toContain(LINE)
    expect(await customerPdf()).toContain(LINE)
    const page = await sharePage()
    expect(JSON.stringify(page.spec)).toContain(LINE)
    // The page draws the certificate, not its own report: its data has no key.
    expect(page.inspection.vehicle).not.toHaveProperty('fleetNumber')
  })

  it('prints a long fleet number whole', async () => {
    state.fleetNumber = 'NORDMANNTRANSPORTNORTHDEPOTUNIT0042WXYZ1'
    expect(await workshopPdf()).toContain('Fleet no.: NORDMANNTRANSPORTNORTHDEPOTUNIT0042WXYZ1')
  })

  it('prints nothing and sends nothing while the design has the field off', async () => {
    state.design = designed(false)
    expect(await workshopPdf()).not.toContain('T-208')
    expect(await customerPdf()).not.toContain('T-208')
    const page = await sharePage()
    expect(JSON.stringify(page)).not.toContain('T-208')
    expect(page.inspection.vehicle).not.toHaveProperty('fleetNumber')
  })

  const gatedAway = async () => {
    expect(await workshopPdf()).not.toContain('Fleet no.')
    expect(await customerPdf()).not.toContain('Fleet no.')
    const page = await sharePage()
    expect(JSON.stringify(page.spec)).not.toContain('Fleet no.')
    expect(JSON.stringify(page)).not.toContain('T-208')
    expect(page.inspection.vehicle).not.toHaveProperty('fleetNumber')
  }

  it('prints nothing while the workshop switch is off, though the design has the field on', async () => {
    state.settings = []
    await gatedAway()
  })

  it('prints nothing after the plan loses custom fields, though the design has the field on', async () => {
    state.features = { customFields: false, brandingRemoved: true }
    await gatedAway()
  })

  it('prints nothing for a vehicle without a number, though the design has the field on', async () => {
    state.fleetNumber = null
    await gatedAway()
  })
})
