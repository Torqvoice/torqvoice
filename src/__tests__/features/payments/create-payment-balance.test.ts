/**
 * A payment taken at the desk may settle what is owed, never pass it.
 *
 * £1000 recorded against a £552.74 balance was saved, and the invoice then
 * read "PAID IN FULL -£447.26". createPayment now reads the balance from the
 * stored total and the payments already recorded, under the job's row lock,
 * and refuses anything above it in the workshop's own currency.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import service from '../../../../messages/en/service.json'

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
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const messages = (service as Record<string, unknown>)[namespace.split('.')[1]] as Record<
      string,
      string
    >
    return (key: string, values?: Record<string, string>) =>
      Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replace(`{${name}}`, value),
        messages[key]
      )
  },
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
    payment: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { createPayment } from '@/features/payments/Actions/paymentActions'

const ORG = 'org-1'

/** A £552.74 invoice; `paid` is what has already been recorded against it. */
function invoice({ total = 552.74, paid = 0 }: { total?: number; paid?: number } = {}) {
  vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({ id: 'job-1', vehicleId: 'v-1' } as any)
  tx.$queryRaw.mockResolvedValue([{ totalAmount: total, cost: 0 }])
  tx.payment.aggregate.mockResolvedValue({ _sum: { amount: paid } })
}

const pay = (amount: number) =>
  createPayment({ serviceRecordId: 'job-1', amount, date: '2026-11-24', method: 'card' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({ user: { id: 'user-1' } } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
  vi.mocked(db.appSetting.findMany).mockResolvedValue([
    { key: SETTING_KEYS.CURRENCY_CODE, value: 'GBP' },
  ] as any)
  vi.mocked(db.$transaction).mockImplementation(async (cb: any) => cb(tx))
  tx.payment.create.mockImplementation(async ({ data }: any) => ({ id: 'pay-1', ...data }))
})

describe('recording a payment at the desk', () => {
  it('refuses more than the balance due, and says how much is due', async () => {
    invoice()
    const result = await pay(1000)

    expect(result.success).toBe(false)
    expect(result.error).toBe('The balance due is £552.74. A payment cannot be more than that.')
    expect(tx.payment.create).not.toHaveBeenCalled()
  })

  it('counts what has already been paid', async () => {
    invoice({ paid: 500 })
    const result = await pay(60)

    expect(result.error).toBe('The balance due is £52.74. A payment cannot be more than that.')
    expect(tx.payment.create).not.toHaveBeenCalled()
  })

  it('takes exactly the balance due', async () => {
    invoice({ paid: 500 })
    const result = await pay(52.74)

    expect(result.success).toBe(true)
    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ serviceRecordId: 'job-1', amount: 52.74 }),
    })
  })

  it('takes the balance of a total stored a hair off the cent, as the invoice prints it', async () => {
    // 0.18 plus 25% was once stored as 0.22499999999999998, printed 0.22.
    invoice({ total: 0.22499999999999998 })
    expect((await pay(0.22)).success).toBe(true)
  })

  it('takes a part payment', async () => {
    invoice()
    expect((await pay(100)).success).toBe(true)
    expect(tx.payment.create).toHaveBeenCalledTimes(1)
  })

  it('says nothing is due once the invoice is paid in full', async () => {
    invoice({ paid: 552.74 })
    const result = await pay(10)

    expect(result.error).toBe('Nothing is due on this invoice.')
    expect(tx.payment.create).not.toHaveBeenCalled()
  })

  it('reads the balance under the job row lock, scoped to the workshop', async () => {
    invoice()
    await pay(100)

    const [strings, ...values] = tx.$queryRaw.mock.calls[0]
    expect(strings.join('?')).toMatch(/"service_records"[\s\S]*FOR UPDATE/)
    expect(values).toEqual(['job-1', ORG])
  })

  it('refuses a job of another workshop before reading any balance', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null)
    const result = await pay(10)

    expect(result.error).toBe('Service record not found')
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})
