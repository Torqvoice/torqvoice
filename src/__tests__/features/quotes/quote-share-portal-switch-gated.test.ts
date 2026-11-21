/**
 * @vitest-environment node
 *
 * The quote as the customer opens it: the public share page and the portal.
 * Both draw the sheet on the server from the default design, which shows the
 * Reference / PO, the fleet number and the meter readings unless it says not.
 * The workshop's switches decide: with them off, or on a plan without custom
 * fields, none of the three reaches the page.
 */
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  settings: [] as { key: string; value: string }[],
  features: { customFields: true, brandingRemoved: true },
  meterTypes: [] as { id: string; name: string; unit: string; required: boolean }[],
}))

const quoteRow = () => ({
  id: 'quote-1',
  quoteNumber: 'Q-1',
  title: 'Brakes',
  description: null,
  status: 'sent',
  validUntil: null,
  createdAt: new Date('2026-09-26T09:00:00Z'),
  sentAt: new Date('2026-09-26T09:00:00Z'),
  customerReference: 'PO-48213',
  subtotal: 100,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 100,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  userId: 'user-1',
  vehicleId: 'veh-1',
  customerId: 'cust-1',
  inspectionId: null,
  attachments: [],
  partItems: [],
  laborItems: [{ id: 'l1', description: 'Work', hours: 1, rate: 100, total: 100 }],
  customer: { name: 'Alex Carter' },
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
    appSetting: { findMany: vi.fn(async () => state.settings) },
    organization: { findUnique: vi.fn(async () => ({ name: 'Shop', portalSlug: null })) },
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
vi.mock('@/lib/torqvoice-branding', () => ({ getTorqvoiceLogoDataUri: async () => undefined }))
vi.mock('@/lib/app-url', () => ({ getAppBaseUrl: () => 'https://app.example' }))
vi.mock('@/features/custom-fields/Lib/getCustomFieldsForPrint', () => ({
  getCustomFieldsForPrint: async () => [],
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
vi.mock('@/features/inspections/Lib/linkedCertificate.server', () => ({
  linkedCertificateInspectionId: async () => null,
}))
vi.mock('@/features/invoice-designer/Lib/vehiclePhoto.server', () => ({
  vehiclePhotoForDocument: async () => undefined,
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
    organizationId: 'org-1',
    shared: { expiry: null },
  }),
}))
vi.mock('@/app/(public)/share/quote/[orgId]/[token]/quote-view', () => ({
  QuoteView: () => null,
}))
vi.mock('@/components/share-link-expired', () => ({
  ShareLinkClosed: () => null,
  closedShareLinkTitle: async () => '',
}))
vi.mock('@/components/share-link-open-until', () => ({ ShareLinkOpenUntil: () => null }))
vi.mock('@/features/portal/Lib/portalAuth', () => ({
  withPortalAuth: async (action: (s: unknown) => Promise<unknown>) => ({
    success: true,
    data: await action({ customerId: 'cust-1', organizationId: 'org-1' }),
  }),
}))

const { default: SharePage } = await import('@/app/(public)/share/quote/[orgId]/[token]/page')
const { getPortalQuote } = await import('@/features/portal/Actions/getPortalQuote')

const REFERENCE_ON = { key: 'documents.customerReferenceEnabled', value: 'true' }
const FLEET_ON = { key: 'vehicle.fleetNumberEnabled', value: 'true' }
const ENGINE_HOURS = { id: 'm1', name: 'Engine hours', unit: 'hrs', required: false }

/** What the share page hands the browser, as text. */
async function sharePage(): Promise<string> {
  const element = (await SharePage({
    params: Promise.resolve({ orgId: 'org-1', token: 'tok' }),
  })) as ReactElement<Record<string, unknown>>
  return JSON.stringify(element.props)
}

/** What the portal hands the browser, as text. */
async function portal(): Promise<string> {
  const result = (await getPortalQuote('quote-1')) as { data: unknown }
  return JSON.stringify(result.data)
}

beforeEach(() => {
  state.settings = [REFERENCE_ON, FLEET_ON]
  state.features = { customFields: true, brandingRemoved: true }
  state.meterTypes = [ENGINE_HOURS]
})

describe('the quote the customer opens', () => {
  it('shows the reference, the fleet number and the reading for a workshop with them on', async () => {
    for (const page of [await sharePage(), await portal()]) {
      expect(page).toContain('PO-48213')
      expect(page).toContain('T-208')
      expect(page).toContain('Engine hours')
    }
  })

  it('sends none of them with the switches off and no meters', async () => {
    state.settings = []
    state.meterTypes = []
    for (const page of [await sharePage(), await portal()]) {
      for (const text of ['PO-48213', 'T-208', 'Fleet no.', 'Engine hours']) {
        expect(page).not.toContain(text)
      }
    }
  })

  it('sends none of them on a plan without custom fields, whatever the switches say', async () => {
    state.features = { customFields: false, brandingRemoved: true }
    for (const page of [await sharePage(), await portal()]) {
      for (const text of ['PO-48213', 'T-208', 'Engine hours']) expect(page).not.toContain(text)
    }
  })
})
