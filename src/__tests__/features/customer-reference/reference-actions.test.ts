/**
 * The customer's reference / PO, where it is saved and where it stops an
 * invoice.
 *
 * Two promises are held here. The reference saves on its own, on a locked
 * invoice as much as on a draft, because the number often arrives after the
 * invoice has gone out. And a customer marked "PO required" gets no invoice
 * without one, by any road that hands the invoice over, while nothing else
 * about the job, and nothing at all for a workshop that has the field off,
 * is ever refused.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/features', () => ({
  getFeatures: vi.fn(),
  requireFeature: vi.fn(),
  isCloudMode: () => false,
}))
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (namespace: string) => (key: string) => `${namespace}.${key}`),
}))
vi.mock('@/features/invoices/Lib/issueInvoice', () => ({
  issueInvoice: vi.fn().mockResolvedValue(false),
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
    serviceRecord: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    quote: { findFirst: vi.fn(), update: vi.fn() },
    customer: { updateMany: vi.fn(), findFirst: vi.fn() },
    documentDesign: { findFirst: vi.fn() },
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { issueInvoice } from '@/features/invoices/Lib/issueInvoice'
import { setServiceRecordReference } from '@/features/customer-reference/Actions/setServiceRecordReference'
import { setQuoteReference } from '@/features/customer-reference/Actions/setQuoteReference'
import { assertInvoiceHasRequiredReference } from '@/features/customer-reference/Lib/invoiceGuard.server'
import { invoiceAwaitsReference } from '@/features/customer-reference/Lib/referenceSetting'
import { generatePublicLink } from '@/features/vehicles/Actions/serviceActions'
import { updateCustomer } from '@/features/customers/Actions/customerActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

const ORG = 'org-1'

function signInAsOwner() {
  vi.mocked(getCachedSession).mockResolvedValue({ user: { id: 'user-1' } } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
}

/** The workshop's settings as rows; the Reference / PO switch among them or not. */
function workshop({ field, plan = true }: { field: boolean; plan?: boolean }) {
  vi.mocked(db.appSetting.findMany).mockResolvedValue([
    // A lock that would refuse any ordinary edit of a sent invoice.
    { key: SETTING_KEYS.INVOICE_LOCK_ENABLED, value: 'true' },
    { key: SETTING_KEYS.INVOICE_LOCK_TRIGGER, value: 'sent' },
    ...(field ? [{ key: SETTING_KEYS.CUSTOMER_REFERENCE_ENABLED, value: 'true' }] : []),
  ] as never)
  vi.mocked(getFeatures).mockResolvedValue({ customFields: plan } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  signInAsOwner()
})

describe('saving the reference on a work order', () => {
  it('stores what was typed, trimmed', async () => {
    workshop({ field: true })
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      id: 'svc1',
      invoiceNumber: 'INV-1',
      vehicleId: 'veh1',
    } as never)
    const result = await setServiceRecordReference('svc1', '  PO-48213 ')
    expect(result.success).toBe(true)
    expect(db.serviceRecord.update).toHaveBeenCalledWith({
      where: { id: 'svc1' },
      data: { customerReference: 'PO-48213' },
    })
  })

  it('clears it when the box is emptied', async () => {
    workshop({ field: true })
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({ id: 'svc1' } as never)
    await setServiceRecordReference('svc1', '   ')
    expect(db.serviceRecord.update).toHaveBeenCalledWith({
      where: { id: 'svc1' },
      data: { customerReference: null },
    })
  })

  it('saves on an invoice that is sent and locked, where the number arrives late', async () => {
    workshop({ field: true })
    // Only what the action asks for; it never reads the lock's columns.
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      id: 'svc1',
      invoiceNumber: 'INV-1',
      vehicleId: null,
      sentAt: new Date(),
    } as never)
    const result = await setServiceRecordReference('svc1', 'PO-1')
    expect(result.success).toBe(true)
    expect(result.error ?? '').not.toMatch(/locked/i)
  })

  it('looks the job up in the caller’s own workshop', async () => {
    workshop({ field: true })
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null)
    const result = await setServiceRecordReference('someone-elses', 'PO-1')
    expect(result.success).toBe(false)
    expect(db.serviceRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'someone-elses', organizationId: ORG } })
    )
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
  })

  it('is refused for a workshop that has the field off, in the reader’s own words', async () => {
    workshop({ field: false })
    const result = await setServiceRecordReference('svc1', 'PO-1')
    expect(result.success).toBe(false)
    expect(result.error).toBe('service.reference.notSwitchedOn')
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
  })

  it('is refused on a plan without the field, though the switch still says on', async () => {
    workshop({ field: true, plan: false })
    const result = await setServiceRecordReference('svc1', 'PO-1')
    expect(result.success).toBe(false)
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
  })
})

