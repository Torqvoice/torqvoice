import { ZodError } from "zod";
import { getCachedSession, getCachedMembership } from "./cached-session";
import { db } from "./db";
import type { PermissionInput } from "./permissions";
import { hasAllPermissions } from "./permissions";
import { logAudit } from "@/lib/audit";
import type { AuditEvent } from "@/lib/audit";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type AuthContext = {
  userId: string;
  organizationId: string;
  role: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;
};

type AuditBuilder<T> = (args: { ctx: AuthContext; result: T }) => AuditEvent | null | undefined;

type WithAuthOptions<T = unknown> = {
  requiredPermissions?: PermissionInput[];
  // Optional audit config. If provided, runs after successful action.
  audit?: AuditEvent | AuditBuilder<T>;
};

export async function withAuth<T>(
  action: (ctx: AuthContext) => Promise<T>,
  options: WithAuthOptions<T> = {},
): Promise<ActionResult<T>> {
  try {
    const session = await getCachedSession();

    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isSuperAdmin: true },
    });

    const isSuperAdmin = user?.isSuperAdmin ?? false;

    const membership = await getCachedMembership(session.user.id);

    if (!membership?.organizationId) {
      return { success: false, error: "No organization found" };
    }

    const isOwnerOrAdmin = membership?.role === "owner" || membership?.role === "admin";
    const roleIsAdmin = membership?.customRole?.isAdmin === true;

    // Check permissions if required (super admins bypass all permission checks)
    if (!isSuperAdmin && options.requiredPermissions && options.requiredPermissions.length > 0) {
      // Members without a custom role have full access (no restrictions)
      const hasNoCustomRole = !membership?.roleId;

      if (!isOwnerOrAdmin && !roleIsAdmin && !hasNoCustomRole) {
        const userPermissions = membership?.customRole?.permissions ?? [];
        if (!hasAllPermissions(userPermissions, options.requiredPermissions)) {
          return { success: false, error: "Insufficient permissions" };
        }
      }
    }

    const ctx: AuthContext = {
      userId: session.user.id,
      organizationId: membership.organizationId,
      role: isSuperAdmin ? "super_admin" : (membership?.role ?? "member"),
      isSuperAdmin,
      isAdmin: isSuperAdmin || isOwnerOrAdmin || roleIsAdmin,
    };
    const data = await action(ctx);

    // Post-success audit logging (best-effort, non-blocking)
    try {
      if (options.audit) {
        const event = typeof options.audit === "function"
          ? (options.audit as AuditBuilder<T>)({ ctx, result: data })
          : options.audit;
        if (event && event.action) {
          await logAudit(ctx, event);
        }
      }
    } catch (e) {
      console.error("[withAuth:audit] Failed to write audit log:", e);
    }

    return { success: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      const messages = error.issues.map((e) => {
        const field = e.path.join(".");
        return field ? `${field}: ${e.message}` : e.message;
      });
      const message = messages.join(". ");
      console.error("[withAuth] Validation error:", message);
      return { success: false, error: message };
    }
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("[withAuth] Error:", message);
    return { success: false, error: message };
  }
}
