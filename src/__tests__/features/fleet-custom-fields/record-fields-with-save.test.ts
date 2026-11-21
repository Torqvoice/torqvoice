/**
 * @vitest-environment node
 *
 * A vehicle's and a customer's own fields are saved with the record, by the
 * record's own action: checked on the server and written in the same
 * transaction, so a required field left empty means nothing is made or
 * changed, and a record cannot be saved without its fields or the other way
 * round. A tab that sends no fields (one opened before the forms sent them,
 * or a quick create from another form) is saved exactly as it always was.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => {
  const tx = {
    vehicle: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'veh-new',
        ...data,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    customer: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'cust-new',
        ...data,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    customFieldValue: {
      upsert: vi.fn(async (_args: { where: unknown; create: unknown; update: unknown }) => ({})),
    },
  }
  return {
    tx,
    appSetting: { findMany: vi.fn(async () => []) },
    customFieldDefinition: { findMany: vi.fn() },
    customFieldValue: {
      findMany: vi.fn(async (): Promise<{ fieldId: string; value: string }[]> => []),
      upsert: vi.fn(),
    },
    documentDesign: { findFirst: vi.fn() },
    vehicle: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'veh-old',
        ...data,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findFirst: vi.fn(async () => ({
        year: 2019,
        make: 'Volvo',
        model: 'FH',
        licensePlate: null,
        vin: null,
        imageUrl: null,
      })),
    },
    customer: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'cust-old',
        ...data,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 1),
    },
    vehicleInspectionStatus: { updateMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(async (fn: (store: typeof tx) => unknown) => fn(tx)),
  }
})

vi.mock('@/lib/db', () => ({ db }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values: { fields: string }) =>
    key === 'notSavedMissing'
      ? `Not saved. Fill in: ${values.fields}`
      : `Not saved. Check: ${values.fields}`,
}))
// withAuth's own mapping of a refusal, with the session taken as given.
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (fn: (ctx: { userId: string; organizationId: string }) => Promise<unknown>) => {
    try {
      return { success: true, data: await fn({ userId: 'user-1', organizationId: 'org-1' }) }
    } catch (error) {
      if (error instanceof Error && error.name === 'CustomFieldsRefusedError') {
        return {
          success: false,
          error: error.message,
          customFieldErrors: (error as Error & { fieldErrors: unknown }).fieldErrors,
        }
      }
      return { success: false, error: (error as Error).message }
    }
  },
}))
vi.mock('@/lib/features', () => ({
  getFeatures: vi.fn(async () => ({ customFields: true, maxCustomers: 1000 })),
  FeatureGatedError: class extends Error {},
}))
vi.mock('@/lib/customer-limit', () => ({ countCustomersTowardLimit: vi.fn(async () => 0) }))
vi.mock('@/lib/whatsapp', () => ({ claimWhatsappMessagesForCustomer: vi.fn() }))
vi.mock('@/features/messaging/Lib/emailClaim.server', () => ({
  claimEmailMessagesForCustomer: vi.fn(),
}))
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: vi.fn(async () => 'Europe/London') }))
vi.mock('@/lib/owned-records', () => ({ assertOwnedCustomer: vi.fn(async () => undefined) }))
vi.mock('@/features/integrations/Lib/inspection-sync', () => ({
  INSPECTION_CAPABILITY: 'inspection',
  recordRegistryAnswer: vi.fn(),
}))
vi.mock('@/integrations/registry', () => ({ getManifest: vi.fn(() => null) }))
vi.mock('@/lib/files/manager', () => ({ releaseFiles: vi.fn() }))
vi.mock('@/lib/files/collect', () => ({ vehicleFileUrls: vi.fn(async () => []) }))

import { createCustomer, updateCustomer } from '@/features/customers/Actions/customerActions'
import { createVehicle, updateVehicle } from '@/features/vehicles/Actions/vehicleActions'

const field = { options: null, defaultValue: null, isActive: true, fieldType: 'text' }
const DEFINITIONS = [
  { ...field, id: 'f-tacho', label: 'Tachograph due', required: true },
  { ...field, id: 'f-depot', label: 'Home depot', required: true },
  { ...field, id: 'f-note', label: 'Livery', required: false },
]
const base = { make: 'Volvo', model: 'FH', year: 2019 }

beforeEach(() => {
  vi.clearAllMocks()
  db.customFieldDefinition.findMany.mockResolvedValue(DEFINITIONS)
  db.customFieldValue.findMany.mockResolvedValue([])
})

describe('a new vehicle with fields of the workshop’s own', () => {
  it('is made with its fields in one transaction', async () => {
    const result = await createVehicle({
      ...base,
      customFields: { 'f-tacho': 'March', 'f-depot': 'North', 'f-note': '' },
    })

    expect(result.success).toBe(true)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.tx.vehicle.create).toHaveBeenCalledTimes(1)
    expect(db.vehicle.create).not.toHaveBeenCalled()
    expect(db.tx.customFieldValue.upsert.mock.calls.map(([args]) => args)).toEqual([
      {
        where: { fieldId_entityId: { fieldId: 'f-tacho', entityId: 'veh-new' } },
        create: { fieldId: 'f-tacho', entityId: 'veh-new', entityType: 'vehicle', value: 'March' },
        update: { value: 'March' },
      },
      {
        where: { fieldId_entityId: { fieldId: 'f-depot', entityId: 'veh-new' } },
        create: { fieldId: 'f-depot', entityId: 'veh-new', entityType: 'vehicle', value: 'North' },
        update: { value: 'North' },
      },
      {
        where: { fieldId_entityId: { fieldId: 'f-note', entityId: 'veh-new' } },
        create: { fieldId: 'f-note', entityId: 'veh-new', entityType: 'vehicle', value: '' },
        update: { value: '' },
      },
    ])
    // Only this workshop's fields are asked about.
    expect(db.customFieldDefinition.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      entityType: 'vehicle',
      isActive: true,
    })
  })

  it('is not made at all while a required field is empty, and the answer names them', async () => {
    const result = await createVehicle({ ...base, customFields: { 'f-note': 'White cab' } })

    expect(result).toEqual({
      success: false,
      error: 'Not saved. Fill in: Tachograph due, Home depot',
      customFieldErrors: [
        { fieldId: 'f-tacho', label: 'Tachograph due', issue: 'required' },
        { fieldId: 'f-depot', label: 'Home depot', issue: 'required' },
      ],
    })
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.vehicle.create).not.toHaveBeenCalled()
    expect(db.tx.vehicle.create).not.toHaveBeenCalled()
    expect(db.tx.customFieldValue.upsert).not.toHaveBeenCalled()
  })

  it('from a form that sends no fields (a quick create, an old tab) is made exactly as before', async () => {
    const result = await createVehicle(base)

    expect(result.success).toBe(true)
    expect(db.vehicle.create).toHaveBeenCalledTimes(1)
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.customFieldDefinition.findMany).not.toHaveBeenCalled()
  })
})

describe('editing a vehicle with fields of the workshop’s own', () => {
  it('changes the vehicle and its fields in one transaction', async () => {
    db.customFieldValue.findMany.mockResolvedValue([
      { fieldId: 'f-tacho', value: 'March' },
      { fieldId: 'f-depot', value: 'North' },
    ])

    const result = await updateVehicle({
      id: 'veh-1',
      color: 'Red',
      customFields: { 'f-tacho': 'March', 'f-depot': 'South', 'f-note': '' },
    })

    expect(result.success).toBe(true)
    expect(db.tx.vehicle.updateMany).toHaveBeenCalledTimes(1)
    expect(db.vehicle.updateMany).not.toHaveBeenCalled()
    // What did not change is not written again.
    expect(db.tx.customFieldValue.upsert.mock.calls.map(([args]) => args.where)).toEqual([
      { fieldId_entityId: { fieldId: 'f-depot', entityId: 'veh-1' } },
      { fieldId_entityId: { fieldId: 'f-note', entityId: 'veh-1' } },
    ])
  })

  it('writes no field when the vehicle cannot be changed, and none is left half saved', async () => {
    db.tx.vehicle.updateMany.mockResolvedValueOnce({ count: 0 })

    const result = await updateVehicle({
      id: 'theirs',
      customFields: { 'f-tacho': 'March', 'f-depot': 'North' },
    })

    expect(result).toEqual({ success: false, error: 'Vehicle not found' })
    expect(db.tx.customFieldValue.upsert).not.toHaveBeenCalled()
  })

  it('asks for a required field a quick create left empty, by its label, on the next full save', async () => {
    // Made from the work order with no fields; the full form now shows the
    // field and sends it empty.
    const result = await updateVehicle({
      id: 'veh-1',
      customFields: { 'f-tacho': 'March', 'f-depot': '', 'f-note': '' },
    })

    expect(result).toMatchObject({
      success: false,
      error: 'Not saved. Fill in: Home depot',
    })
    expect(db.tx.vehicle.updateMany).not.toHaveBeenCalled()
    expect(db.vehicle.updateMany).not.toHaveBeenCalled()
  })

  it('judges a field the form left out by what the vehicle holds', async () => {
    db.customFieldValue.findMany.mockResolvedValue([{ fieldId: 'f-tacho', value: 'March' }])

    const result = await updateVehicle({ id: 'veh-1', customFields: { 'f-note': 'x' } })

    expect(result).toMatchObject({ error: 'Not saved. Fill in: Home depot' })
  })

  it('on a plan without custom fields, saves the vehicle and leaves the fields alone', async () => {
    const { getFeatures } = await import('@/lib/features')
    vi.mocked(getFeatures).mockResolvedValue({ customFields: false, maxCustomers: 1000 } as never)

    const result = await updateVehicle({ id: 'veh-1', customFields: { 'f-depot': '' } })

    expect(result.success).toBe(true)
    expect(db.vehicle.updateMany).toHaveBeenCalledTimes(1)
    expect(db.tx.customFieldValue.upsert).not.toHaveBeenCalled()
    vi.mocked(getFeatures).mockResolvedValue({ customFields: true, maxCustomers: 1000 } as never)
  })
})

describe('a customer with fields of the workshop’s own', () => {
  beforeEach(() => {
    db.customFieldDefinition.findMany.mockResolvedValue([
      { ...field, id: 'f-centre', label: 'Cost centre', required: true },
    ])
  })

  it('is made with its fields in one transaction', async () => {
    const result = await createCustomer({
      name: 'ZZ Haulage',
      customFields: { 'f-centre': 'CC-1' },
    })

    expect(result.success).toBe(true)
    expect(db.tx.customer.create).toHaveBeenCalledTimes(1)
    expect(db.customer.create).not.toHaveBeenCalled()
    expect(db.tx.customFieldValue.upsert).toHaveBeenCalledWith({
      where: { fieldId_entityId: { fieldId: 'f-centre', entityId: 'cust-new' } },
      create: { fieldId: 'f-centre', entityId: 'cust-new', entityType: 'customer', value: 'CC-1' },
      update: { value: 'CC-1' },
    })
  })

  it('is not made while a required field is empty', async () => {
    const result = await createCustomer({ name: 'ZZ Haulage', customFields: {} })

    expect(result).toMatchObject({
      success: false,
      error: 'Not saved. Fill in: Cost centre',
      customFieldErrors: [{ fieldId: 'f-centre', label: 'Cost centre', issue: 'required' }],
    })
    expect(db.customer.create).not.toHaveBeenCalled()
    expect(db.tx.customer.create).not.toHaveBeenCalled()
  })

  it('is changed with its fields in one transaction', async () => {
    const result = await updateCustomer({
      id: 'cust-1',
      name: 'ZZ Haulage',
      customFields: { 'f-centre': 'CC-2' },
    })

    expect(result.success).toBe(true)
    expect(db.tx.customer.updateMany).toHaveBeenCalledTimes(1)
    expect(db.customer.updateMany).not.toHaveBeenCalled()
    expect(db.tx.customFieldValue.upsert).toHaveBeenCalledTimes(1)
  })

  it('of another workshop gets no field written and is not found', async () => {
    db.customer.count.mockResolvedValueOnce(0)
    // Scoped to this workshop, the update itself matches nothing either.
    db.customer.updateMany.mockResolvedValueOnce({ count: 0 })

    const result = await updateCustomer({ id: 'theirs', customFields: { 'f-centre': 'CC-2' } })

    expect(result).toEqual({ success: false, error: 'Customer not found' })
    expect(db.customFieldValue.findMany).not.toHaveBeenCalled()
    expect(db.tx.customFieldValue.upsert).not.toHaveBeenCalled()
    expect(db.customer.count).toHaveBeenCalledWith({
      where: { id: 'theirs', organizationId: 'org-1' },
    })
  })

  it('from a form that sends no fields is saved exactly as before', async () => {
    const result = await updateCustomer({ id: 'cust-1', name: 'ZZ Haulage' })

    expect(result.success).toBe(true)
    expect(db.customer.updateMany).toHaveBeenCalledTimes(1)
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.customer.count).not.toHaveBeenCalled()
  })
})
