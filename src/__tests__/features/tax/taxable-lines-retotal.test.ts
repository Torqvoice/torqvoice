/**
 * @vitest-environment node
 *
 * Lines that reach a job from outside the editor: a part or a labor line
 * booked from the technician app, and anything that re-totals a job from
 * its stored lines.
 *
 * None of these paths is told whether the line is taxed, so each has to ask
 * the workshop's rule, and each has to total the job on its taxable lines
 * alone. A fake database holding real rows stands in for Prisma here, so
 * the test reads the job back the way the next page load would.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown> & { serviceRecordId: string; total: number; taxable?: boolean }

const store = {
  settings: [] as { key: string; value: string }[],
  record: {} as Record<string, unknown>,
  parts: [] as Row[],
  labor: [] as Row[],
}

function table(rows: () => Row[]) {
  const matches = (where: Record<string, unknown> = {}) =>
    rows().filter((row) => Object.entries(where).every(([key, value]) => row[key] === value))
  return {
    aggregate: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => ({
      _sum: { total: matches(where).reduce((sum, row) => sum + row.total, 0) || null },
    })),
    findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => matches(where)),
    create: vi.fn(async ({ data }: { data: Row }) => {
      // The column's own default, which is what a path that forgets to say gets.
      const row = { id: `row-${rows().length + 1}`, taxable: true, ...data }
      rows().push(row)
      return row
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = rows().find((r) => r.id === where.id)
      if (row) Object.assign(row, data)
      return row
    }),
  }
}

vi.mock('@/lib/db', () => {
  const db: Record<string, unknown> = {
    appSetting: {
      findMany: vi.fn(async ({ where }: { where?: { key?: { in?: string[] } } } = {}) => {
        const wanted = where?.key?.in
        return wanted ? store.settings.filter((s) => wanted.includes(s.key)) : store.settings
      }),
      findFirst: vi.fn(
        async ({ where }: { where: { key: string } }) =>
          store.settings.find((s) => s.key === where.key) ?? null
      ),
    },
    serviceRecord: {
      findFirst: vi.fn(async () => store.record),
      findUnique: vi.fn(async () => store.record),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(store.record, data)
        return store.record
      }),
    },
    servicePart: table(() => store.parts),
    serviceLabor: table(() => store.labor),
  }
  db.$transaction = vi.fn(async (run: (tx: unknown) => unknown) => run(db))
  return { db }
})
vi.mock('@/lib/document-lock.server', () => ({
  assertInvoiceEditable: vi.fn(async () => undefined),
}))
vi.mock('@/features/inventory/Lib/reconcileStock', () => ({
  reconcileInventoryForParts: vi.fn(async () => undefined),
}))
vi.mock('@/features/vehicles/Lib/jobEvents', () => ({ announceLaborAdded: vi.fn() }))
vi.mock('@/lib/with-api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/with-api-auth')>('@/lib/with-api-auth')
  return {
    ...actual,
    withApiAuth: vi.fn(
      async (
        _request: Request,
        handler: (ctx: {
          organizationId: string
          technicianIds: string[]
          isAdmin: boolean
        }) => Promise<Response>
      ) => handler({ organizationId: 'org-1', technicianIds: ['tech-1'], isAdmin: true })
    ),
  }
})

import { POST as postLabor } from '@/app/api/v1/tech/jobs/[id]/labor/route'
import { loadTaxApplies } from '@/features/settings/Lib/loadTaxApplies'
import { addPart } from '@/features/vehicles/Lib/addPart'
import { serviceRecordLineSums } from '@/features/vehicles/Lib/lineSums'
import { retotalServiceRecord } from '@/features/vehicles/Lib/retotalServiceRecord'
import { db } from '@/lib/db'

const PARTS_ONLY = [
  { key: 'workshop.taxSelective', value: 'true' },
  { key: 'workshop.taxAppliesToLabor', value: 'false' },
  { key: 'workshop.taxAppliesToShopFee', value: 'false' },
  { key: 'workshop.defaultLaborRate', value: '100' },
]

beforeEach(() => {
  store.settings = []
  store.parts = []
  store.labor = []
  store.record = {
    id: 'sr-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    title: 'Brakes',
    invoiceNumber: 'INV-1',
    subtotal: 0,
    taxRate: 8,
    taxAmount: 0,
    taxInclusive: false,
    taxComponents: null,
    taxableSubtotal: null,
    totalAmount: 0,
    discountType: null,
    discountValue: 0,
  }
})

const part = (total: number, taxable = true): Row => ({
  id: `p-${total}`,
  serviceRecordId: 'sr-1',
  total,
  taxable,
})
const labor = (total: number, taxable = true, pricingType = 'hourly'): Row => ({
  id: `l-${total}`,
  serviceRecordId: 'sr-1',
  total,
  taxable,
  pricingType,
  hours: 1,
  rate: total,
})

describe('the workshop rule, read from settings', () => {
  it('taxes everything when nothing is set', async () => {
    expect(await loadTaxApplies('org-1')).toEqual({ parts: true, labor: true, shopFee: true })
  })

  it('reads the three answers when the workshop taxes only some charges', async () => {
    store.settings = PARTS_ONLY
    expect(await loadTaxApplies('org-1')).toEqual({ parts: true, labor: false, shopFee: false })
  })

  it('taxes everything again when that is switched off, whatever the answers say', async () => {
    store.settings = PARTS_ONLY.map((s) =>
      s.key === 'workshop.taxSelective' ? { ...s, value: 'false' } : s
    )
    expect(await loadTaxApplies('org-1')).toEqual({ parts: true, labor: true, shopFee: true })
  })
})

describe('re-totalling a job from its stored lines', () => {
  it('adds up the lines and the taxable part of them', async () => {
    store.parts = [part(200), part(10, false)]
    store.labor = [labor(300, false), labor(50, true)]
    expect(await serviceRecordLineSums(db, 'sr-1')).toEqual({
      subtotal: 560,
      taxableSubtotal: 250,
    })
  })

  it('charges the tax on the taxable lines and stores what it was charged on', async () => {
    store.parts = [part(200)]
    store.labor = [labor(300, false)]
    await retotalServiceRecord('sr-1')
    expect(store.record).toMatchObject({
      subtotal: 500,
      taxableSubtotal: 200,
      taxAmount: 16,
      totalAmount: 516,
    })
  })

  it('stores no taxable subtotal for a job whose every line is taxed', async () => {
    store.record.taxableSubtotal = 200
    store.parts = [part(200)]
    store.labor = [labor(300)]
    await retotalServiceRecord('sr-1')
    expect(store.record).toMatchObject({
      subtotal: 500,
      taxableSubtotal: null,
      taxAmount: 40,
      totalAmount: 540,
    })
  })

  it('shares a percentage discount over taxed and untaxed lines', async () => {
    store.record.discountType = 'percentage'
    store.record.discountValue = 10
    store.parts = [part(200)]
    store.labor = [labor(300, false)]
    await retotalServiceRecord('sr-1')
    expect(store.record).toMatchObject({
      discountAmount: 50,
      taxableSubtotal: 200,
      taxAmount: 14.4,
      totalAmount: 464.4,
    })
  })
})

describe('a labor line billed from the technician app', () => {
  const post = (body: unknown) =>
    postLabor(
      new Request('https://app.test/api/v1/tech/jobs/sr-1/labor', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: 'sr-1' }) }
    )

  it('is left out of the tax where the workshop does not tax labor', async () => {
    store.settings = PARTS_ONLY
    store.parts = [part(200)]

    const response = await post({ description: 'Fit pads', hours: 3 })

    expect(response.status).toBe(201)
    expect(store.labor).toHaveLength(1)
    expect(store.labor[0]).toMatchObject({ total: 300, taxable: false })
    // The parts are taxed, the three hours are not.
    expect(store.record).toMatchObject({
      subtotal: 500,
      taxableSubtotal: 200,
      taxAmount: 16,
      totalAmount: 516,
    })
  })

  it('is taxed like everything else where the workshop taxes everything', async () => {
    store.settings = [{ key: 'workshop.defaultLaborRate', value: '100' }]
    store.parts = [part(200)]

    await post({ description: 'Fit pads', hours: 3 })

    expect(store.labor[0]).toMatchObject({ taxable: true })
    expect(store.record).toMatchObject({
      subtotal: 500,
      taxableSubtotal: null,
      taxAmount: 40,
      totalAmount: 540,
    })
  })
})

describe('a part booked onto a job', () => {
  const input = {
    serviceRecordId: 'sr-1',
    name: 'Brake pads',
    quantity: 1,
    unitPrice: 200,
    total: 200,
    unitCost: 120,
  }

  it('is taxed where the workshop taxes parts, beside labor that is not', async () => {
    store.settings = PARTS_ONLY
    store.labor = [labor(300, false)]

    await addPart({ organizationId: 'org-1', userId: 'user-1', input })

    expect(store.parts[0]).toMatchObject({ taxable: true })
    expect(store.record).toMatchObject({
      subtotal: 500,
      taxableSubtotal: 200,
      taxAmount: 16,
      totalAmount: 516,
    })
  })

  it('is left out of the tax where the workshop does not tax parts', async () => {
    store.settings = [
      { key: 'workshop.taxSelective', value: 'true' },
      { key: 'workshop.taxAppliesToParts', value: 'false' },
    ]
    store.labor = [labor(300)]

    await addPart({ organizationId: 'org-1', userId: 'user-1', input })

    expect(store.parts[0]).toMatchObject({ taxable: false })
    expect(store.record).toMatchObject({
      subtotal: 500,
      taxableSubtotal: 300,
      taxAmount: 24,
      totalAmount: 524,
    })
  })

  it('takes the caller at its word when it says', async () => {
    store.settings = PARTS_ONLY
    await addPart({
      organizationId: 'org-1',
      userId: 'user-1',
      input: { ...input, taxable: false },
    })
    expect(store.parts[0]).toMatchObject({ taxable: false })
    expect(store.record).toMatchObject({ taxableSubtotal: 0, taxAmount: 0, totalAmount: 200 })
  })
})
