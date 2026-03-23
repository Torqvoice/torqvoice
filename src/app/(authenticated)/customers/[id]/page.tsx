import { getTranslations } from "next-intl/server";
import { getCustomer } from "@/features/customers/Actions/customerActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { getConversation } from "@/features/sms/Actions/smsActions";
import { getTelegramConversation } from "@/features/telegram/Actions/telegramActions";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures } from "@/lib/features";
import { getOrgTelegramBotUsername } from "@/lib/telegram";
import { CustomerDetailClient } from "./customer-detail-client";
import { PageHeader } from "@/components/page-header";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, settingsResult, layoutData] = await Promise.all([
    getCustomer(id),
    getSettings([SETTING_KEYS.UNIT_SYSTEM]),
    getLayoutData(),
  ]);

  if (!result.success || !result.data) {
    const t = await getTranslations("customers.detail");
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || t("notFound")}
          </p>
        </div>
      </>
    );
  }

  // Load SMS/Telegram features and conversation if enabled
  let smsEnabled = false;
  let telegramBotUsername: string | null = null;
  let telegramEnabled = false;
  let smsMessages: { id: string; direction: string; body: string; status: string; createdAt: string | Date; fromNumber: string; toNumber: string }[] = [];
  let smsNextCursor: string | null = null;
  let telegramMessages: { id: string; direction: string; body: string; status: string; createdAt: string | Date; chatId: string }[] = [];
  let telegramNextCursor: string | null = null;

  if (layoutData.status === "ok") {
    const features = await getFeatures(layoutData.organizationId);
    smsEnabled = features.sms;
    telegramEnabled = features.telegram;

    if (smsEnabled && result.data.phone) {
      const convResult = await getConversation(id);
      if (convResult.success && convResult.data) {
        smsMessages = convResult.data.messages;
        smsNextCursor = convResult.data.nextCursor;
      }
    }

    if (telegramEnabled) {
      telegramBotUsername = await getOrgTelegramBotUsername(layoutData.organizationId);
      const tgResult = await getTelegramConversation(id);
      if (tgResult.success && tgResult.data) {
        telegramMessages = tgResult.data.messages;
        telegramNextCursor = tgResult.data.nextCursor;
      }
    }
  }

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <CustomerDetailClient
          customer={result.data}
          unitSystem={(settingsResult.success && settingsResult.data?.[SETTING_KEYS.UNIT_SYSTEM] || "imperial") as "metric" | "imperial"}
          smsEnabled={smsEnabled}
          smsMessages={smsMessages}
          smsNextCursor={smsNextCursor}
          telegramEnabled={telegramEnabled}
          telegramBotUsername={telegramBotUsername}
          telegramMessages={telegramMessages}
          telegramNextCursor={telegramNextCursor}
          telegramChatId={result.data.telegramChatId ?? null}
        />
      </div>
    </>
  );
}
