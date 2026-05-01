import { CronJob } from "cron";
import { db } from "@/lib/db";
import {
  processDueDeliveries,
  recoverStuckDeliveries,
} from "@/features/webhooks/Lib/deliver";

/**
 * Webhook delivery retry cron — runs every minute. First sweeps any
 * "inflight" rows that look stuck (a worker crashed mid-delivery), then
 * picks up due retries and re-attempts them with HMAC signing.
 */
export function processWebhookDeliveries() {
  const job = new CronJob("* * * * *", async () => {
    try {
      const recovered = await recoverStuckDeliveries();
      if (recovered > 0) {
        console.warn(`[cron] Recovered ${recovered} stuck webhook deliveries`);
      }
      const count = await processDueDeliveries(100);
      if (count > 0) {
        console.warn(`[cron] Webhook deliveries processed: ${count}`);
      }
    } catch (err) {
      console.error("[cron] Webhook delivery processor failed:", err);
    }
  });
  job.start();
  console.warn("[cron] Webhook delivery processor started (every minute)");
}

/**
 * Webhook delivery retention cleanup — daily at 03:30 UTC. Drops delivery
 * rows older than WEBHOOK_DELIVERY_RETENTION_DAYS (default 30).
 */
export function cleanupWebhookDeliveries() {
  const job = new CronJob("30 3 * * *", async () => {
    try {
      const parsed = parseInt(process.env.WEBHOOK_DELIVERY_RETENTION_DAYS || "30", 10);
      const days = Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const result = await db.webhookDelivery.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        console.warn(
          `[cron] Webhook delivery cleanup: deleted ${result.count} rows older than ${days} days`,
        );
      }
    } catch (err) {
      console.error("[cron] Webhook delivery cleanup failed:", err);
    }
  });
  job.start();
}
