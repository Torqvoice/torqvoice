/**
 * The tire hotel writes money onto existing work orders, so it goes through
 * the same lock as every other edit. This flow was the one money-mutation
 * path the lock originally missed: "add to work order" appends part and labor
 * lines and retotals the job without passing through updateServiceRecord.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/features/tire-hotel/Lib/tireHotelSettings', () => ({
  requireTireHotel: vi.fn(),
  isTireHotelEnabled: vi.fn(),
}))
vi.mock('@/features/tire-hotel/Lib/serverMessages', () => ({
  invoiceLineWords: vi.fn(),
  jobNoteWords: vi.fn(),
  seasonNames: vi.fn(async () => ({})),
  treatmentNames: vi.fn(async () => ({})),
}))
vi.mock('@/features/tire-hotel/Lib/addTireLine', () => ({ addTireLineToRecord: vi.fn() }))
vi.mock('@/features/vehicles/Lib/createDraftRecord', () => ({ createDraftRecord: vi.fn() }))
vi.mock('@/features/vehicles/Lib/retotalServiceRecord', () => ({
  retotalServiceRecord: vi.fn(),
}))
vi.mock('@/features/inventory/Lib/onInventoryChanged', () => ({ onInventoryChanged: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
    serviceRecord: { findFirst: vi.fn(), update: vi.fn() },
    tireSet: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { addTireSetToWorkOrder } from '@/features/tire-hotel/Actions/tireJobActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

const ORG = 'org-1'

const LOCKED_PAID_INVOICE = {
  sentAt: null,
  manuallyPaid: true,
  totalAmount: 500,
  cost: 0,
  editUnlockedAt: null,
  payments: [{ amount: 500 }],
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({ user: { id: 'user-1' } } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
})

describe('adding a stored set to an existing work order', () => {
  it('is refused while the invoice is locked, before anything is written', async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: SETTING_KEYS.INVOICE_LOCK_ENABLED, value: 'true' },
      { key: SETTING_KEYS.INVOICE_LOCK_TRIGGER, value: 'paid' },
    ] as any)
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(LOCKED_PAID_INVOICE as any)

    const result = await addTireSetToWorkOrder({ tireSetId: 'set-1', serviceRecordId: 'rec-1' })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/locked/i)
    // No lines, no retotal, no stock movement.
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('gets past the lock while locking is off', async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([] as any)
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(LOCKED_PAID_INVOICE as any)
    // The set lookup fails afterwards, which is fine: the point is only that
    // the lock was not what stopped it.
    vi.mocked(db.tireSet.findFirst).mockResolvedValue(null as any)

    const result = await addTireSetToWorkOrder({ tireSetId: 'set-1', serviceRecordId: 'rec-1' })

    expect(result.error ?? '').not.toMatch(/locked/i)
  })
})
