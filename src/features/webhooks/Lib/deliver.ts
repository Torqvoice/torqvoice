import { db } from "@/lib/db";
import { signPayload } from "./sign";
import { checkWebhookUrl } from "./ssrf";

const DELIVERY_TIMEOUT_MS = 10_000;
const RESPONSE_TRUNCATE_BYTES = 4096;
const MAX_PAYLOAD_BYTES = 256 * 1024;
const USER_AGENT = "Torqvoice-Webhooks/1.0";
const AUTO_DISABLE_THRESHOLD = 20;
const STUCK_INFLIGHT_MS = 5 * 60 * 1000;

/**
 * attempt 1 → ~1m, 2 → ~5m, 3 → ~30m, 4 → ~2h, 5 → ~6h.
 */
function nextBackoff(attempt: number): Date {
  const base = [60, 300, 1800, 7200, 21_600][Math.min(attempt - 1, 4)] ?? 21_600;
  const jitter = Math.floor(Math.random() * Math.min(base * 0.2, 60));
  return new Date(Date.now() + (base + jitter) * 1000);
}

/**
 * Atomic claim: flip status from pending/retrying → inflight only if no other
 * worker grabbed it. Returns false if another process already owns this row.
 */
async function claimDelivery(deliveryId: string): Promise<boolean> {
  const r = await db.webhookDelivery.updateMany({
    where: { id: deliveryId, status: { in: ["pending", "retrying"] } },
    data: { status: "inflight" },
  });
  return r.count === 1;
}

/**
 * Recover deliveries left in "inflight" by a crashed/killed worker. Anything
 * older than STUCK_INFLIGHT_MS gets flipped back to "retrying" so the next
 * cron tick will pick it up.
 */
export async function recoverStuckDeliveries(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_INFLIGHT_MS);
  const r = await db.webhookDelivery.updateMany({
    where: { status: "inflight", updatedAt: { lt: cutoff } },
    data: { status: "retrying", nextRetryAt: new Date() },
  });
  return r.count;
}

/**
 * Attempt one HTTP delivery. Atomically claims the row first; updates the
 * row in place with the outcome. Never throws.
 */
export async function deliverOnce(deliveryId: string): Promise<void> {
  const claimed = await claimDelivery(deliveryId);
  if (!claimed) return;

  const delivery = await db.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  });
  if (!delivery || !delivery.webhook) return;

  if (!delivery.webhook.isActive) {
    await db.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: "failed", errorMessage: "webhook is disabled" },
    });
    return;
  }

  const attempt = delivery.attempt + 1;
  const startedAt = Date.now();
  const body = delivery.payload;

  if (Buffer.byteLength(body, "utf8") > MAX_PAYLOAD_BYTES) {
    await finalize(delivery.id, delivery.webhookId, attempt, delivery.maxAttempts, {
      ok: false,
      statusCode: null,
      responseBody: null,
      errorMessage: "payload exceeds maximum allowed size",
      durationMs: 0,
      forceFinal: true,
    });
    return;
  }

  const safety = await checkWebhookUrl(delivery.webhook.url);
  if (!safety.ok) {
    await finalize(delivery.id, delivery.webhookId, attempt, delivery.maxAttempts, {
      ok: false,
      statusCode: null,
      responseBody: null,
      errorMessage: `target rejected: ${safety.reason}`,
      durationMs: 0,
      forceFinal: true,
    });
    return;
  }

  const signature = signPayload(delivery.webhook.secret, body);
  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;
  let ok = false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const res = await fetch(delivery.webhook.url, {
      method: "POST",
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "content-type": "application/json",
        "user-agent": USER_AGENT,
        "x-torqvoice-event": delivery.event,
        "x-torqvoice-delivery": delivery.id,
        "x-torqvoice-signature": signature,
        "x-torqvoice-attempt": String(attempt),
      },
      body,
    });
    statusCode = res.status;
    if (statusCode >= 300 && statusCode < 400) {
      errorMessage = "redirects are not followed for security";
      ok = false;
    } else {
      const text = await res.text().catch(() => "");
      responseBody = text.slice(0, RESPONSE_TRUNCATE_BYTES);
      ok = res.ok;
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      errorMessage = `timeout after ${DELIVERY_TIMEOUT_MS}ms`;
    } else {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
  } finally {
    clearTimeout(timeout);
  }

  await finalize(delivery.id, delivery.webhookId, attempt, delivery.maxAttempts, {
    ok,
    statusCode,
    responseBody,
    errorMessage,
    durationMs: Date.now() - startedAt,
  });
}

async function finalize(
  deliveryId: string,
  webhookId: string,
  attempt: number,
  maxAttempts: number,
  outcome: {
    ok: boolean;
    statusCode: number | null;
    responseBody: string | null;
    errorMessage: string | null;
    durationMs: number;
    forceFinal?: boolean;
  },
): Promise<void> {
  const finalAttempt = outcome.forceFinal || attempt >= maxAttempts;
  const status = outcome.ok ? "success" : finalAttempt ? "failed" : "retrying";
  const nextRetryAt = outcome.ok || finalAttempt ? null : nextBackoff(attempt);

  await db.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      attempt,
      status,
      statusCode: outcome.statusCode,
      responseBody: outcome.responseBody,
      errorMessage: outcome.errorMessage,
      durationMs: outcome.durationMs,
      nextRetryAt,
      deliveredAt: outcome.ok ? new Date() : undefined,
    },
  });

  if (outcome.ok) {
    await db.webhook.update({
      where: { id: webhookId },
      data: {
        lastTriggeredAt: new Date(),
        lastSuccessAt: new Date(),
        failureCount: 0,
      },
    });
    return;
  }

  if (!finalAttempt) {
    await db.webhook.update({
      where: { id: webhookId },
      data: { lastTriggeredAt: new Date() },
    });
    return;
  }

  // Permanent failure — bump counter and auto-disable past the threshold so
  // we stop hammering a clearly-broken endpoint.
  const updated = await db.webhook.update({
    where: { id: webhookId },
    data: {
      lastTriggeredAt: new Date(),
      lastFailureAt: new Date(),
      failureCount: { increment: 1 },
    },
    select: { failureCount: true, isActive: true },
  });

  if (updated.isActive && updated.failureCount >= AUTO_DISABLE_THRESHOLD) {
    await db.webhook.update({
      where: { id: webhookId },
      data: { isActive: false },
    });
  }
}

export async function processDueDeliveries(limit: number = 100): Promise<number> {
  const due = await db.webhookDelivery.findMany({
    where: {
      status: { in: ["pending", "retrying"] },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  await Promise.allSettled(due.map((d) => deliverOnce(d.id)));
  return due.length;
}

export const __TEST__ = { nextBackoff, AUTO_DISABLE_THRESHOLD, MAX_PAYLOAD_BYTES };
