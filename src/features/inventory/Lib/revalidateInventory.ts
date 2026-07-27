import { revalidatePath } from "next/cache";

/**
 * Invalidate every inventory view after stock has moved.
 *
 * Must use the "layout" variant. `revalidatePath("/inventory")` invalidates
 * only that exact route, leaving the `/inventory/[id]` detail pages stale —
 * including the RSC payload Next prefetches when the list renders its links.
 * The symptom is a part's history looking empty right after a movement, then
 * suddenly showing everything once the router cache happens to expire.
 *
 * Call from any action that changes `InventoryPart.quantity` or writes a
 * `StockMovement`.
 */
export function revalidateInventory() {
  revalidatePath("/inventory", "layout");
}
