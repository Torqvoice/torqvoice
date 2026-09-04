/**
 * Emptying an optional field in an edit form has to clear it.
 *
 * A form that turns an emptied input into undefined, or an action that reads
 * '' as "not touched", brings the old value back after save. These tests pin
 * the server half: '' reaches the database as null, and a key left out of the
 * input leaves the stored value alone.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/resolve-upload-path', () => ({ resolveUploadPath: vi.fn((u: string) => u) }))
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return { ...actual, default: actual, unlink: vi.fn().mockResolvedValue(undefined) }
})
vi.mock('@/lib/features', () => ({
  getFeatures: vi.fn().mockResolvedValue({ maxCustomers: 1000 }),
  requireFeature: vi.fn().mockResolvedValue(undefined),
  FeatureGatedError: class FeatureGatedError extends Error {},
}))
vi.mock('@/lib/whatsapp', () => ({ claimWhatsappMessagesForCustomer: vi.fn() }))
vi.mock('@/lib/notification-bus', () => ({ notificationBus: { emit: vi.fn() } }))
vi.mock('@/lib/document-lock.server', () => ({
  assertQuoteEditable: vi.fn().mockResolvedValue(undefined),
  assertInvoiceEditable: vi.fn().mockResolvedValue(undefined),
  getDocumentLockSettings: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn().mockResolvedValue([]) },
    customer: { updateMany: vi.fn() },
    serviceRequest: { updateMany: vi.fn() },
    customFieldDefinition: { findFirst: vi.fn(), update: vi.fn() },
    quote: { findFirst: vi.fn() },
    inspectionItem: { findFirst: vi.fn(), update: vi.fn() },
    vehicle: { findFirst: vi.fn(), update: vi.fn() },
    serviceRecord: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { updateCustomer, updateServiceRequest } from '@/features/customers/Actions/customerActions'
import { updateFieldDefinition } from '@/features/custom-fields/Actions/customFieldActions'
import { updateQuote } from '@/features/quotes/Actions/quoteActions'
import { updateInspectionItem } from '@/features/inspections/Actions/inspectionActions'
import { updateServiceRecord } from '@/features/vehicles/Actions/serviceActions'

const ORG = 'org-a'

function signInAsOwner() {
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-a', email: 'a@example.com' },
  } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.appSetting.findMany).mockResolvedValue([])
  signInAsOwner()
})

describe('updateCustomer', () => {
  it('clears every optional field that arrives emptied', async () => {
    vi.mocked(db.customer.updateMany).mockResolvedValue({ count: 1 } as any)

    const result = await updateCustomer({
      id: 'cust-a',
      name: 'Alice',
      customerNumber: '',
      email: '',
      phone: '',
      address: '',
      company: '',
      taxId: '',
      notes: '',
    })

    expect(result.success).toBe(true)
    const { data } = vi.mocked(db.customer.updateMany).mock.calls[0][0] as any
    expect(data).toMatchObject({
      customerNumber: null,
      email: null,
      phone: null,
      address: null,
      company: null,
      taxId: null,
      notes: null,
    })
  })

  it('leaves fields alone that the caller did not send', async () => {
    vi.mocked(db.customer.updateMany).mockResolvedValue({ count: 1 } as any)

    await updateCustomer({ id: 'cust-a', name: 'Alice Updated' })

    const { data } = vi.mocked(db.customer.updateMany).mock.calls[0][0] as any
    for (const key of [
      'customerNumber',
      'email',
      'phone',
      'address',
      'company',
      'taxId',
      'notes',
    ]) {
      expect(data[key], key).toBeUndefined()
    }
  })
})

describe('updateServiceRequest', () => {
  it('clears the admin notes when they arrive emptied', async () => {
    vi.mocked(db.serviceRequest.updateMany).mockResolvedValue({ count: 1 } as any)

    await updateServiceRequest('req-1', { adminNotes: '' })

    const { data } = vi.mocked(db.serviceRequest.updateMany).mock.calls[0][0] as any
    expect(data.adminNotes).toBeNull()
    expect(data.status).toBeUndefined()
  })

  it('keeps the notes when only the status changes', async () => {
    vi.mocked(db.serviceRequest.updateMany).mockResolvedValue({ count: 1 } as any)

    await updateServiceRequest('req-1', { status: 'dismissed' })

    const { data } = vi.mocked(db.serviceRequest.updateMany).mock.calls[0][0] as any
    expect(data.adminNotes).toBeUndefined()
    expect(data.status).toBe('dismissed')
  })
})

describe('updateFieldDefinition', () => {
  const definition = {
    id: 'field-1',
    name: 'tyre_size',
    label: 'Tyre size',
    fieldType: 'text',
    entityType: 'service_record',
    required: false,
  }

  it('clears the default value and the options list', async () => {
    vi.mocked(db.customFieldDefinition.findFirst).mockResolvedValue({ id: 'field-1' } as any)
    vi.mocked(db.customFieldDefinition.update).mockResolvedValue({ id: 'field-1' } as any)

    const result = await updateFieldDefinition({ ...definition, defaultValue: '', options: '' })

    expect(result.success).toBe(true)
    const { data } = vi.mocked(db.customFieldDefinition.update).mock.calls[0][0] as any
    expect(data.defaultValue).toBeNull()
    expect(data.options).toBeNull()
  })
})

describe('updateQuote', () => {
  function runTransaction() {
    const update = vi.fn().mockResolvedValue({ id: 'quote-a' })
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        quote: { update },
        quotePart: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), createMany: vi.fn() },
        quoteLabor: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), createMany: vi.fn() },
      })
    )
    return update
  }

  it('clears description, notes, dates, customer, vehicle and discount', async () => {
    vi.mocked(db.quote.findFirst).mockResolvedValue({ id: 'quote-a', organizationId: ORG } as any)
    const update = runTransaction()

    const result = await updateQuote({
      id: 'quote-a',
      title: 'Brakes',
      description: '',
      notes: '',
      validUntil: '',
      customerId: '',
      vehicleId: '',
      discountType: 'none',
    })

    expect(result.success).toBe(true)
    const { data } = update.mock.calls[0][0]
    expect(data).toMatchObject({
      description: null,
      notes: null,
      validUntil: null,
      customerId: null,
      vehicleId: null,
      discountType: null,
    })
  })

  it('leaves those fields alone when they are not sent', async () => {
    vi.mocked(db.quote.findFirst).mockResolvedValue({ id: 'quote-a', organizationId: ORG } as any)
    const update = runTransaction()

    await updateQuote({ id: 'quote-a', title: 'Brakes' })

    const { data } = update.mock.calls[0][0]
    for (const key of ['description', 'notes', 'validUntil', 'customerId', 'vehicleId']) {
      expect(data[key], key).toBeUndefined()
    }
  })
})

describe('updateInspectionItem', () => {
  it('clears the notes and the text reading', async () => {
    vi.mocked(db.inspectionItem.findFirst).mockResolvedValue({ id: 'item-a' } as any)
    vi.mocked(db.inspectionItem.update).mockResolvedValue({ id: 'item-a' } as any)

    await updateInspectionItem('item-a', { condition: 'pass', notes: '', textValue: '' })

    const { data } = vi.mocked(db.inspectionItem.update).mock.calls[0][0] as any
    expect(data.notes).toBeNull()
    expect(data.textValue).toBeNull()
  })
})

describe('updateServiceRecord', () => {
  const existing = {
    id: 'sr-a',
    organizationId: ORG,
    vehicleId: 'veh-a',
    customerId: null,
    title: 'Oil change',
    status: 'pending',
    serviceDate: new Date('2026-01-10'),
    attachments: [],
    vehicle: { id: 'veh-a', mileage: 50000 },
  }

  function runTransaction() {
    const update = vi.fn().mockResolvedValue({ ...existing })
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({ serviceRecord: { update } })
    )
    return update
  }

  it('clears mileage, invoice number, invoice dates and notes', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(existing as any)
    const update = runTransaction()

    const result = await updateServiceRecord({
      id: 'sr-a',
      mileage: null,
      invoiceNumber: '',
      invoiceDate: '',
      invoiceDueDate: '',
      description: '',
      diagnosticNotes: '',
      invoiceNotes: '',
    })

    expect(result.success).toBe(true)
    const { data } = update.mock.calls[0][0]
    expect(data).toMatchObject({
      mileage: null,
      invoiceNumber: null,
      invoiceDate: null,
      invoiceDueDate: null,
      description: null,
      diagnosticNotes: null,
      invoiceNotes: null,
    })
  })

  it('keeps a mileage of zero and leaves unsent fields alone', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(existing as any)
    const update = runTransaction()

    await updateServiceRecord({ id: 'sr-a', mileage: 0 })

    const { data } = update.mock.calls[0][0]
    expect(data.mileage).toBe(0)
    for (const key of ['invoiceNumber', 'invoiceDate', 'invoiceDueDate', 'description']) {
      expect(data[key], key).toBeUndefined()
    }
  })
})
