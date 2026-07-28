import { revalidateInventory } from "./revalidateInventory";
import { processOrgLowStock } from "@/lib/cron/low-stock-alerts";

/**
 * Call after anything changes stock: a job consuming parts, a quote being
 * converted, a manual edit, a bulk markup.
 *
 * Does two things:
 *
 *  1. Invalidates the cached inventory views (see revalidateInventory).
 *  2. Evaluates low-stock alerts immediately.
 *
 * The second is why alerts feel instant. The hourly sweep alone meant a part
 * dropping below its reorder point at 09:20 produced nothing until 10:15 —
 * long enough that it reads as broken. The check is deliberately cheap: it
 * only loads parts that are currently low or still carrying an alert marker,
 * which are the only rows whose state can change.
 *
 * Alerting must never break the user's actual operation, so failures are
 * logged and swallowed — the hourly sweep remains the backstop.
 */
export async function onInventoryChanged(organizationId: string) {
  revalidateInventory();

  try {
    await processOrgLowStock(organizationId);
  } catch (error) {
    console.error("[low-stock] immediate check failed:", error);
  }
}
