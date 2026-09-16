/**
 * Re-applying the current design to invoices that are already issued.
 *
 * The whole value of issuing is that a sent invoice stops following live
 * settings, so the one thing this must never do is let a design change carry
 * anything else with it: not the workshop's address, not the payment terms,
 * not the date the document became the customer's. These pin that down, plus
 * the memo that keeps a run over a whole archive from resolving the same
 * design once per invoice.
 */

import { it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    serviceRecord: { findMany: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    appSetting: { findMany: vi.fn() },
    documentDesign: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}))
vi.mock('@/features/invoices/Lib/assembleInvoicePrint', () => ({
  currentLook: vi.fn(),
  designLook: vi.fn(),
}))
vi.mock('@/features/invoice-designer/Lib/designSnapshots', () => ({
  ensureDesignSnapshot: vi.fn(),
  ensureAssetSnapshot: vi.fn(),
}))

import { db } from '@/lib/db'
import { currentLook, designLook } from '@/features/invoices/Lib/assembleInvoicePrint'
import {
  ensureAssetSnapshot,
  ensureDesignSnapshot,
} from '@/features/invoice-designer/Lib/designSnapshots'
import { reapplyDesign } from '@/features/invoices/Lib/reapplyDesign'

const ORG = 'org-1'

const record = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  designId: null,
  vehicleId: 'veh-1',
  customer: null,
  vehicle: { customer: { invoiceDesignId: null } },
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.appSetting.findMany).mockResolvedValue([] as never)
  vi.mocked(db.serviceRecord.update).mockResolvedValue({} as never)
  vi.mocked(currentLook).mockResolvedValue({
    designSource: { layout: {}, template: {} } as never,
    logoDataUri: 'data:image/png;base64,AAA',
  })
  vi.mocked(designLook).mockResolvedValue({
    designSource: { layout: {}, template: {} } as never,
    logoDataUri: 'data:image/png;base64,BBB',
  })
  vi.mocked(ensureDesignSnapshot).mockResolvedValue('design-snap')
  vi.mocked(ensureAssetSnapshot).mockResolvedValue('logo-snap')
})

it('moves the look and nothing else', async () => {
  vi.mocked(db.serviceRecord.findMany).mockResolvedValue([record('rec-1')] as never)

  expect(await reapplyDesign(ORG, ['rec-1'])).toBe(1)
  expect(db.serviceRecord.update).toHaveBeenCalledWith({
    where: { id: 'rec-1' },
    data: { issuedDesignSnapshotId: 'design-snap', issuedLogoSnapshotId: 'logo-snap' },
  })
})

it('only ever looks at issued invoices of this workshop', async () => {
  vi.mocked(db.serviceRecord.findMany).mockResolvedValue([] as never)

  await reapplyDesign(ORG, ['rec-1'])
  const where = vi.mocked(db.serviceRecord.findMany).mock.calls[0]?.[0]?.where
  expect(where).toMatchObject({
    organizationId: ORG,
    issuedAt: { not: null },
    id: { in: ['rec-1'] },
  })
})

it('clears the logo pointer when the design carries no logo', async () => {
  vi.mocked(db.serviceRecord.findMany).mockResolvedValue([record('rec-1')] as never)
  vi.mocked(currentLook).mockResolvedValue({
    designSource: { layout: {}, template: {} } as never,
    logoDataUri: undefined,
  })

  await reapplyDesign(ORG, ['rec-1'])
  expect(ensureAssetSnapshot).not.toHaveBeenCalled()
  expect(db.serviceRecord.update).toHaveBeenCalledWith({
    where: { id: 'rec-1' },
    data: { issuedDesignSnapshotId: 'design-snap', issuedLogoSnapshotId: null },
  })
})

it('resolves the design once for invoices that resolve to the same one', async () => {
  vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
    record('rec-1'),
    record('rec-2'),
    record('rec-3'),
  ] as never)

  expect(await reapplyDesign(ORG, ['rec-1', 'rec-2', 'rec-3'])).toBe(3)
  expect(currentLook).toHaveBeenCalledTimes(1)
  expect(db.serviceRecord.update).toHaveBeenCalledTimes(3)
})

it('resolves again when an invoice pins its own design', async () => {
  vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
    record('rec-1'),
    record('rec-2', { designId: 'design-b' }),
  ] as never)

  await reapplyDesign(ORG, ['rec-1', 'rec-2'])
  expect(currentLook).toHaveBeenCalledTimes(2)
})

it('resolves again for a counter sale, whose design rules differ', async () => {
  vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
    record('rec-1'),
    record('rec-2', { vehicleId: null, vehicle: null, customer: { invoiceDesignId: null } }),
  ] as never)

  await reapplyDesign(ORG, ['rec-1', 'rec-2'])
  expect(currentLook).toHaveBeenCalledTimes(2)
})

it('does nothing, and asks the database nothing, for an empty list', async () => {
  expect(await reapplyDesign(ORG, [])).toBe(0)
  expect(db.serviceRecord.findMany).not.toHaveBeenCalled()
})

it('uses one chosen design for every invoice, resolved once', async () => {
  vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
    record('rec-1'),
    record('rec-2', { vehicleId: null, vehicle: null, customer: { invoiceDesignId: 'other' } }),
  ] as never)
  vi.mocked(db.documentDesign.findFirst).mockResolvedValue({
    layout: {},
    template: {},
  } as never)

  expect(await reapplyDesign(ORG, ['rec-1', 'rec-2'], 'design-x')).toBe(2)
  // The pick is the look, so what each invoice would have followed is moot.
  expect(currentLook).not.toHaveBeenCalled()
  expect(designLook).toHaveBeenCalledTimes(1)
  expect(db.serviceRecord.update).toHaveBeenCalledTimes(2)
})

it('refuses a design of another workshop', async () => {
  vi.mocked(db.serviceRecord.findMany).mockResolvedValue([record('rec-1')] as never)
  vi.mocked(db.documentDesign.findFirst).mockResolvedValue(null as never)

  await expect(reapplyDesign(ORG, ['rec-1'], 'design-elsewhere')).rejects.toThrow(
    'Design not found'
  )
  expect(db.serviceRecord.update).not.toHaveBeenCalled()
})
