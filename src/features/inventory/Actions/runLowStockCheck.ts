"use server";

import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { processOrgLowStock } from "@/lib/cron/low-stock-alerts";

/**
 * Run the low-stock evaluation on demand.
 *
 * Backs the "Check now" button in Settings → Alerts. Without it the only way to
 * confirm the feature works is to change stock and wait for the sweep, which
 * makes a correctly-configured system look broken.
 *
 * Uses the same code path as the schedule, so what you see here is exactly what
 * the automated run does — including the hysteresis, which is why a second
 * click usually reports 0: everything currently low has already been reported.
 */
export async function runLowStockCheck() {
  return withAuth(
    async ({ organizationId }) => {
      const result = await processOrgLowStock(organizationId);
      if (result.skipped) {
        return { enabled: false as const, alerted: 0, rearmed: 0, emailed: false };
      }
      return {
        enabled: true as const,
        alerted: result.alerted,
        rearmed: result.rearmed,
        emailed: result.emailed,
      };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
    },
  );
}
