/**
 * The rules for a part that does not track stock (a fee or consumable that is
 * charged but never counted): it is never low, it is left out of stock value,
 * and switching tracking off empties what was counted so far.
 *
 * That a job leaves its quantity alone is proved against PostgreSQL in
 * src/__tests__/db/untracked-stock.db.test.ts, since the rule is in the SQL.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/files/collect', () => ({
  inventoryPartFileUrls: vi.fn(async () => []),
}))
vi.mock('@/lib/files/manager', () => ({
  releaseFiles: vi.fn(async () => ({ removed: [], kept: [], skipped: [] })),
  parseStoredFileUrl: vi.fn(() => null),
}))
vi.mock('@/features/inventory/Lib/onInventoryChanged', () => ({
  onInventoryChanged: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db', () => {
  const db = {
    // The stock helper's one statement: the part goes to the quantity asked
    // for and reports how far it moved.
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (run: unknown) =>
      typeof run === 'function' ? run(db) : Promise.all(run as Promise<unknown>[])
    ),
    user: { findUnique: vi.fn() },
    inventoryPart: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    stockMovement: { create: vi.fn() },
    storedImage: { deleteMany: vi.fn(), createMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return { db }
})

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import {
  adjustInventoryStock,
  createInventoryPart,
  updateInventoryPart,
} from '@/features/inventory/Actions/inventoryActions'
import { decideLowStockAlerts, isLow } from '@/features/inventory/Lib/lowStockAlerts'
import { getInventoryReport } from '@/features/reports/Actions/reportActions'

const ORG = 'org-1'

const m = db as any

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-1', email: 'owner@example.com' },
  } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  m.user.findUnique.mockResolvedValue({ isSuperAdmin: false })
  m.inventoryPart.updateMany.mockResolvedValue({ count: 1 })
})

describe('low stock', () => {
  const fee = {
    id: 'fee',
    name: 'Consumables fee',
    partNumber: null,
    quantity: 0,
    minQuantity: 5,
    unit: null,
    lowStockAlertedAt: null,
  }

  it('never counts an untracked part as low, though a counted one at zero is', () => {
    expect(isLow({ ...fee, trackStock: false })).toBe(false)
    expect(isLow({ ...fee, trackStock: false }, 10)).toBe(false)
    expect(isLow({ ...fee, trackStock: true })).toBe(true)
  })

  it('sends no alert for it', () => {
    const { newlyLow } = decideLowStockAlerts([{ ...fee, trackStock: false }], 10)
    expect(newlyLow).toEqual([])
  })
})

describe('stock value', () => {
  it('reads only the parts that are counted', async () => {
    m.inventoryPart.findMany.mockResolvedValue([])
    await getInventoryReport()
    expect(m.inventoryPart.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      trackStock: true,
    })
  })
})

describe('turning stock tracking off', () => {
  it('takes a negative quantity to zero, notes why in the ledger, and clears the low-stock flag', async () => {
    m.inventoryPart.findFirst.mockResolvedValue({ id: 'supplies', trackStock: true })
    // The part stood at -40.
    m.$queryRaw.mockResolvedValue([{ quantity: 0, delta: 40 }])

    const result = await updateInventoryPart({ id: 'supplies', trackStock: false, quantity: 12 })

    expect(result.success).toBe(true)
    expect(m.stockMovement.create).toHaveBeenCalledTimes(1)
    expect(m.stockMovement.create.mock.calls[0][0].data).toMatchObject({
      inventoryPartId: 'supplies',
      organizationId: ORG,
      reason: 'stock_tracking_off',
      delta: 40,
      quantityAfter: 0,
      userId: 'user-1',
    })
    expect(m.inventoryPart.updateMany.mock.lastCall[0].data).toMatchObject({
      trackStock: false,
      quantity: 0,
      lowStockAlertedAt: null,
    })
  })

  it('writes no ledger entry for a part that was already uncounted, and keeps it at zero', async () => {
    m.inventoryPart.findFirst.mockResolvedValue({ id: 'fee', trackStock: false })

    // A tab opened before the switch existed still sends a quantity.
    await updateInventoryPart({ id: 'fee', name: 'Consumables', quantity: 7 })

    expect(m.$queryRaw).not.toHaveBeenCalled()
    expect(m.stockMovement.create).not.toHaveBeenCalled()
    expect(m.inventoryPart.updateMany.mock.lastCall[0].data).toMatchObject({ quantity: 0 })
  })

  it('leaves a counted part alone when the switch is not sent', async () => {
    m.inventoryPart.findFirst.mockResolvedValue({ id: 'filter', trackStock: true })

    await updateInventoryPart({ id: 'filter', quantity: 7 })

    expect(m.stockMovement.create).not.toHaveBeenCalled()
    const data = m.inventoryPart.updateMany.mock.lastCall[0].data
    expect(data.quantity).toBe(7)
    expect(data).not.toHaveProperty('lowStockAlertedAt')
  })
})

describe('an untracked part', () => {
  it('is created with no stock, whatever quantity came with it', async () => {
    m.inventoryPart.create.mockResolvedValue({ id: 'fee', name: 'Consumables fee' })

    await createInventoryPart({ name: 'Consumables fee', trackStock: false, quantity: 3 })

    expect(m.inventoryPart.create.mock.calls[0][0].data).toMatchObject({
      trackStock: false,
      quantity: 0,
    })
  })

  it('refuses stock added from a barcode scan', async () => {
    m.inventoryPart.findFirst.mockResolvedValue({ id: 'fee', trackStock: false, quantity: 0 })

    const result = await adjustInventoryStock({ id: 'fee', adjustment: 5 })

    expect(result.success).toBe(false)
    expect(m.inventoryPart.updateMany).not.toHaveBeenCalled()
  })
})
