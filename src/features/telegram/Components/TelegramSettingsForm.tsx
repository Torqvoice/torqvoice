"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ExternalLink, Loader2, Copy, Check, Eye, EyeOff } from "lucide-react";
import { setTelegramSettings } from "../Actions/telegramSettingsActions";
import { setSettings } from "@/features/settings/Actions/settingsActions";
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from "@/app/(authenticated)/settings/read-only-guard";
import { TelegramDisconnectButton } from "./TelegramDisconnectButton";
import { TelegramTestMessage } from "./TelegramTestMessage";

export function TelegramSettingsForm({ initial, appUrl, showQrOnInvoice: initialShowQr = false }: { initial: Record<string, string>; appUrl: string; showQrOnInvoice?: boolean }) {
  const t = useTranslations("telegram");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showToken, setShowToken] = useState(false);
  const [botToken, setBotToken] = useState(initial["telegram.botToken"] || "");
  const botUsername = initial["telegram.botUsername"] || "";
  const isConnected = !!botUsername;
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(initialShowQr);
  const deepLink = botUsername ? `https://t.me/${botUsername}?start={customerId}` : "";

  const handleCopyLink = () => {
    if (!deepLink) return;
    navigator.clipboard.writeText(deepLink);
    setCopied(true);
    toast.success(t("deepLink.copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await setTelegramSettings({ botToken });
      if (result.success) { toast.success(t("saved")); router.refresh(); }
      else { toast.error(result.error ?? t("saveError")); }
    });
  };

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
        <Card>
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>
              {t("description")}{" "}
              <a
                href="https://torqvoice.com/docs/configuration#telegram"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                {t("helpLink")}
                <ExternalLink className="h-3 w-3" />
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="bot-token">{t("botToken.label")}</Label>
              <div className="flex items-center gap-2">
                <Input id="bot-token" type={showToken ? "text" : "password"} placeholder={t("botToken.placeholder")} value={botToken} onChange={(e) => setBotToken(e.target.value)} />
                <Button type="button" variant="outline" size="icon" onClick={() => setShowToken(!showToken)}>
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("botToken.help")}</p>
            </div>

            {isConnected && (
              <div className="space-y-2">
                <Label>{t("botUsername.label")}</Label>
                <Input readOnly value={`@${botUsername}`} className="font-mono text-sm" />
              </div>
            )}

            {isConnected && (
              <div className="space-y-2">
                <Label>{t("webhook.label")}</Label>
                <Input readOnly value={`${appUrl}/api/webhooks/telegram`} className="font-mono text-xs" />
                <p className="text-xs text-muted-foreground">{t("webhook.description")}</p>
              </div>
            )}

            {isConnected && (
              <div className="space-y-2">
                <Label>{t("deepLink.title")}</Label>
                <p className="text-xs text-muted-foreground">{t("deepLink.description")}</p>
                <div className="flex items-center gap-2">
                  <Input readOnly value={deepLink} className="font-mono text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={handleCopyLink}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            {isConnected && <TelegramTestMessage />}

            {isConnected && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>{t("invoiceQr.label")}</Label>
                  <p className="text-xs text-muted-foreground">{t("invoiceQr.description")}</p>
                </div>
                <Switch
                  checked={showQr}
                  onCheckedChange={(checked) => {
                    setShowQr(checked);
                    startTransition(async () => {
                      const result = await setSettings({ "telegram.showQrOnInvoice": checked ? "true" : "false" });
                      if (result.success) toast.success(t("saved"));
                      else toast.error(result.error ?? t("saveError"));
                    });
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <SaveButton>
          <div className="flex items-center justify-between">
            {isConnected && <TelegramDisconnectButton />}
            <div className="ml-auto">
              <Button onClick={handleSave} disabled={isPending || !botToken.trim()}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPending ? t("saving") : t("save")}
              </Button>
            </div>
          </div>
        </SaveButton>
      </ReadOnlyWrapper>
    </div>
  );
}
