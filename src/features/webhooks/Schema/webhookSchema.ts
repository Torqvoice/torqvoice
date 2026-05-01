import { z } from "zod";

/**
 * Catalog of webhook events. Each entry maps to an audit-log action name —
 * `logAudit` fans these out to subscribed webhooks.
 *
 * "*" is a special wildcard that matches all events.
 */
export const WEBHOOK_EVENTS = [
  // Customer
  "customer.create",
  "customer.update",
  "customer.delete",
  // Vehicle
  "vehicle.create",
  "vehicle.update",
  "vehicle.delete",
  "vehicle.archive",
  "vehicle.unarchive",
  // Service / work order
  "service.create",
  "service.update",
  "service.delete",
  "service.status",
  // Quote
  "quote.create",
  "quote.update",
  "quote.delete",
  "quote.status",
  "quote.convert",
  // Payment
  "payment.create",
  "payment.delete",
  // Inspection
  "inspection.create",
  "inspection.complete",
  "inspection.delete",
  // Inventory
  "inventory.create",
  "inventory.update",
  "inventory.delete",
  // Finding
  "finding.create",
  "finding.update",
  "finding.resolve",
  "finding.delete",
  // Diagnostic
  "ping.test",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number] | "*";

const URL_RX = /^https?:\/\//i;

export const createWebhookSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  url: z
    .string()
    .trim()
    .min(1, "URL is required")
    .max(2048)
    .refine((v) => URL_RX.test(v), "URL must start with http:// or https://"),
  description: z.string().trim().max(500).optional().nullable(),
  events: z
    .array(z.string())
    .min(1, "Select at least one event")
    .refine(
      (arr) => arr.every((e) => e === "*" || (WEBHOOK_EVENTS as readonly string[]).includes(e)),
      "Unknown event",
    ),
  isActive: z.boolean().optional(),
});

export const updateWebhookSchema = createWebhookSchema.extend({
  id: z.string().min(1),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

/** Group events for the settings UI checkbox grid. */
export const WEBHOOK_EVENT_GROUPS: Array<{ key: string; events: readonly WebhookEvent[] }> = [
  { key: "customers", events: ["customer.create", "customer.update", "customer.delete"] },
  {
    key: "vehicles",
    events: [
      "vehicle.create",
      "vehicle.update",
      "vehicle.delete",
      "vehicle.archive",
      "vehicle.unarchive",
    ],
  },
  {
    key: "services",
    events: ["service.create", "service.update", "service.status", "service.delete"],
  },
  {
    key: "quotes",
    events: ["quote.create", "quote.update", "quote.status", "quote.convert", "quote.delete"],
  },
  { key: "payments", events: ["payment.create", "payment.delete"] },
  { key: "inspections", events: ["inspection.create", "inspection.complete", "inspection.delete"] },
  { key: "inventory", events: ["inventory.create", "inventory.update", "inventory.delete"] },
  { key: "findings", events: ["finding.create", "finding.update", "finding.resolve", "finding.delete"] },
];
