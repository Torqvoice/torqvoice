import { db } from "@/lib/db";

export type AuditEvent = {
  action: string;
  entity?: string;
  entityId?: string;
  message?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any> | null;
  ip?: string | null;
  userAgent?: string | null;
};

export async function logAudit(
  ctx: { userId: string; organizationId: string },
  event: AuditEvent,
) {
  try {
    await db.auditLog.create({
      data: {
        userId: ctx.userId || null,
        organizationId: ctx.organizationId || null,
        action: event.action,
        entity: event.entity ?? null,
        entityId: event.entityId ?? null,
        message: event.message ?? null,
        metadata: event.metadata ?? undefined,
        ip: event.ip ?? null,
        userAgent: event.userAgent ?? null,
      },
    });
  } catch (err) {
    // Don't block core flows due to logging failure
    console.error("[audit] failed to write log:", err);
  }
}

