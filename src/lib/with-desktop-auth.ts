import { NextResponse } from "next/server";
import { db } from "./db";
import { hasAllPermissions, type PermissionInput } from "./permissions";
import { rateLimit } from "./rate-limit";

export type DesktopAuthContext = {
  userId: string;
  organizationId: string;
  role: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;
};

type WithDesktopAuthOptions = {
  requiredPermissions?: PermissionInput[];
};

export async function withDesktopAuth(
  request: Request,
  handler: (ctx: DesktopAuthContext) => Promise<NextResponse>,
  options: WithDesktopAuthOptions = {},
): Promise<NextResponse> {
  // Rate limit
  const rateLimitResult = rateLimit(request);
  if (rateLimitResult) return rateLimitResult;

  // Extract Bearer token
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  // Look up session (expiry checked)
  const session = await db.session.findFirst({
    where: { token, expiresAt: { gt: new Date() } },
    select: { userId: true },
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check super admin status
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { isSuperAdmin: true },
  });

  const isSuperAdmin = user?.isSuperAdmin ?? false;

  // Get org membership (same pattern as getCachedMembership but using header)
  const activeOrgId = request.headers.get("X-Org-Id");

  const memberSelect = {
    organizationId: true,
    role: true,
    roleId: true,
    customRole: {
      select: { isAdmin: true, permissions: { select: { action: true, subject: true } } },
    },
  } as const;

  let membership;
  if (activeOrgId) {
    membership = await db.organizationMember.findFirst({
      where: { userId: session.userId, organizationId: activeOrgId },
      select: memberSelect,
    });
  }
  if (!membership) {
    membership = await db.organizationMember.findFirst({
      where: { userId: session.userId },
      select: memberSelect,
    });
  }

  if (!membership?.organizationId) {
    return NextResponse.json({ error: "No organization found" }, { status: 403 });
  }

  const isOwnerOrAdmin = membership.role === "owner" || membership.role === "admin";
  const roleIsAdmin = membership.customRole?.isAdmin === true;

  // Check permissions (super admins bypass all permission checks)
  if (!isSuperAdmin && options.requiredPermissions && options.requiredPermissions.length > 0) {
    const hasNoCustomRole = !membership.roleId;

    if (!isOwnerOrAdmin && !roleIsAdmin && !hasNoCustomRole) {
      const userPermissions = membership.customRole?.permissions ?? [];
      if (!hasAllPermissions(userPermissions, options.requiredPermissions)) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
      }
    }
  }

  return handler({
    userId: session.userId,
    organizationId: membership.organizationId,
    role: isSuperAdmin ? "super_admin" : (membership.role ?? "member"),
    isSuperAdmin,
    isAdmin: isSuperAdmin || isOwnerOrAdmin || roleIsAdmin,
  });
}
