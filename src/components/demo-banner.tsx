import { isDemoMode } from "@/lib/demo";
import { useTranslations } from "next-intl";

export function DemoBanner() {
  const t = useTranslations("common.shared");
  if (!isDemoMode) return null;

  return (
    <div className="bg-amber-500 text-center text-xs font-medium text-amber-950 py-1.5 px-4">
      Demo instance — data resets every few hours. Outgoing email, SMS, Telegram and team invites are disabled.{" "}
      <a
        href="https://torqvoice.com/docs/installation"
        className="underline underline-offset-2 hover:text-amber-900"
      >
        {t("installOwn")} →
      </a>
    </div>
  );
}
