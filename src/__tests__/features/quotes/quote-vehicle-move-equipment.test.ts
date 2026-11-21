/**
 * A quote moved to another vehicle stops working on the old vehicle's
 * equipment, in the same write as the move, as a work order does. A save that
 * leaves the vehicle as it was keeps every pick, including an item that moved
 * to another vehicle on its own since it was picked.
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

vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: async () => [],
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
    vehicle: { findFirst: vi.fn() },
    customer: { findFirst: vi.fn() },
    quote: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { updateQuote } from '@/features/quotes/Actions/quoteActions'

const ORG = 'org-1'
const quoteRow = {
  id: 'q-1',
  organizationId: ORG,
  quoteNumber: 'Q-1',
  title: 'Crane service',
  status: 'draft',
  vehicleId: 'truck-a',
  subtotal: 0,
  discountAmount: 0,
  taxRate: 0,
  taxInclusive: false,
  taxComponents: null,
  warrantyStatus: null,
  warrantyMonths: null,
  warrantyMileage: null,
  warrantyNotes: null,
}

const tx = {
  quote: { update: vi.fn() },
  quoteEquipment: { deleteMany: vi.fn() },
  quotePart: { deleteMany: vi.fn(), createMany: vi.fn() },
  quoteLabor: { deleteMany: vi.fn(), createMany: vi.fn() },
}

beforeEach(() => {
  vi.clearAllMocks()
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
  vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: 'truck-b' } as never)
  vi.mocked(db.quote.findFirst).mockResolvedValue(quoteRow as never)
  tx.quote.update.mockImplementation(async ({ data }: { data: { vehicleId?: string | null } }) => ({
    ...quoteRow,
    vehicleId: data.vehicleId === undefined ? quoteRow.vehicleId : data.vehicleId,
  }))
  vi.mocked(db.$transaction).mockImplementation((async (fn: (client: typeof tx) => unknown) =>
    fn(tx)) as never)
})

describe('moving a quote to another vehicle', () => {
  it('drops its picks that are not on the new vehicle, in the same transaction', async () => {
    const result = await updateQuote({ id: 'q-1', title: 'Crane service', vehicleId: 'truck-b' })
    expect(result.success).toBe(true)
    expect(tx.quoteEquipment.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, quoteId: 'q-1', item: { vehicleId: { not: 'truck-b' } } },
    })
  })

  it('drops every pick when the vehicle is cleared', async () => {
    const result = await updateQuote({ id: 'q-1', title: 'Crane service', vehicleId: '' })
    expect(result.success).toBe(true)
    expect(tx.quoteEquipment.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, quoteId: 'q-1' },
    })
  })

  it('keeps every pick when the vehicle stays the same', async () => {
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: 'truck-a' } as never)
    await updateQuote({ id: 'q-1', title: 'Crane service', vehicleId: 'truck-a' })
    await updateQuote({ id: 'q-1', title: 'Crane service, renamed' })
    expect(tx.quoteEquipment.deleteMany).not.toHaveBeenCalled()
  })
})
