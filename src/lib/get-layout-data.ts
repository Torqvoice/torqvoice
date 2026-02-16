import { getCachedSession, getCachedMembership } from "./cached-session";
import { db } from "./db";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";

type AuthResult =
  | { status: "unauthenticated" }
  | { status: "no-organization" }
  | {
      status: "ok";
      userId: string;
      organizationId: string;
      role: string;
      isSuperAdmin: boolean;
      companyLogo: string | undefined;
      dateFormat: string | undefined;
      timeFormat: string | undefined;
      timezone: string | undefined;
      organizations: { id: string; name: string; role: string }[];
    };

export async function getLayoutData(): Promise<AuthResult> {
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

  const [orgSettings, memberships] = await Promise.all([
    membership
      ? db.appSetting.findMany({
          where: {
            organizationId: membership.organizationId,
            key: {
              in: [
                SETTING_KEYS.COMPANY_LOGO,
                SETTING_KEYS.DATE_FORMAT,
                SETTING_KEYS.TIME_FORMAT,
                SETTING_KEYS.TIMEZONE,
              ],
            },
          },
          select: { key: true, value: true },
        })
      : null,
    db.organizationMember.findMany({
      where: { userId: session.user.id },
      select: {
        role: true,
        organization: { select: { id: true, name: true } },
      },
    }),
  ]);

  const orgMap = new Map(orgSettings?.map((s) => [s.key, s.value]) ?? []);

  return {
    status: "ok",
    userId: session.user.id,
    organizationId: membership?.organizationId ?? "",
    role: isSuperAdmin ? "super_admin" : (membership?.role ?? "member"),
    isSuperAdmin,
    companyLogo: orgMap.get(SETTING_KEYS.COMPANY_LOGO) || undefined,
    dateFormat: orgMap.get(SETTING_KEYS.DATE_FORMAT) || undefined,
    timeFormat: orgMap.get(SETTING_KEYS.TIME_FORMAT) || undefined,
    timezone: orgMap.get(SETTING_KEYS.TIMEZONE) || undefined,
    organizations: memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      role: m.role,
    })),
  };
}
