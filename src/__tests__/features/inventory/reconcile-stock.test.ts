/**
 * Tests for reconcileInventoryForParts — the single source of truth for how
 * work-order parts move inventory stock.
 *
 * The helper must apply the NET delta between a record's previous and next
 * linked parts: adding/increasing consumes stock, removing/reducing restocks,
 * and unchanged quantities touch nothing. Every write is scoped to the
 * caller's organization and applied atomically via `UPDATE ... RETURNING`,
 * and every applied movement is mirrored into the StockMovement ledger.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  reconcileInventoryForParts,
  type StockMovementContext,
} from '@/features/inventory/Lib/reconcileStock'

const ORG = 'org-1'

const CTX: StockMovementContext = {
  reason: 'service_record',
  userId: 'user-1',
  serviceRecordId: 'svc-1',
  serviceRecordLabel: 'INV-1001',
}

/**
 * A fake transaction client that records the atomic stock updates and the
 * ledger writes.
 *
 * `$queryRaw` is a tagged template: params arrive as (strings, ...values),
 * where the values are [decrement, inventoryPartId, organizationId] in the
 * order they appear in the SQL. It returns a post-write balance so the helper
 * can populate `quantityAfter`.
 */
function makeTx(balanceFor: (partId: string) => number | null = () => 100) {
  const updates: { id: string; organizationId: string; decrement: number }[] = []

  const $queryRaw = vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    const [decrement, id, organizationId] = values as [number, string, string]
    const balance = balanceFor(id)
    // Simulate "no row matched" (unknown part / other organization).
    if (balance === null) return []
    updates.push({ id, organizationId, decrement })
    return [{ quantity: balance }]
  })

  const createMany = vi.fn().mockResolvedValue({ count: 0 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = { $queryRaw, stockMovement: { createMany } } as any
  return { tx, updates, createMany, $queryRaw }
}

/** The ledger rows the helper attempted to persist. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ledger(createMany: any) {
  if (createMany.mock.calls.length === 0) return []
  return createMany.mock.calls[0][0].data
}

describe('reconcileInventoryForParts', () => {
  it('deducts stock for newly added linked parts (delta from empty)', async () => {
    const { tx, updates } = makeTx()
    await reconcileInventoryForParts(tx, ORG, [], [{ inventoryPartId: 'p1', quantity: 3 }], CTX)
    expect(updates).toEqual([{ id: 'p1', organizationId: ORG, decrement: 3 }])
  })

  it('ignores free-text parts that are not linked to inventory', async () => {
    const { tx, updates, createMany } = makeTx()
    await reconcileInventoryForParts(
      tx,
      ORG,
      [],
      [{ inventoryPartId: null, quantity: 5 }, { quantity: 2 }],
      CTX
    )
    expect(updates).toHaveLength(0)
    expect(createMany).not.toHaveBeenCalled()
  })

  it('restocks fully when a part is removed (delete work order)', async () => {
    const { tx, updates } = makeTx()
    await reconcileInventoryForParts(tx, ORG, [{ inventoryPartId: 'p1', quantity: 4 }], [], CTX)
    // Negative decrement = increment = restock.
    expect(updates).toEqual([{ id: 'p1', organizationId: ORG, decrement: -4 }])
  })

  it('applies only the delta when a quantity increases', async () => {
    const { tx, updates } = makeTx()
    await reconcileInventoryForParts(
      tx,
      ORG,
      [{ inventoryPartId: 'p1', quantity: 2 }],
      [{ inventoryPartId: 'p1', quantity: 5 }],
      CTX
    )
    expect(updates).toEqual([{ id: 'p1', organizationId: ORG, decrement: 3 }])
  })

  it('restocks the delta when a quantity decreases', async () => {
    const { tx, updates } = makeTx()
    await reconcileInventoryForParts(
      tx,
      ORG,
      [{ inventoryPartId: 'p1', quantity: 5 }],
      [{ inventoryPartId: 'p1', quantity: 2 }],
      CTX
    )
    expect(updates).toEqual([{ id: 'p1', organizationId: ORG, decrement: -3 }])
  })

  it('does nothing when the linked parts are unchanged (no double-count on re-save)', async () => {
    const { tx, updates, createMany } = makeTx()
    const same = [{ inventoryPartId: 'p1', quantity: 3 }]
    await reconcileInventoryForParts(tx, ORG, same, [...same], CTX)
    expect(updates).toHaveLength(0)
    expect(createMany).not.toHaveBeenCalled()
  })

  it('aggregates multiple lines that reference the same inventory part', async () => {
    const { tx, updates } = makeTx()
    await reconcileInventoryForParts(
      tx,
      ORG,
      [],
      [
        { inventoryPartId: 'p1', quantity: 2 },
        { inventoryPartId: 'p1', quantity: 3 },
      ],
      CTX
    )
    expect(updates).toEqual([{ id: 'p1', organizationId: ORG, decrement: 5 }])
  })

  it('handles several different parts changing at once', async () => {
    const { tx, updates } = makeTx()
    await reconcileInventoryForParts(
      tx,
      ORG,
      [
        { inventoryPartId: 'p1', quantity: 2 },
        { inventoryPartId: 'p2', quantity: 1 },
      ],
      [
        { inventoryPartId: 'p1', quantity: 2 }, // unchanged -> skipped
        { inventoryPartId: 'p3', quantity: 4 }, // new -> deduct 4
        // p2 removed -> restock 1
      ],
      CTX
    )
    expect(updates).toContainEqual({ id: 'p2', organizationId: ORG, decrement: -1 })
    expect(updates).toContainEqual({ id: 'p3', organizationId: ORG, decrement: 4 })
    expect(updates.find((m) => m.id === 'p1')).toBeUndefined()
    expect(updates).toHaveLength(2)
  })

  it('rounds fractional quantities to whole stock units', async () => {
    const { tx, updates } = makeTx()
    await reconcileInventoryForParts(
      tx,
      ORG,
      [],
      [
        { inventoryPartId: 'p1', quantity: 2.4 },
        { inventoryPartId: 'p2', quantity: 2.6 },
      ],
      CTX
    )
    expect(updates).toContainEqual({ id: 'p1', organizationId: ORG, decrement: 2 })
    expect(updates).toContainEqual({ id: 'p2', organizationId: ORG, decrement: 3 })
  })

  it("always scopes writes to the caller's organization", async () => {
    const { tx, updates } = makeTx()
    await reconcileInventoryForParts(tx, ORG, [], [{ inventoryPartId: 'p1', quantity: 1 }], CTX)
    expect(updates.every((m) => m.organizationId === ORG)).toBe(true)
  })

  // --- Ledger -------------------------------------------------------------

  it('records a signed ledger entry with the post-write balance', async () => {
    const { tx, createMany } = makeTx(() => 97)
    await reconcileInventoryForParts(tx, ORG, [], [{ inventoryPartId: 'p1', quantity: 3 }], CTX)
    expect(ledger(createMany)).toEqual([
      {
        inventoryPartId: 'p1',
        organizationId: ORG,
        delta: -3, // consumed
        quantityAfter: 97,
        reason: 'service_record',
        userId: 'user-1',
        serviceRecordId: 'svc-1',
        serviceRecordLabel: 'INV-1001',
        note: null,
      },
    ])
  })

  it('records a positive delta when stock is returned', async () => {
    const { tx, createMany } = makeTx(() => 104)
    await reconcileInventoryForParts(tx, ORG, [{ inventoryPartId: 'p1', quantity: 4 }], [], CTX)
    const rows = ledger(createMany)
    expect(rows).toHaveLength(1)
    expect(rows[0].delta).toBe(4)
    expect(rows[0].quantityAfter).toBe(104)
  })

  it('writes no ledger row when the part matched no row (wrong organization)', async () => {
    // balanceFor returns null -> UPDATE matched nothing.
    const { tx, createMany, updates } = makeTx(() => null)
    await reconcileInventoryForParts(tx, ORG, [], [{ inventoryPartId: 'ghost', quantity: 2 }], CTX)
    expect(updates).toHaveLength(0)
    expect(createMany).not.toHaveBeenCalled()
  })

  it('carries the caller-supplied reason and provenance onto every row', async () => {
    const { tx, createMany } = makeTx(() => 5)
    await reconcileInventoryForParts(tx, ORG, [], [{ inventoryPartId: 'p1', quantity: 1 }], {
      reason: 'quote_conversion',
      userId: 'user-9',
      serviceRecordId: 'svc-9',
      serviceRecordLabel: 'Q-42',
      note: 'converted from quote',
    })
    const rows = ledger(createMany)
    expect(rows[0]).toMatchObject({
      reason: 'quote_conversion',
      userId: 'user-9',
      serviceRecordId: 'svc-9',
      serviceRecordLabel: 'Q-42',
      note: 'converted from quote',
    })
  })
})