describe('saving the reference on a quote', () => {
  it('stores it, in the caller’s own workshop', async () => {
    workshop({ field: true })
    vi.mocked(db.quote.findFirst).mockResolvedValue({ id: 'q1' } as never)
    const result = await setQuoteReference('q1', 'PO-48213')
    expect(result.success).toBe(true)
    expect(db.quote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'q1', organizationId: ORG } })
    )
    expect(db.quote.update).toHaveBeenCalledWith({
      where: { id: 'q1' },
      data: { customerReference: 'PO-48213' },
    })
  })

  it('is refused for a workshop that has the field off', async () => {
    workshop({ field: false })
    const result = await setQuoteReference('q1', 'PO-1')
    expect(result.success).toBe(false)
    expect(db.quote.update).not.toHaveBeenCalled()
  })
})

const needsPo = { poRequired: true }

describe('an invoice waiting for its reference', () => {
  it('waits while the customer needs one and the job has none', async () => {
    workshop({ field: true })
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      customerReference: null,
      customer: null,
      vehicle: { customer: needsPo },
    } as never)
    expect(await invoiceAwaitsReference(ORG, 'svc1')).toBe(true)
    await expect(assertInvoiceHasRequiredReference(ORG, 'svc1')).rejects.toThrow(
      'service.reference.requiredToInvoice'
    )
  })

  it('goes once the reference is there', async () => {
    workshop({ field: true })
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      customerReference: 'PO-1',
      customer: needsPo,
      vehicle: null,
    } as never)
    await expect(assertInvoiceHasRequiredReference(ORG, 'svc1')).resolves.toBeUndefined()
  })

  it('never waits for a customer who does not need one', async () => {
    workshop({ field: true })
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      customerReference: null,
      customer: { poRequired: false },
      vehicle: null,
    } as never)
    expect(await invoiceAwaitsReference(ORG, 'svc1')).toBe(false)
  })

  it('never waits, and reads nothing about the job, while the field is off', async () => {
    workshop({ field: false })
    expect(await invoiceAwaitsReference(ORG, 'svc1')).toBe(false)
    expect(db.serviceRecord.findFirst).not.toHaveBeenCalled()
  })
})

describe('sharing the invoice by link', () => {
  const record = { id: 'svc1', publicToken: null, vehicleId: 'veh1' }

  it('is refused, with nothing issued and no link made, while the reference is missing', async () => {
    workshop({ field: true })
    vi.mocked(db.serviceRecord.findFirst)
      .mockResolvedValueOnce(record as never)
      .mockResolvedValueOnce({
        customerReference: null,
        customer: needsPo,
        vehicle: null,
      } as never)
    const result = await generatePublicLink('svc1')
    expect(result.success).toBe(false)
    expect(result.error).toBe('service.reference.requiredToInvoice')
    expect(issueInvoice).not.toHaveBeenCalled()
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
    expect(db.serviceRecord.updateMany).not.toHaveBeenCalled()
  })

  it('goes ahead as it always has for a workshop without the field', async () => {
    workshop({ field: false })
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(record as never)
    const result = await generatePublicLink('svc1')
    expect(result.error ?? '').not.toContain('reference')
    expect(issueInvoice).toHaveBeenCalledWith('svc1', ORG, 'sent')
  })
})

describe('"PO required" on a customer', () => {
  it('is saved by a workshop that uses the field', async () => {
    workshop({ field: true })
    vi.mocked(db.customer.updateMany).mockResolvedValue({ count: 1 } as never)
    await updateCustomer({ id: 'c1', name: 'ZZ Example Haulage', poRequired: true })
    expect(vi.mocked(db.customer.updateMany).mock.calls[0][0].data).toMatchObject({
      poRequired: true,
    })
  })

  it('is neither set nor cleared by a workshop that has the field off', async () => {
    workshop({ field: false })
    vi.mocked(db.customer.updateMany).mockResolvedValue({ count: 1 } as never)
    await updateCustomer({ id: 'c1', name: 'ZZ Example Haulage', poRequired: false })
    expect(vi.mocked(db.customer.updateMany).mock.calls[0][0].data).not.toHaveProperty('poRequired')
  })

  it('is left alone by a save that does not mention it, as an old tab’s does not', async () => {
    workshop({ field: true })
    vi.mocked(db.customer.updateMany).mockResolvedValue({ count: 1 } as never)
    await updateCustomer({ id: 'c1', name: 'ZZ Example Haulage' })
    expect(vi.mocked(db.customer.updateMany).mock.calls[0][0].data).not.toHaveProperty('poRequired')
  })
})
