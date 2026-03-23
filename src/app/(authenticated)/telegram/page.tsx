import { Suspense } from "react";
import { getAuthContext } from "@/lib/get-auth-context";
import { getFeatures, isCloudMode } from "@/lib/features";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getRecentTelegramThreads } from "@/features/telegram/Actions/telegramThreadActions";
import { getTelegramSettings } from "@/features/telegram/Actions/telegramSettingsActions";
import { TelegramMessagesClient } from "@/features/telegram/Components/TelegramMessagesClient";
import { PageHeader } from "@/components/page-header";
import { FeatureLockedMessage } from "../settings/feature-locked-message";
import { TelegramNotConfiguredMessage } from "./telegram-not-configured-message";

export default async function TelegramPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/sign-in");

  const features = await getFeatures(ctx.organizationId);

  if (!features.telegram) {
    const t = await getTranslations("telegramMessages.page");
    return (
      <>
        <PageHeader />
        <div className="flex flex-1 flex-col p-4 pt-0">
          <FeatureLockedMessage
            feature={t("featureName")}
            description={t("featureDescription")}
            isCloud={isCloudMode()}
          />
        </div>
      </>
    );
  }

  const settingsResult = await getTelegramSettings();
  const settings =
    settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const hasBot = !!settings["telegram.botToken"];

  if (!hasBot) {
    return (
      <>
        <PageHeader />
        <div className="flex flex-1 flex-col p-4 pt-0">
          <TelegramNotConfiguredMessage />
        </div>
      </>
    );
  }

  const threadsResult = await getRecentTelegramThreads();
  const threads =
    threadsResult.success && threadsResult.data
      ? threadsResult.data.threads
      : [];
  const hasMore =
    threadsResult.success && threadsResult.data
      ? threadsResult.data.hasMore
      : false;

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col p-4 pt-0">
        <Suspense>
          <TelegramMessagesClient
            initialThreads={threads}
            initialHasMore={hasMore}
          />
        </Suspense>
      </div>
    </>
  );
}
