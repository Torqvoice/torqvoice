/**
 * @vitest-environment node
 *
 * The quote PDF (download, public link and the emailed copy) on the default
 * design, which shows the Reference / PO, the fleet number and the meter
 * readings unless it says not. The workshop's switches decide: with them
 * off, or on a plan without custom fields, the quote carries none of them
 * and prints the sheet it always printed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  settings: [] as { key: string; value: string }[],
  features: { customFields: true, brandingRemoved: true },
  meterTypes: [] as { id: string; name: string; unit: string; required: boolean }[],
  rendered: undefined as Record<string, unknown> | undefined,
}))

const quoteRow = () => ({
  id: 'quote-0000abcd',
  quoteNumber: 'Q-1',
  status: 'sent',
  createdAt: new Date('2026-09-26T09:00:00Z'),
  validUntil: null,
  notes: null,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  subtotal: 100,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 100,
  customerReference: 'PO-48213',
  vehicleId: 'veh-1',
  customerId: 'cust-1',
  userId: 'user-1',
  attachments: [],
  partItems: [],
  laborItems: [{ description: 'Work', hours: 1, rate: 100, total: 100 }],
  customer: { name: 'Alex Carter', email: null, phone: null, address: null, company: null },
  vehicle: {
    make: 'Volvo',
    model: 'FH',
    year: 2019,
    vin: null,
    licensePlate: 'AB 12345',
    hsn: null,
    tsn: null,
    fleetNumber: 'T-208',
  },
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    quote: { findFirst: vi.fn(async () => quoteRow()) },
    appSetting: {
      findMany: vi.fn(async () => state.settings),
      findUnique: vi.fn(async () => null),
    },
    organization: { findUnique: vi.fn(async () => ({ name: 'Shop' })) },
    meterType: { findMany: vi.fn(async () => state.meterTypes) },
    vehicleMeter: {
      findMany: vi.fn(async () => [
        {
          id: 'vm1',
          meterTypeId: 'm1',
          readings: [
            {
              id: 'r1',
              value: { toNumber: () => 4256.7 },
              readAt: new Date('2026-09-20T09:00:00Z'),
              createdAt: new Date('2026-09-20T09:00:00Z'),
              replacedFrom: null,
              wrongAt: null,
              source: 'web',
              serviceRecordId: null,
              serviceRecord: null,
            },
          ],
        },
      ]),
    },
  },
}))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn(async () => state.features) }))
vi.mock('@/lib/torqvoice-branding', () => ({ getTorqvoiceLogoDataUri: vi.fn(async () => '') }))
vi.mock('@/features/custom-fields/Lib/getCustomFieldsForPrint', () => ({
  getCustomFieldsForPrint: vi.fn(async () => []),
  getRecordCustomFieldsForPrint: async () => [],
}))
vi.mock('@/features/equipment/Lib/equipmentPrint.server', () => ({
  printableEquipment: async () => ({ job: [], vehicle: [] }),
}))
vi.mock('@/features/signatures/Lib/memberSignature.server', () => ({
  documentSigner: async () => ({ name: '' }),
}))
vi.mock('@/features/condition-map/Lib/loadMarks.server', () => ({
  quoteConditionMap: async () => undefined,
}))
vi.mock('@/features/inspections/Lib/linkedInspectionResults.server', () => ({
  inspectionResultsFor: async () => null,
}))
vi.mock('@/features/invoice-designer/Lib/vehiclePhoto.server', () => ({
  vehiclePhotoForDocument: async () => undefined,
}))
vi.mock('@/features/vehicles/Components/invoice-pdf/fonts', () => ({
  pdfFontsReady: async () => undefined,
}))
vi.mock('@/features/quotes/Components/QuotePDF', () => ({ QuotePDF: () => null }))
vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn(async (element: { props: Record<string, unknown> }) => {
    state.rendered = element.props
    return new Uint8Array()
  }),
}))

const { buildQuotePdfBuffer } = await import('@/features/quotes/Pdf/buildQuotePdfBuffer')
const { buildQuotePrintSpec } = await import('@/features/invoice-designer/Pdf/buildQuotePrint')

const REFERENCE_ON = { key: 'documents.customerReferenceEnabled', value: 'true' }
const FLEET_ON = { key: 'vehicle.fleetNumberEnabled', value: 'true' }
const ENGINE_HOURS = { id: 'm1', name: 'Engine hours', unit: 'hrs', required: false }

/** The quote PDF as text: what it carries, and the sheet it draws from that. */
async function quotePdf() {
  state.rendered = undefined
  await buildQuotePdfBuffer('quote-0000abcd', 'org-1', 'en')
  const props = state.rendered as unknown as Record<string, unknown> & {
    data: { customerReference?: string | null; vehicle: Record<string, unknown> }
  }
  const sheet = JSON.stringify(buildQuotePrintSpec({ ...props, otherAttachmentNames: [] } as never))
  return { data: props.data, sheet }
}

beforeEach(() => {
  state.settings = [REFERENCE_ON, FLEET_ON]
  state.features = { customFields: true, brandingRemoved: true }
  state.meterTypes = [ENGINE_HOURS]
})

describe('the quote PDF on the default design', () => {
  it('prints the reference, the fleet number and the reading for a workshop with them on', async () => {
    const { sheet } = await quotePdf()
    expect(sheet).toContain('PO-48213')
    expect(sheet).toContain('T-208')
    expect(sheet).toContain('Engine hours')
  })

  it('carries and prints none of them with the switches off and no meters', async () => {
    state.settings = []
    state.meterTypes = []
    const { data, sheet } = await quotePdf()
    expect(data.customerReference ?? null).toBeNull()
    expect(data.vehicle.fleetNumber ?? null).toBeNull()
    expect(data.vehicle.meterReadings).toEqual([])
    for (const text of ['PO-48213', 'Your reference', 'T-208', 'Fleet', 'Engine hours']) {
      expect(sheet).not.toContain(text)
    }
  })

  it('carries none of them on a plan without custom fields, whatever the switches say', async () => {
    state.features = { customFields: false, brandingRemoved: true }
    const { data, sheet } = await quotePdf()
    expect(data.customerReference ?? null).toBeNull()
    expect(data.vehicle.fleetNumber ?? null).toBeNull()
    expect(data.vehicle.meterReadings).toEqual([])
    expect(sheet).not.toContain('PO-48213')
    expect(sheet).not.toContain('T-208')
    expect(sheet).not.toContain('Engine hours')
  })
})
