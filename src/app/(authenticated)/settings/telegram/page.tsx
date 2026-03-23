import { getTelegramSettings } from "@/features/telegram/Actions/telegramSettingsActions";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures, isCloudMode } from "@/lib/features";
import { TelegramSettingsForm } from "@/features/telegram/Components/TelegramSettingsForm";
import { FeatureLockedMessage } from "../feature-locked-message";
import { redirect } from "next/navigation";

export default async function TelegramSettingsPage() {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  const features = await getFeatures(data.organizationId);

  if (!features.telegram) {
    return (
      <FeatureLockedMessage
        feature="Telegram Messaging"
        description="Send and receive Telegram messages with your customers directly from Torqvoice."
        isCloud={isCloudMode()}
      />
    );
  }

  const result = await getTelegramSettings();
  const settings = result.success && result.data ? result.data : {};
  const telegramEnabled = settings["telegram.enabled"] === "true";

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  return <TelegramSettingsForm initial={settings} appUrl={appUrl} initialEnabled={telegramEnabled} />;
}
