/**
 * The bulk tax backfill must not rewrite locked documents.
 *
 * It retotals every zero-tax record in the org, which is exactly the rewrite
 * the lock exists to prevent when the customer already holds the document.
 * Locked records are skipped and counted, not silently changed; unlocking
 * them (or turning locking off) makes them eligible again.
 */

import { it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
    serviceRecord: { findMany: vi.fn(), update: vi.fn() },
    quote: { findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { applyTaxRateToExisting } from '@/features/settings/Actions/applyTaxRateToExisting'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

const ORG = 'org-1'

const SETTINGS: Record<string, string> = {
  [SETTING_KEYS.TAX_ENABLED]: 'true',
  [SETTING_KEYS.DEFAULT_TAX_RATE]: '25',
  [SETTING_KEYS.INVOICE_LOCK_ENABLED]: 'true',
  [SETTING_KEYS.INVOICE_LOCK_TRIGGER]: 'paid',
  [SETTING_KEYS.QUOTE_LOCK_ENABLED]: 'true',
  [SETTING_KEYS.QUOTE_LOCK_TRIGGER]: 'accepted',
}

const MONEY = { subtotal: 100, discountAmount: 0, taxInclusive: false }

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
  // Every settings read comes through the same table; answer each query with
  // the rows whose keys it asked for.
  vi.mocked(db.appSetting.findMany).mockImplementation((async (args: any) => {
    const wanted: string[] = args?.where?.key?.in ?? Object.keys(SETTINGS)
    return wanted.filter((key) => key in SETTINGS).map((key) => ({ key, value: SETTINGS[key] }))
  }) as any)
  vi.mocked(db.$transaction).mockImplementation(async (cb: any) => cb(db))
})

it('updates open documents and skips locked ones, reporting both', async () => {
  vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
    {
      id: 'rec-open',
      ...MONEY,
      sentAt: null,
      manuallyPaid: false,
      totalAmount: 100,
      cost: 0,
      editUnlockedAt: null,
      payments: [],
    },
    {
      id: 'rec-locked',
      ...MONEY,
      sentAt: null,
      manuallyPaid: true,
      totalAmount: 100,
      cost: 0,
      editUnlockedAt: null,
      payments: [],
    },
  ] as any)
  vi.mocked(db.quote.findMany).mockResolvedValue([
    { id: 'quote-open', ...MONEY, status: 'draft', sentAt: null, editUnlockedAt: null },
    { id: 'quote-locked', ...MONEY, status: 'accepted', sentAt: null, editUnlockedAt: null },
  ] as any)

  const result = await applyTaxRateToExisting()

  expect(result.success).toBe(true)
  expect(result.data).toMatchObject({
    serviceRecordsUpdated: 1,
    quotesUpdated: 1,
    serviceRecordsSkipped: 1,
    quotesSkipped: 1,
  })

  const recordIds = vi.mocked(db.serviceRecord.update).mock.calls.map((c) => c[0].where.id)
  expect(recordIds).toEqual(['rec-open'])
  const quoteIds = vi.mocked(db.quote.update).mock.calls.map((c) => c[0].where.id)
  expect(quoteIds).toEqual(['quote-open'])
})

it('touches everything while locking is off', async () => {
  SETTINGS[SETTING_KEYS.INVOICE_LOCK_ENABLED] = 'false'
  SETTINGS[SETTING_KEYS.QUOTE_LOCK_ENABLED] = 'false'
  try {
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
      {
        id: 'rec-paid',
        ...MONEY,
        sentAt: null,
        manuallyPaid: true,
        totalAmount: 100,
        cost: 0,
        editUnlockedAt: null,
        payments: [],
      },
    ] as any)
    vi.mocked(db.quote.findMany).mockResolvedValue([
      { id: 'quote-accepted', ...MONEY, status: 'accepted', sentAt: null, editUnlockedAt: null },
    ] as any)

    const result = await applyTaxRateToExisting()

    expect(result.data).toMatchObject({
      serviceRecordsUpdated: 1,
      quotesUpdated: 1,
      serviceRecordsSkipped: 0,
      quotesSkipped: 0,
    })
  } finally {
    SETTINGS[SETTING_KEYS.INVOICE_LOCK_ENABLED] = 'true'
    SETTINGS[SETTING_KEYS.QUOTE_LOCK_ENABLED] = 'true'
  }
})
