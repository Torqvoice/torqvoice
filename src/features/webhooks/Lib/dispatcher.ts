import { db } from "@/lib/db";
import { WEBHOOK_EVENTS } from "../Schema/webhookSchema";
import { deliverOnce } from "./deliver";

const KNOWN = new Set<string>([...WEBHOOK_EVENTS, "*"]);

export type DispatchInput = {
  event: string;
  organizationId: string;
  entity?: string | null;
  entityId?: string | null;
  message?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: Record<string, any> | null;
  userId?: string | null;
};

/**
 * Dispatch an event to all webhooks in the org subscribed to it. Creates one
 * WebhookDelivery row per matching webhook, then attempts immediate delivery
 * in the background (fire-and-forget). Failed attempts get retried by the cron.
 *
 * No-op for unknown events so we don't generate deliveries for noise like
 * `auth.permissionDenied` or future audit-only actions.
 */
export async function dispatchWebhookEvent(input: DispatchInput): Promise<void> {
  if (!input.event || !input.organizationId) return;
  if (!KNOWN.has(input.event)) return;

  let webhooks: { id: string; events: string }[] = [];
  try {
    webhooks = await db.webhook.findMany({
      where: { organizationId: input.organizationId, isActive: true },
      select: { id: true, events: true },
    });
  } catch (err) {
    console.error("[webhooks] failed to load subscribers:", err);
    return;
  }
  if (webhooks.length === 0) return;

  const matching = webhooks.filter((w) => {
    let subscribed: string[] = [];
    try {
      subscribed = JSON.parse(w.events) as string[];
    } catch {
      return false;
    }
    return subscribed.includes("*") || subscribed.includes(input.event);
  });
  if (matching.length === 0) return;

  const payload = JSON.stringify({
    id: cryptoRandomId(),
    event: input.event,
    createdAt: new Date().toISOString(),
    organizationId: input.organizationId,
    entity: input.entity ?? null,
    entityId: input.entityId ?? null,
    message: input.message ?? null,
    userId: input.userId ?? null,
    data: input.data ?? null,
  });

  const created = await Promise.all(
    matching.map((w) =>
      db.webhookDelivery
        .create({
          data: {
            webhookId: w.id,
            event: input.event,
            payload,
            status: "pending",
          },
          select: { id: true },
        })
        .catch((err) => {
          console.error("[webhooks] failed to enqueue delivery:", err);
          return null;
        }),
    ),
  );

  // Fire-and-forget initial delivery. Failures are picked up by the retry cron.
  for (const row of created) {
    if (!row) continue;
    setImmediate(() => {
      deliverOnce(row.id).catch((err) => {
        console.error("[webhooks] delivery failed:", err);
      });
    });
  }
}

function cryptoRandomId(): string {
  return `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
