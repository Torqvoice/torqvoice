/**
 * The order a workshop drags a quote's lines into is the order they come
 * back in, on the quote and on the work order it becomes (issue #619).
 *
 * The database is played by a small store that hands rows back in the
 * reverse of how they were written unless the read asks for them by
 * position, as Postgres makes no promise about the order of an unordered
 * read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/workshop-timezone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workshop-timezone')>()),
  workshopTimeZone: async () => 'UTC',
}))
vi.mock('@/lib/document-lock.server', () => ({
  assertQuoteEditable: vi.fn().mockResolvedValue(undefined),
  assertInvoiceEditable: vi.fn().mockResolvedValue(undefined),
  getDocumentLockSettings: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/features/inventory/Lib/reconcileStock', () => ({
  reconcileInventoryForParts: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/features/inventory/Lib/onInventoryChanged', () => ({
  onInventoryChanged: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/invoice-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/invoice-utils')>()),
  resolveInvoicePrefix: vi.fn((p: string) => p),
}))

vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: async () => [],
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
    organization: { findUnique: vi.fn() },
    vehicle: { findFirst: vi.fn() },
    inspection: { findFirst: vi.fn() },
    serviceRecord: { findFirst: vi.fn() },
    quote: { findFirst: vi.fn() },
    quotePart: { findMany: vi.fn() },
    quoteLabor: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import {
  convertQuoteToServiceRecord,
  getQuote,
  updateQuote,
} from '@/features/quotes/Actions/quoteActions'

const ORG = 'org-1'

type Row = Record<string, unknown> & { sortOrder?: number }

/** The quote's lines as the database holds them, in no particular order. */
const table = { parts: [] as Row[], labor: [] as Row[] }

function read(rows: Row[], relation: unknown): Row[] {
  const orderBy = (relation as { orderBy?: { sortOrder?: string } } | undefined)?.orderBy
  if (orderBy?.sortOrder === 'asc') {
    return [...rows].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  }
  return [...rows].reverse()
}

const quoteRow = {
  id: 'q-1',
  organizationId: ORG,
  quoteNumber: 'Q-1',
  title: 'Brakes',
  description: null,
  status: 'draft',
  subtotal: 0,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  taxRate: 0,
  taxAmount: 0,
  taxInclusive: false,
  taxComponents: null,
  taxableSubtotal: null,
  totalAmount: 0,
  warrantyStatus: null,
  warrantyMonths: null,
  warrantyMileage: null,
  warrantyNotes: null,
  tireSetId: null,
  inspectionId: null,
  vehicle: null,
  attachments: [],
}

const written = {
  serviceParts: vi.fn(),
  serviceLabor: vi.fn(),
}

beforeEach(() => {
  vi.resetAllMocks()
  table.parts = []
  table.labor = []
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-1', email: 'a@example.com' },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
  vi.mocked(db.appSetting.findMany).mockResolvedValue([] as never)
  vi.mocked(db.organization.findUnique).mockResolvedValue({ name: 'Shop' } as never)
  vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: 'veh-1' } as never)
  vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null as never)
  vi.mocked(db.quote.findFirst).mockImplementation((async (args: {
    include?: { partItems?: unknown; laborItems?: unknown }
  }) => ({
    ...quoteRow,
    partItems: read(table.parts, args?.include?.partItems),
    laborItems: read(table.labor, args?.include?.laborItems),
  })) as never)

  written.serviceParts.mockResolvedValue({ count: 0 })
  written.serviceLabor.mockResolvedValue({ count: 0 })
  const tx = {
    quote: {
      update: vi.fn(async () => quoteRow),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    quotePart: {
      deleteMany: vi.fn(async () => {
        table.parts = []
      }),
      createMany: vi.fn(async ({ data }: { data: Row[] }) => {
        table.parts.push(...data)
      }),
    },
    quoteLabor: {
      deleteMany: vi.fn(async () => {
        table.labor = []
      }),
      createMany: vi.fn(async ({ data }: { data: Row[] }) => {
        table.labor.push(...data)
      }),
    },
    serviceRecord: {
      create: vi.fn().mockResolvedValue({ id: 'sr-1', title: 'Brakes', invoiceNumber: '1001' }),
    },
    servicePart: { createMany: written.serviceParts },
    serviceLabor: { createMany: written.serviceLabor },
    serviceAttachment: { createMany: vi.fn() },
  }
  vi.mocked(db.$transaction).mockImplementation((async (fn: (client: typeof tx) => unknown) =>
    fn(tx)) as never)
})

const part = (name: string) => ({ name, quantity: 1, unitPrice: 100, total: 100 })
const labor = (description: string) => ({ description, hours: 1, rate: 500, total: 500 })

/** Saves the quote with its lines in the order the editor holds them. */
async function saveInOrder(parts: string[], laborLines: string[]) {
  const result = await updateQuote({
    id: 'q-1',
    title: 'Brakes',
    partItems: parts.map(part),
    laborItems: laborLines.map(labor),
  })
  expect(result.success).toBe(true)
}

describe('the order of a quote’s lines', () => {
  it('comes back as it was saved when the quote is opened again', async () => {
    await saveInOrder(['Rotors', 'Brake pads', 'Brake fluid'], ['Bleed brakes', 'Replace pads'])

    const result = await getQuote('q-1')
    expect(result.success).toBe(true)
    expect(result.data?.partItems.map((p) => p.name)).toEqual([
      'Rotors',
      'Brake pads',
      'Brake fluid',
    ])
    expect(result.data?.laborItems.map((l) => l.description)).toEqual([
      'Bleed brakes',
      'Replace pads',
    ])
  })

  it('follows a later move on the next save', async () => {
    await saveInOrder(['Rotors', 'Brake pads'], [])
    await saveInOrder(['Brake pads', 'Rotors'], [])

    const result = await getQuote('q-1')
    expect(result.data?.partItems.map((p) => p.name)).toEqual(['Brake pads', 'Rotors'])
  })

  it('is the order the lines arrive in on the work order it becomes', async () => {
    await saveInOrder(['Rotors', 'Brake pads', 'Brake fluid'], ['Bleed brakes', 'Replace pads'])

    const result = await convertQuoteToServiceRecord('q-1', 'veh-1')
    expect(result.success).toBe(true)

    const jobParts = written.serviceParts.mock.calls[0][0].data as { name: string }[]
    expect(jobParts.map((p) => p.name)).toEqual(['Rotors', 'Brake pads', 'Brake fluid'])
    const jobLabor = written.serviceLabor.mock.calls[0][0].data as { description: string }[]
    expect(jobLabor.map((l) => l.description)).toEqual(['Bleed brakes', 'Replace pads'])
  })
})
