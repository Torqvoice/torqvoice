import { getCachedSession, getCachedMembership } from "./cached-session";
import { db } from "./db";
import type { PermissionInput } from "./permissions";
import { hasAllPermissions } from "./permissions";

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
};

type WithAuthOptions = {
  requiredPermissions?: PermissionInput[];
};

export async function withAuth<T>(
  action: (ctx: AuthContext) => Promise<T>,
  options: WithAuthOptions = {},
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

    // Super admins can bypass the organization requirement
    if (!membership && !isSuperAdmin) {
      return { success: false, error: "No organization found" };
    }

    // Check permissions if required (super admins bypass all permission checks)
    if (!isSuperAdmin && options.requiredPermissions && options.requiredPermissions.length > 0) {
      const isOwnerOrAdmin = membership?.role === "owner" || membership?.role === "admin";
      const roleIsAdmin = membership?.customRole?.isAdmin === true;

      if (!isOwnerOrAdmin && !roleIsAdmin) {
        const userPermissions = membership?.customRole?.permissions ?? [];
        if (!hasAllPermissions(userPermissions, options.requiredPermissions)) {
          return { success: false, error: "Insufficient permissions" };
        }
      }
    }

    const data = await action({
      userId: session.user.id,
      organizationId: membership?.organizationId ?? "",
      role: isSuperAdmin ? "super_admin" : (membership?.role ?? "member"),
      isSuperAdmin,
    });
    return { success: true, data };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("[withAuth] Error:", message);
    return { success: false, error: message };
  }
}
