/**
 * The audit log names the job a payment was taken on as people know it.
 *
 * "Recorded payment 100 for service cmwv5zy…" gave the record's database id
 * and a bare number. The row now carries the job's invoice number (or its
 * title while it has none) and the workshop's currency, and the log reads
 * "Recorded payment £100.00 for service INV-1001". Rows written before keep
 * reading as they did, with the id.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import audit from '../../../../messages/en/audit.json'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/features/invoices/Lib/issueInvoice', () => ({
  issueInvoice: vi.fn().mockResolvedValue(false),
}))
vi.mock('@/lib/workshop-timezone', () => ({
  workshopTimeZone: vi.fn().mockResolvedValue('Pacific/Auckland'),
}))

const tx = {
  $queryRaw: vi.fn(),
  payment: { aggregate: vi.fn(), create: vi.fn() },
}
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
    serviceRecord: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { createPayment } from '@/features/payments/Actions/paymentActions'
import { auditSummaryParams } from '@/features/audit/Lib/summaryParams'
import { formatCurrency } from '@/lib/format'

function job(fields: { invoiceNumber: string | null; title: string }) {
  vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
    id: 'cmwv5zyjob',
    vehicleId: 'v-1',
    ...fields,
  } as any)
}

const pay = () =>
  createPayment({ serviceRecordId: 'cmwv5zyjob', amount: 100, date: '2026-11-24', method: 'card' })

/** The audit row's sentence as the log reads it in English. */
function sentence(params: Record<string, string | number> | undefined) {
  const ready = auditSummaryParams(params, {
    connectorName: () => null,
    formatCurrency: (amount, code) => formatCurrency(amount, code),
  })
  return new IntlMessageFormat(audit.summary.payment_create, 'en').format(ready)
}

const loggedParams = () =>
  (vi.mocked(logAudit).mock.calls[0][1] as { details: { params: Record<string, string | number> } })
    .details.params

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({ user: { id: 'user-1' } } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: 'org-1',
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
  vi.mocked(db.appSetting.findMany).mockResolvedValue([
    { key: SETTING_KEYS.CURRENCY_CODE, value: 'GBP' },
  ] as any)
  vi.mocked(db.$transaction).mockImplementation(async (cb: any) => cb(tx))
  tx.$queryRaw.mockResolvedValue([{ totalAmount: 500, cost: 0 }])
  tx.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
  tx.payment.create.mockImplementation(async ({ data }: any) => ({ id: 'pay-1', ...data }))
})

describe('the audit row for a payment', () => {
  it('names the job by its invoice number, with the amount in the workshop currency', async () => {
    job({ invoiceNumber: 'INV-1001', title: 'Brake service' })
    expect((await pay()).success).toBe(true)

    expect(loggedParams()).toEqual({ amount: 100, currency: 'GBP', ref: 'INV-1001' })
    expect(sentence(loggedParams())).toBe('Recorded payment £100.00 for service INV-1001')
  })

  it('names a job with no invoice number yet by its title', async () => {
    job({ invoiceNumber: null, title: 'Brake service' })
    await pay()
    expect(loggedParams()).toMatchObject({ ref: 'Brake service' })
  })

  it('still reads, with the id, for a row written before', () => {
    expect(sentence({ amount: 100, serviceRecordId: 'cmwv5zyjob' })).toBe(
      'Recorded payment 100 for service cmwv5zyjob'
    )
  })
})
