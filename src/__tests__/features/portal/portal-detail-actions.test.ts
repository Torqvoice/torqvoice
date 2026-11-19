import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A signed-in customer opens one quote or one inspection in the portal. Only
 * their own, in this workshop, and never a quote that is still the workshop's
 * draft: anything else comes back as nothing, which the page turns into a 404.
 */

type Quote = {
  id: string
  title: string
  status: string
  customerId: string
  organizationId: string
  sentAt?: Date | null
  sharedAt?: Date | null
}

type Inspection = {
  id: string
  organizationId: string
  vehicle: { customerId: string; organizationId: string }
}

const quotes: Quote[] = []
const inspections: Inspection[] = []

/**
 * The parts of a Prisma `where` these actions use (equals, `not`, `in`, `OR`,
 * one nested relation), applied to plain rows. A key it does not understand
 * fails the row, so a new condition cannot pass by being ignored.
 */
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(cond as Record<string, unknown>[]).some((w) => matches(row, w))) return false
      continue
    }
    const value = row[key] ?? null
    if (cond !== null && typeof cond === 'object') {
      const c = cond as Record<string, unknown>
      if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
        if (!matches(value as Record<string, unknown>, c)) return false
        continue
      }
      for (const op of Object.keys(c)) {
        if (op === 'not') {
          if (c.not === null ? value === null : value === c.not) return false
        } else if (op === 'in') {
          if (!(c.in as unknown[]).includes(value)) return false
        } else {
          return false
        }
      }
    } else if (value !== cond) {
      return false
    }
  }
  return true
}

vi.mock('@/lib/db', () => ({
  db: {
    quote: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const q = quotes.find((row) => matches(row, where))
        return q
          ? {
              ...q,
              quoteNumber: 'Q-1001',
              totalAmount: 4200,
              validUntil: null,
              createdAt: new Date('2026-11-01T10:00:00Z'),
              publicToken: null,
              vehicle: null,
              vehicleId: null,
              inspectionId: null,
              userId: 'u1',
              partItems: [],
              laborItems: [],
              customer: null,
            }
          : null
      }),
    },
    inspection: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const found = inspections.find((row) => matches(row, where))
        return found
          ? {
              id: found.id,
              status: 'completed',
              mileage: null,
              notes: null,
              completedAt: new Date('2026-11-01T10:00:00Z'),
              createdAt: new Date('2026-11-01T09:00:00Z'),
              publicToken: null,
              severityScale: 'basic',
              country: null,
              nextTestDue: null,
              certificateNumber: null,
              vehicle: { make: 'Volvo', model: 'V70', year: 2015, vin: null, licensePlate: null },
              template: { name: 'Winter check', severityScale: 'basic', country: null },
              items: [],
            }
          : null
      }),
    },
    appSetting: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
    },
    organization: { findUnique: vi.fn(async () => ({ name: 'Fjord Motors' })) },
  },
}))
vi.mock('@/lib/customer-session', () => ({
  getCustomerSession: vi.fn(async () => ({ customerId: 'c1', organizationId: 'org1' })),
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/i18n/locale-from-request', () => ({ resolveCustomerLocale: async () => 'en' }))
vi.mock('@/features/invoice-designer/Pdf/printLabels', () => ({
  loadPrintLabels: async () => ({}),
}))
vi.mock('@/features/condition-map/Lib/loadMarks.server', () => ({
  quoteConditionMap: async () => undefined,
}))
vi.mock('@/features/inspections/Lib/linkedInspectionResults.server', () => ({
  inspectionResultsFor: async () => null,
}))
vi.mock('@/features/custom-fields/Lib/getCustomFieldsForPrint', () => ({
  getCustomFieldsForPrint: async () => [],
  getRecordCustomFieldsForPrint: async () => [],
}))
vi.mock('@/features/signatures/Lib/memberSignature.server', () => ({
  documentSigner: async () => ({ name: '' }),
}))
vi.mock('@/lib/features', () => ({ getFeatures: async () => ({ brandingRemoved: true }) }))
vi.mock('@/lib/torqvoice-branding', () => ({ getTorqvoiceLogoDataUri: async () => undefined }))
vi.mock('@/features/invoice-designer/Pdf/buildQuotePrint', () => ({
  buildQuotePrintSpec: () => ({ pages: [] }),
}))
vi.mock('@/features/vehicles/Lib/typeKeySetting', () => ({
  gateTypeKey: <T>(vehicle: T) => vehicle,
  typeKeyEnabledIn: () => false,
  isTypeKeyEnabled: async () => false,
}))

import { getPortalInspection } from '@/features/portal/Actions/getPortalInspection'
import { getPortalQuote } from '@/features/portal/Actions/getPortalQuote'

beforeEach(() => {
  quotes.length = 0
  inspections.length = 0
})

describe('one quote in the customer portal', () => {
  it('opens a quote the workshop sent to this customer', async () => {
    quotes.push({
      id: 'q1',
      title: 'Brake overhaul',
      status: 'sent',
      customerId: 'c1',
      organizationId: 'org1',
    })
    const result = await getPortalQuote('q1')
    expect(result.success).toBe(true)
    expect(result.data?.title).toBe('Brake overhaul')
    expect(result.data?.totalAmount).toBe(4200)
  })

  it("refuses another customer's quote in the same workshop", async () => {
    quotes.push({
      id: 'q1',
      title: 'Brake overhaul',
      status: 'sent',
      customerId: 'someone-else',
      organizationId: 'org1',
    })
    const result = await getPortalQuote('q1')
    expect(result.success).toBe(true)
    expect(result.data).toBeNull()
  })

  it("refuses the same customer id's quote in another workshop", async () => {
    quotes.push({
      id: 'q1',
      title: 'Brake overhaul',
      status: 'sent',
      customerId: 'c1',
      organizationId: 'org2',
    })
    expect((await getPortalQuote('q1')).data).toBeNull()
  })

  it('refuses a draft, even one with a send recorded', async () => {
    quotes.push({
      id: 'q1',
      title: 'Brake overhaul',
      status: 'draft',
      customerId: 'c1',
      organizationId: 'org1',
      sentAt: new Date('2026-11-01T10:00:00Z'),
    })
    expect((await getPortalQuote('q1')).data).toBeNull()
  })

  it('refuses a draft turned straight into a work order without being sent', async () => {
    quotes.push({
      id: 'q1',
      title: 'Clutch kit',
      status: 'converted',
      customerId: 'c1',
      organizationId: 'org1',
    })
    expect((await getPortalQuote('q1')).data).toBeNull()
  })
})

describe('one inspection in the customer portal', () => {
  it("opens an inspection on the customer's own vehicle", async () => {
    inspections.push({
      id: 'i1',
      organizationId: 'org1',
      vehicle: { customerId: 'c1', organizationId: 'org1' },
    })
    const result = await getPortalInspection('i1')
    expect(result.data?.template.name).toBe('Winter check')
  })

  it("refuses an inspection on another customer's vehicle", async () => {
    inspections.push({
      id: 'i1',
      organizationId: 'org1',
      vehicle: { customerId: 'someone-else', organizationId: 'org1' },
    })
    const result = await getPortalInspection('i1')
    expect(result.success).toBe(true)
    expect(result.data).toBeNull()
  })

  it('refuses an inspection in another workshop', async () => {
    inspections.push({
      id: 'i1',
      organizationId: 'org2',
      vehicle: { customerId: 'c1', organizationId: 'org2' },
    })
    expect((await getPortalInspection('i1')).data).toBeNull()
  })
})
