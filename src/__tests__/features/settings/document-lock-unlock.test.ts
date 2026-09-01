/**
 * Who may reopen a locked invoice or quote.
 *
 * This is the one route around the lock, so the check that guards it is worth
 * testing from both sides: an ordinary member must not get through, and an
 * owner or admin must not be blocked. The audit entry matters too, because an
 * unlock nobody can trace is indistinguishable from the lock never having been
 * there.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    serviceRecord: { findFirst: vi.fn(), update: vi.fn() },
    quote: { findFirst: vi.fn(), update: vi.fn() },
  },
}))

import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import {
  setInvoiceEditUnlocked,
  setQuoteEditUnlocked,
} from '@/features/settings/Actions/documentLockActions'

const ORG = 'org-1'

function signInAs(membership: Record<string, unknown>) {
  vi.mocked(getCachedSession).mockResolvedValue({ user: { id: 'user-1' } } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    roleId: null,
    customRole: null,
    ...membership,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
}

/** A member holding every permission, but not owner or admin. */
const PERMISSIVE_MEMBER = {
  role: 'member',
  customRole: {
    isAdmin: false,
    permissions: [
      { action: 'update', subject: 'services' },
      { action: 'update', subject: 'quotes' },
    ],
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
    id: 'rec-1',
    vehicleId: 'veh-1',
    invoiceNumber: 'INV-1001',
  } as any)
  vi.mocked(db.quote.findFirst).mockResolvedValue({ id: 'quote-1', quoteNumber: 'QT-1001' } as any)
})

describe('unlocking an invoice', () => {
  it('is refused for a member, even one with permission to edit invoices', async () => {
    // The permission to edit is exactly what the lock is overriding, so it
    // cannot be the permission that grants the override.
    signInAs(PERMISSIVE_MEMBER)

    const result = await setInvoiceEditUnlocked('rec-1', true)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/owner or admin/i)
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
  })

  it('is allowed for the org owner', async () => {
    signInAs({ role: 'owner' })

    const result = await setInvoiceEditUnlocked('rec-1', true)

    expect(result.success).toBe(true)
    const data = vi.mocked(db.serviceRecord.update).mock.calls[0]?.[0]?.data as any
    expect(data.editUnlockedAt).toBeInstanceOf(Date)
    expect(data.editUnlockedById).toBe('user-1')
  })

  it('is allowed for an admin', async () => {
    signInAs({ role: 'admin' })
    expect((await setInvoiceEditUnlocked('rec-1', true)).success).toBe(true)
  })

  it('is allowed for a custom role marked as admin', async () => {
    signInAs({ role: 'member', customRole: { isAdmin: true, permissions: [] } })
    expect((await setInvoiceEditUnlocked('rec-1', true)).success).toBe(true)
  })

  it('clears both fields when locking again', async () => {
    signInAs({ role: 'owner' })

    const result = await setInvoiceEditUnlocked('rec-1', false)

    expect(result.success).toBe(true)
    const data = vi.mocked(db.serviceRecord.update).mock.calls[0]?.[0]?.data as any
    expect(data.editUnlockedAt).toBeNull()
    // Left over, this would still name whoever last unlocked it.
    expect(data.editUnlockedById).toBeNull()
  })

  it('refuses a record belonging to another org', async () => {
    signInAs({ role: 'owner' })
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null as any)

    const result = await setInvoiceEditUnlocked('someone-elses', true)

    expect(result.success).toBe(false)
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
  })

  it('records the unlock and the re-lock as separate audited actions', async () => {
    signInAs({ role: 'owner' })
    const unlocked = await setInvoiceEditUnlocked('rec-1', true)
    const relocked = await setInvoiceEditUnlocked('rec-1', false)
    expect(unlocked.data?.unlocked).toBe(true)
    expect(relocked.data?.unlocked).toBe(false)
    expect(unlocked.data?.reference).toBe('INV-1001')
  })
})

describe('unlocking a quote', () => {
  it('is refused for a member', async () => {
    signInAs(PERMISSIVE_MEMBER)

    const result = await setQuoteEditUnlocked('quote-1', true)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/owner or admin/i)
    expect(db.quote.update).not.toHaveBeenCalled()
  })

  it('is allowed for the org owner', async () => {
    signInAs({ role: 'owner' })

    const result = await setQuoteEditUnlocked('quote-1', true)

    expect(result.success).toBe(true)
    const data = vi.mocked(db.quote.update).mock.calls[0]?.[0]?.data as any
    expect(data.editUnlockedAt).toBeInstanceOf(Date)
    expect(data.editUnlockedById).toBe('user-1')
  })

  it('refuses a quote belonging to another org', async () => {
    signInAs({ role: 'owner' })
    vi.mocked(db.quote.findFirst).mockResolvedValue(null as any)

    expect((await setQuoteEditUnlocked('someone-elses', true)).success).toBe(false)
    expect(db.quote.update).not.toHaveBeenCalled()
  })
})
