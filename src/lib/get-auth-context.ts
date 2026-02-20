import { getCachedSession, getCachedMembership } from "./cached-session";
import { db } from "./db";
import type { AuthContext } from "./with-auth";

type AuthContextResult =
  | { status: "unauthenticated" }
  | { status: "no-organization" }
  | { status: "ok"; context: AuthContext };

export async function getAuthContext(): Promise<AuthContext | null> {
  const result = await getAuthContextDetailed();
  if (result.status !== "ok") return null;
  return result.context;
}

export async function getAuthContextDetailed(): Promise<AuthContextResult> {
  const session = await getCachedSession();

  if (!session?.user?.id) return { status: "unauthenticated" };

  const [membership, user] = await Promise.all([
    getCachedMembership(session.user.id),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { isSuperAdmin: true },
    }),
  ]);

  const isSuperAdmin = user?.isSuperAdmin ?? false;

  if (!membership && !isSuperAdmin) return { status: "no-organization" };

  return {
    status: "ok",
    context: {
      userId: session.user.id,
      organizationId: membership?.organizationId ?? null,
      role: isSuperAdmin ? "super_admin" : (membership?.role ?? "member"),
      isSuperAdmin,
    },
  };
}
