"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import {
  createWebhookSchema,
  updateWebhookSchema,
  WEBHOOK_EVENTS,
} from "../Schema/webhookSchema";
import { generateWebhookSecret, signPayload } from "../Lib/sign";
import { deliverOnce } from "../Lib/deliver";
import { checkWebhookUrl } from "../Lib/ssrf";

const SSRF_REASONS: Record<string, string> = {
  invalid_url: "URL is not valid",
  scheme_not_http: "Only http:// and https:// URLs are allowed",
  missing_host: "URL is missing a host",
  metadata_host: "Cloud metadata endpoints are not allowed",
  loopback_host: "Loopback hostnames are not allowed",
  private_ip: "Private IP addresses are not allowed",
  resolves_private: "URL resolves to a private network address",
  dns_resolution_failed: "Could not resolve URL host",
  dns_no_records: "No DNS records found for URL host",
};

function ssrfMessage(reason: string): string {
  return SSRF_REASONS[reason] ?? `URL was rejected: ${reason}`;
}

export async function getWebhooks() {
  return withAuth(
    async ({ organizationId }) => {
      const rows = await db.webhook.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { deliveries: true } },
        },
      });
      return rows.map((w) => ({
        id: w.id,
        name: w.name,
        url: w.url,
        description: w.description,
        events: safeParseEvents(w.events),
        isActive: w.isActive,
        lastTriggeredAt: w.lastTriggeredAt,
        lastSuccessAt: w.lastSuccessAt,
        lastFailureAt: w.lastFailureAt,
        failureCount: w.failureCount,
        autoDisabled: !w.isActive && w.failureCount >= 20,
        deliveryCount: w._count.deliveries,
        createdAt: w.createdAt,
      }));
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.SETTINGS },
      ],
    },
  );
}

export async function createWebhook(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const data = createWebhookSchema.parse(input);
      const safety = await checkWebhookUrl(data.url);
      if (!safety.ok) throw new Error(ssrfMessage(safety.reason));
      const secret = generateWebhookSecret();

      const webhook = await db.webhook.create({
        data: {
          name: data.name,
          url: data.url,
          description: data.description ?? null,
          events: JSON.stringify(data.events),
          isActive: data.isActive ?? true,
          secret,
          organizationId,
          createdById: userId,
        },
      });

      revalidatePath("/settings/webhooks");
      // Returned ONCE on creation; the secret never appears in subsequent reads.
      return {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        secret,
      };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: "webhook.create",
        entity: "webhook",
        entityId: result.id,
        message: `Created webhook ${result.name}`,
      }),
    },
  );
}

export async function updateWebhook(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = updateWebhookSchema.parse(input);
      const existing = await db.webhook.findFirst({
        where: { id: data.id, organizationId },
      });
      if (!existing) throw new Error("Webhook not found");

      if (data.url !== existing.url) {
        const safety = await checkWebhookUrl(data.url);
        if (!safety.ok) throw new Error(ssrfMessage(safety.reason));
      }

      const reEnabling = data.isActive === true && existing.isActive === false;

      const updated = await db.webhook.update({
        where: { id: data.id },
        data: {
          name: data.name,
          url: data.url,
          description: data.description ?? null,
          events: JSON.stringify(data.events),
          isActive: data.isActive ?? existing.isActive,
          ...(reEnabling ? { failureCount: 0 } : {}),
        },
      });

      revalidatePath("/settings/webhooks");
      return { id: updated.id };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: "webhook.update",
        entity: "webhook",
        entityId: result.id,
      }),
    },
  );
}

export async function toggleWebhook(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const existing = await db.webhook.findFirst({
        where: { id, organizationId },
      });
      if (!existing) throw new Error("Webhook not found");
      const reEnabling = !existing.isActive;
      const updated = await db.webhook.update({
        where: { id },
        data: {
          isActive: reEnabling,
          ...(reEnabling ? { failureCount: 0 } : {}),
        },
      });
      revalidatePath("/settings/webhooks");
      return { id: updated.id, isActive: updated.isActive };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
    },
  );
}

export async function deleteWebhook(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const existing = await db.webhook.findFirst({
        where: { id, organizationId },
      });
      if (!existing) throw new Error("Webhook not found");
      await db.webhook.delete({ where: { id } });
      revalidatePath("/settings/webhooks");
      return { id };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: "webhook.delete",
        entity: "webhook",
        entityId: result.id,
      }),
    },
  );
}

export async function rotateWebhookSecret(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const existing = await db.webhook.findFirst({
        where: { id, organizationId },
      });
      if (!existing) throw new Error("Webhook not found");
      const secret = generateWebhookSecret();
      await db.webhook.update({
        where: { id },
        data: { secret },
      });
      revalidatePath("/settings/webhooks");
      return { id, secret };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: "webhook.rotateSecret",
        entity: "webhook",
        entityId: result.id,
      }),
    },
  );
}

export async function sendTestWebhook(id: string) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const webhook = await db.webhook.findFirst({
        where: { id, organizationId },
      });
      if (!webhook) throw new Error("Webhook not found");

      const payload = JSON.stringify({
        id: `evt_test_${Date.now().toString(36)}`,
        event: "ping.test",
        createdAt: new Date().toISOString(),
        organizationId,
        userId,
        data: { test: true },
      });

      const delivery = await db.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event: "ping.test",
          payload,
          status: "pending",
        },
        select: { id: true },
      });

      await deliverOnce(delivery.id);
      revalidatePath("/settings/webhooks");
      return { deliveryId: delivery.id };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
    },
  );
}

export async function getWebhookDeliveries(webhookId: string, limit: number = 25) {
  return withAuth(
    async ({ organizationId }) => {
      const webhook = await db.webhook.findFirst({
        where: { id: webhookId, organizationId },
        select: { id: true },
      });
      if (!webhook) throw new Error("Webhook not found");

      const deliveries = await db.webhookDelivery.findMany({
        where: { webhookId },
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(limit, 1), 100),
        select: {
          id: true,
          event: true,
          status: true,
          statusCode: true,
          attempt: true,
          maxAttempts: true,
          errorMessage: true,
          durationMs: true,
          createdAt: true,
          deliveredAt: true,
          nextRetryAt: true,
        },
      });
      return deliveries;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.SETTINGS },
      ],
    },
  );
}

export async function retryWebhookDelivery(deliveryId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const delivery = await db.webhookDelivery.findFirst({
        where: { id: deliveryId, webhook: { organizationId } },
        select: { id: true, status: true },
      });
      if (!delivery) throw new Error("Delivery not found");

      // Reset to pending so deliverOnce will pick it up
      await db.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: "pending", nextRetryAt: null },
      });
      await deliverOnce(deliveryId);
      revalidatePath("/settings/webhooks");
      return { id: deliveryId };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
    },
  );
}

export async function getAvailableEvents() {
  return withAuth(
    async () => ({ events: [...WEBHOOK_EVENTS] }),
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.SETTINGS },
      ],
    },
  );
}

export async function getDeliveryPayload(deliveryId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const delivery = await db.webhookDelivery.findFirst({
        where: { id: deliveryId, webhook: { organizationId } },
        select: {
          id: true,
          event: true,
          payload: true,
          status: true,
          statusCode: true,
          responseBody: true,
          errorMessage: true,
          attempt: true,
          maxAttempts: true,
          durationMs: true,
          createdAt: true,
          deliveredAt: true,
        },
      });
      if (!delivery) throw new Error("Delivery not found");
      return delivery;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.SETTINGS },
      ],
    },
  );
}

function safeParseEvents(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Re-export for use in unit tests / route handlers
export { signPayload };
