import { getCachedSession } from "./cached-session";
import { db } from "./db";
import type { ActionResult } from "./with-auth";

type SuperAdminContext = {
  userId: string;
};

export async function withSuperAdmin<T>(
  action: (ctx: SuperAdminContext) => Promise<T>,
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

    if (!user?.isSuperAdmin) {
      return { success: false, error: "Forbidden" };
    }

    const data = await action({ userId: session.user.id });
    return { success: true, data };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("[withSuperAdmin] Error:", message);
    return { success: false, error: message };
  }
}
