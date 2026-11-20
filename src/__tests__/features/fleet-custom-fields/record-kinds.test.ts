/**
 * @vitest-environment node
 *
 * The workshop's own fields on a vehicle and on a customer. They follow the
 * record like a work order's do: its permission, its workshop, and the same
 * check of a required field on the server. Unlike a work order's they are
 * part of the plan's custom fields, hidden and kept without it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  customFieldDefinition: { findMany: vi.fn(), findFirst: vi.fn() },
  customFieldValue: { findMany: vi.fn(), upsert: vi.fn() },
  vehicle: { count: vi.fn(), findFirst: vi.fn() },
  customer: { count: vi.fn() },
  appSetting: { findMany: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db }))

const seenOptions = vi.hoisted(() => [] as { requiredPermissions?: unknown }[])
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (
    action: (ctx: { userId: string; organizationId: string }) => unknown,
    options: { requiredPermissions?: unknown } = {}
  ) => {
    seenOptions.push(options)
    try {
      return { success: true, data: await action({ userId: 'u-1', organizationId: 'org-1' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/document-lock.server', () => ({
  assertInvoiceEditable: vi.fn(),
  assertQuoteEditable: vi.fn(),
}))
vi.mock('@/lib/features', () => ({ requireFeature: vi.fn(), getFeatures: vi.fn() }))

import {
  getCustomFieldValues,
  getFieldDefinitions,
  saveValidatedCustomFieldValues,
} from '@/features/custom-fields/Actions/customFieldActions'
import { setCustomFieldPlacement } from '@/features/settings/Actions/invoiceLayoutActions'
import { getRecordCustomFieldsForPrint } from '@/features/custom-fields/Lib/getCustomFieldsForPrint'
import { assertInvoiceEditable, assertQuoteEditable } from '@/lib/document-lock.server'
import { getFeatures } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'

const needed = () => seenOptions.at(-1)?.requiredPermissions
const plan = (customFields: boolean) =>
  vi.mocked(getFeatures).mockResolvedValue({ customFields } as never)

const REQUIRED = {
  id: 'f-1',
  label: 'Tachograph due',
  fieldType: 'text',
  options: null,
  required: true,
  defaultValue: '',
  isActive: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  seenOptions.length = 0
  plan(true)
  db.customFieldDefinition.findMany.mockResolvedValue([REQUIRED])
  db.customFieldValue.findMany.mockResolvedValue([])
  db.customFieldValue.upsert.mockReturnValue('upsert')
  db.vehicle.count.mockResolvedValue(1)
  db.customer.count.mockResolvedValue(1)
  db.$transaction.mockResolvedValue([])
})

describe.each([
  ['vehicle', PermissionSubject.VEHICLES, db.vehicle],
  ['customer', PermissionSubject.CUSTOMERS, db.customer],
] as const)('the fields of a %s', (kind, subject, model) => {
  it('are read on what reading the record needs', async () => {
    expect((await getCustomFieldValues('r-1', kind)).success).toBe(true)
    expect(needed()).toEqual([{ action: PermissionAction.READ, subject }])
    await getFieldDefinitions(kind)
    expect(needed()).toEqual([{ action: PermissionAction.READ, subject }])
  })

  it('are saved on what saving the record needs, and never held by a document lock', async () => {
    const result = await saveValidatedCustomFieldValues('r-1', kind, { 'f-1': 'March' })
    expect(result).toEqual({ success: true, data: { saved: true } })
    expect(needed()).toEqual([{ action: PermissionAction.UPDATE, subject }])
    expect(db.customFieldValue.upsert).toHaveBeenCalledTimes(1)
    expect(assertInvoiceEditable).not.toHaveBeenCalled()
    expect(assertQuoteEditable).not.toHaveBeenCalled()
  })

  it('cannot be read from, or attached to, a record of another workshop', async () => {
    model.count.mockResolvedValue(0)

    expect(await getCustomFieldValues('theirs', kind)).toEqual({
      success: false,
      error: 'Record not found',
    })
    expect(await saveValidatedCustomFieldValues('theirs', kind, { 'f-1': 'x' })).toEqual({
      success: false,
      error: 'Record not found',
    })
    expect(model.count).toHaveBeenCalledWith({ where: { id: 'theirs', organizationId: 'org-1' } })
    expect(db.customFieldValue.findMany).not.toHaveBeenCalled()
    expect(db.customFieldValue.upsert).not.toHaveBeenCalled()
  })

  it('refuse a required field left empty, naming it by its label', async () => {
    const result = await saveValidatedCustomFieldValues('r-1', kind, { 'f-1': '  ' })
    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      saved: false,
      fieldErrors: [{ fieldId: 'f-1', label: 'Tachograph due', issue: 'required' }],
    })
    expect(db.customFieldValue.upsert).not.toHaveBeenCalled()
  })

  it('are hidden and kept on a plan without custom fields', async () => {
    plan(false)

    expect(await getFieldDefinitions(kind)).toEqual({ success: true, data: [] })
    expect(await getCustomFieldValues('r-1', kind)).toEqual({ success: true, data: [] })
    // Nothing is asked of the form, so a required field cannot stop a save
    // of a record the workshop can no longer fill it in on.
    expect(await saveValidatedCustomFieldValues('r-1', kind, { 'f-1': '' })).toEqual({
      success: true,
      data: { saved: true },
    })
    expect(db.customFieldValue.upsert).not.toHaveBeenCalled()
  })

  it('have no place in the workshop-wide arrangement of a document', async () => {
    const result = await setCustomFieldPlacement({
      definitionId: 'f-1',
      entityType: kind,
      placement: 'vehicle',
    } as never)
    expect(result).toEqual({ success: false, error: 'Invalid placement' })
    expect(db.appSetting.upsert).not.toHaveBeenCalled()
  })
})

describe('the record’s fields for a document', () => {
  it('reads nothing at all for a job with neither vehicle nor customer', async () => {
    expect(await getRecordCustomFieldsForPrint('org-1', {})).toEqual([])
    expect(db.customFieldDefinition.findMany).not.toHaveBeenCalled()
  })

  it('keeps vehicle and customer fields out of the whole list on a plan without them', async () => {
    plan(false)
    await getFieldDefinitions()
    expect(db.customFieldDefinition.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      entityType: { notIn: ['vehicle', 'customer'] },
    })
    plan(true)
    await getFieldDefinitions()
    expect(db.customFieldDefinition.findMany.mock.calls[1][0].where).toEqual({
      organizationId: 'org-1',
    })
  })

  it('reads no values for a workshop that has defined none', async () => {
    db.customFieldDefinition.findMany.mockResolvedValue([])
    expect(
      await getRecordCustomFieldsForPrint('org-1', { vehicleId: 'v-1', customerId: 'c-1' })
    ).toEqual([])
    expect(db.customFieldValue.findMany).not.toHaveBeenCalled()
    expect(getFeatures).not.toHaveBeenCalled()
  })

  it('reads the definitions of this workshop only, and the values of these two records', async () => {
    db.customFieldDefinition.findMany.mockResolvedValue([{ ...REQUIRED, entityType: 'vehicle' }])
    db.customFieldValue.findMany.mockResolvedValue([{ fieldId: 'f-1', value: 'March' }])

    expect(
      await getRecordCustomFieldsForPrint('org-1', { vehicleId: 'v-1', customerId: 'c-1' })
    ).toEqual([{ fieldId: 'f-1', label: 'Tachograph due', fieldType: 'text', value: 'March' }])
    expect(db.customFieldDefinition.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      entityType: { in: ['vehicle', 'customer'] },
      isActive: true,
    })
    expect(db.customFieldValue.findMany.mock.calls[0][0].where).toEqual({
      OR: [
        { entityType: 'vehicle', entityId: 'v-1' },
        { entityType: 'customer', entityId: 'c-1' },
      ],
      fieldId: { in: ['f-1'] },
    })
  })

  it('takes the vehicle’s owner when the document has no customer of its own, as the invoice does', async () => {
    db.customFieldDefinition.findMany.mockResolvedValue([
      { ...REQUIRED, id: 'f-c', label: 'Cost centre', entityType: 'customer' },
    ])
    db.vehicle.findFirst.mockResolvedValue({ customerId: 'owner-1' })
    db.customFieldValue.findMany.mockResolvedValue([{ fieldId: 'f-c', value: 'CC-7741' }])

    expect(await getRecordCustomFieldsForPrint('org-1', { vehicleId: 'v-1' })).toEqual([
      { fieldId: 'f-c', label: 'Cost centre', fieldType: 'text', value: 'CC-7741' },
    ])
    // The owner is read in this workshop only.
    expect(db.vehicle.findFirst).toHaveBeenCalledWith({
      where: { id: 'v-1', organizationId: 'org-1' },
      select: { customerId: true },
    })
    expect(db.customFieldValue.findMany.mock.calls[0][0].where.OR).toEqual([
      { entityType: 'vehicle', entityId: 'v-1' },
      { entityType: 'customer', entityId: 'owner-1' },
    ])
  })

  it('does not look the owner up when the workshop has no customer fields', async () => {
    db.customFieldDefinition.findMany.mockResolvedValue([{ ...REQUIRED, entityType: 'vehicle' }])
    await getRecordCustomFieldsForPrint('org-1', { vehicleId: 'v-1' })
    expect(db.vehicle.findFirst).not.toHaveBeenCalled()
  })

  it('prints none on a plan without custom fields', async () => {
    plan(false)
    expect(await getRecordCustomFieldsForPrint('org-1', { vehicleId: 'v-1' })).toEqual([])
    expect(db.customFieldValue.findMany).not.toHaveBeenCalled()
  })
})
