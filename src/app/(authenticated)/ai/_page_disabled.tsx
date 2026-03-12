import { getAuthContext } from "@/lib/get-auth-context";
import { getFeatures } from "@/lib/features";
import { db } from "@/lib/db";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { PageHeader } from "@/components/page-header";
import { AiChatPage } from "@/features/ai/Components/AiChatPage";
import { getTranslations } from "next-intl/server";
import { getCachedMembership } from "@/lib/cached-session";
import { hasPermission, PermissionAction, PermissionSubject } from "@/lib/permissions";

export default async function AiAssistantPage() {
  const authContext = await getAuthContext();
  const orgId = authContext?.organizationId;
  const t = await getTranslations("aiChat");

  let aiEnabled = false;
  if (orgId) {
    const [features, aiSettings] = await Promise.all([
      getFeatures(orgId),
      db.appSetting.findMany({
        where: {
          organizationId: orgId,
          key: { in: [SETTING_KEYS.AI_ENABLED, SETTING_KEYS.AI_API_KEY] },
        },
        select: { key: true, value: true },
      }),
    ]);
    const aiMap = Object.fromEntries(aiSettings.map((s) => [s.key, s.value]));
    aiEnabled =
      features?.ai === true &&
      aiMap[SETTING_KEYS.AI_ENABLED] === "true" &&
      !!aiMap[SETTING_KEYS.AI_API_KEY];
  }

  // Check permission for custom role users
  if (aiEnabled && authContext?.userId) {
    const role = authContext.role;
    const isOwnerOrAdmin = role === "owner" || role === "admin" || role === "super_admin";
    if (!isOwnerOrAdmin) {
      const membership = await getCachedMembership(authContext.userId);
      if (membership?.roleId) {
        const userPermissions = membership?.customRole?.permissions ?? [];
        const canAccessAi = hasPermission(userPermissions, {
          action: PermissionAction.READ,
          subject: PermissionSubject.AI_ASSISTANT,
        });
        if (!canAccessAi) {
          aiEnabled = false;
        }
      }
    }
  }

  if (!aiEnabled) {
    return (
      <div className="flex h-svh flex-col overflow-hidden">
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">{t("notEnabled")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <PageHeader />
      <AiChatPage />
    </div>
  );
}
