/**
 * @vitest-environment node
 *
 * The quote PDF (download, public link and email copy) resolves its labels the
 * same way the invoice does, so a marine workshop's quote says HIN, registration
 * and vessel, and an automotive workshop's quote is unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const settingsRows: { key: string; value: string }[] = []
const rendered: { props?: Record<string, unknown> } = {}

vi.mock('@/lib/db', () => ({
  db: {
    quote: {
      findFirst: vi.fn(async () => ({
        id: 'quote-0000abcd',
        quoteNumber: 'Q-1',
        attachments: [],
        partItems: [],
        laborItems: [],
      })),
    },
    appSetting: {
      findMany: vi.fn(async () => settingsRows),
      findUnique: vi.fn(async () => null),
    },
    organization: { findUnique: vi.fn(async () => ({ name: 'Harbour Marine' })) },
  },
}))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn(async () => ({ brandingRemoved: true })) }))
vi.mock('@/lib/torqvoice-branding', () => ({ getTorqvoiceLogoDataUri: vi.fn(async () => '') }))
vi.mock('@/features/custom-fields/Lib/getCustomFieldsForPrint', () => ({
  getCustomFieldsForPrint: vi.fn(async () => []),
}))
vi.mock('@/features/vehicles/Components/invoice-pdf/fonts', () => ({}))
vi.mock('@/features/quotes/Components/QuotePDF', () => ({ QuotePDF: () => null }))
vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn(async (element: { props: Record<string, unknown> }) => {
    rendered.props = element.props
    return new Uint8Array()
  }),
}))

const { buildQuotePdfBuffer } = await import('@/features/quotes/Pdf/buildQuotePdfBuffer')

async function labelsFor(serviceType?: string) {
  settingsRows.length = 0
  if (serviceType) settingsRows.push({ key: 'workshop.serviceType', value: serviceType })
  await buildQuotePdfBuffer('quote-0000abcd', 'org-1', 'en')
  return rendered.props?.labels as Record<string, string>
}

describe('quote PDF labels', () => {
  beforeEach(() => {
    rendered.props = undefined
  })

  it('prints HIN, registration and vessel for a marine workshop', async () => {
    const labels = await labelsFor('marine')
    expect(labels.vehicle).toBe('Vessel')
    expect(labels.vin).toBe('HIN: {vin}')
    expect(labels.plate).toBe('Registration: {plate}')
    expect(labels.mileage).toBe('Engine Hours: {mileage}')
    expect(labels.km).toBe('hrs')
    expect(labels.title).toBe('QUOTE')
  })

  it('prints VIN, plate and vehicle for an automotive workshop', async () => {
    for (const serviceType of [undefined, 'automotive']) {
      const labels = await labelsFor(serviceType)
      expect(labels.vehicle).toBe('Vehicle')
      expect(labels.vin).toBe('VIN: {vin}')
      expect(labels.plate).toBe('Plate: {plate}')
      expect(labels.mileage).toBe('Mileage: {mileage}')
      expect(labels.km).toBe('km')
      expect(labels.title).toBe('QUOTE')
    }
  })
})
