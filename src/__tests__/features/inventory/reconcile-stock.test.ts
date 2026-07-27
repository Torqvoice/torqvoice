/**
 * Tests for reconcileInventoryForParts — the single source of truth for how
 * work-order parts move inventory stock.
 *
 * The helper must apply the NET delta between a record's previous and next
 * linked parts: adding/increasing consumes stock, removing/reducing restocks,
 * and unchanged quantities touch nothing. Every write is scoped to the
 * caller's organization and applied atomically via `{ decrement }`.
 */

import { describe, it, expect, vi } from "vitest";
import { reconcileInventoryForParts } from "@/features/inventory/Lib/reconcileStock";

const ORG = "org-1";

/** A fake transaction client that records inventoryPart.updateMany calls. */
function makeTx() {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = { inventoryPart: { updateMany } } as any;
  return { tx, updateMany };
}

/** Extract {id, decrement} pairs from recorded updateMany calls. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function movements(updateMany: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return updateMany.mock.calls.map((c: any[]) => ({
    id: c[0].where.id,
    organizationId: c[0].where.organizationId,
    decrement: c[0].data.quantity.decrement,
  }));
}

describe("reconcileInventoryForParts", () => {
  it("deducts stock for newly added linked parts (delta from empty)", async () => {
    const { tx, updateMany } = makeTx();
    await reconcileInventoryForParts(tx, ORG, [], [{ inventoryPartId: "p1", quantity: 3 }]);
    expect(movements(updateMany)).toEqual([{ id: "p1", organizationId: ORG, decrement: 3 }]);
  });

  it("ignores free-text parts that are not linked to inventory", async () => {
    const { tx, updateMany } = makeTx();
    await reconcileInventoryForParts(tx, ORG, [], [
      { inventoryPartId: null, quantity: 5 },
      { quantity: 2 },
    ]);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("restocks fully when a part is removed (delete work order)", async () => {
    const { tx, updateMany } = makeTx();
    await reconcileInventoryForParts(tx, ORG, [{ inventoryPartId: "p1", quantity: 4 }], []);
    // Negative decrement = increment = restock.
    expect(movements(updateMany)).toEqual([{ id: "p1", organizationId: ORG, decrement: -4 }]);
  });

  it("applies only the delta when a quantity increases", async () => {
    const { tx, updateMany } = makeTx();
    await reconcileInventoryForParts(
      tx,
      ORG,
      [{ inventoryPartId: "p1", quantity: 2 }],
      [{ inventoryPartId: "p1", quantity: 5 }],
    );
    expect(movements(updateMany)).toEqual([{ id: "p1", organizationId: ORG, decrement: 3 }]);
  });

  it("restocks the delta when a quantity decreases", async () => {
    const { tx, updateMany } = makeTx();
    await reconcileInventoryForParts(
      tx,
      ORG,
      [{ inventoryPartId: "p1", quantity: 5 }],
      [{ inventoryPartId: "p1", quantity: 2 }],
    );
    expect(movements(updateMany)).toEqual([{ id: "p1", organizationId: ORG, decrement: -3 }]);
  });

  it("does nothing when the linked parts are unchanged (no double-count on re-save)", async () => {
    const { tx, updateMany } = makeTx();
    const same = [{ inventoryPartId: "p1", quantity: 3 }];
    await reconcileInventoryForParts(tx, ORG, same, [...same]);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("aggregates multiple lines that reference the same inventory part", async () => {
    const { tx, updateMany } = makeTx();
    await reconcileInventoryForParts(tx, ORG, [], [
      { inventoryPartId: "p1", quantity: 2 },
      { inventoryPartId: "p1", quantity: 3 },
    ]);
    expect(movements(updateMany)).toEqual([{ id: "p1", organizationId: ORG, decrement: 5 }]);
  });

  it("handles several different parts changing at once", async () => {
    const { tx, updateMany } = makeTx();
    await reconcileInventoryForParts(
      tx,
      ORG,
      [
        { inventoryPartId: "p1", quantity: 2 },
        { inventoryPartId: "p2", quantity: 1 },
      ],
      [
        { inventoryPartId: "p1", quantity: 2 }, // unchanged -> skipped
        { inventoryPartId: "p3", quantity: 4 }, // new -> deduct 4
        // p2 removed -> restock 1
      ],
    );
    const moves = movements(updateMany);
    expect(moves).toContainEqual({ id: "p2", organizationId: ORG, decrement: -1 });
    expect(moves).toContainEqual({ id: "p3", organizationId: ORG, decrement: 4 });
    expect(moves.find((m: { id: string }) => m.id === "p1")).toBeUndefined();
    expect(moves).toHaveLength(2);
  });

  it("rounds fractional quantities to whole stock units", async () => {
    const { tx, updateMany } = makeTx();
    await reconcileInventoryForParts(tx, ORG, [], [
      { inventoryPartId: "p1", quantity: 2.4 },
      { inventoryPartId: "p2", quantity: 2.6 },
    ]);
    const moves = movements(updateMany);
    expect(moves).toContainEqual({ id: "p1", organizationId: ORG, decrement: 2 });
    expect(moves).toContainEqual({ id: "p2", organizationId: ORG, decrement: 3 });
  });

  it("always scopes writes to the caller's organization", async () => {
    const { tx, updateMany } = makeTx();
    await reconcileInventoryForParts(tx, ORG, [], [{ inventoryPartId: "p1", quantity: 1 }]);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG }) }),
    );
  });
});
