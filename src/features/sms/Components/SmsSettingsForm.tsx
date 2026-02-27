"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Send, Info, Copy, Check } from "lucide-react";
import { ORG_SMS_KEYS } from "../Schema/smsSettingsSchema";
import {
  setSmsSettings,
  testSmsSend,
} from "../Actions/smsSettingsActions";
import {
  ReadOnlyBanner,
  SaveButton,
  ReadOnlyWrapper,
} from "@/app/(authenticated)/settings/read-only-guard";

type SmsProviderType = "twilio" | "vonage" | "telnyx";

export function SmsSettingsForm({
  initial,
  appUrl,
}: {
  initial: Record<string, string>;
  appUrl: string;
}) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isTesting, setIsTesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testPhone, setTestPhone] = useState("");

  const hasProvider = !!initial[ORG_SMS_KEYS.SMS_PROVIDER];
  const [enabled, setEnabled] = useState(hasProvider);

  const [smsProvider, setSmsProvider] = useState<SmsProviderType>(
    (initial[ORG_SMS_KEYS.SMS_PROVIDER] as SmsProviderType) || "twilio",
  );

  // Shared
  const [phoneNumber, setPhoneNumber] = useState(
    initial[ORG_SMS_KEYS.SMS_PHONE_NUMBER] || "",
  );

  // Twilio
  const [twilioAccountSid, setTwilioAccountSid] = useState(
    initial[ORG_SMS_KEYS.SMS_TWILIO_ACCOUNT_SID] || "",
  );
  const [twilioAuthToken, setTwilioAuthToken] = useState(
    initial[ORG_SMS_KEYS.SMS_TWILIO_AUTH_TOKEN] || "",
  );

  // Vonage
  const [vonageApiKey, setVonageApiKey] = useState(
    initial[ORG_SMS_KEYS.SMS_VONAGE_API_KEY] || "",
  );
  const [vonageApiSecret, setVonageApiSecret] = useState(
    initial[ORG_SMS_KEYS.SMS_VONAGE_API_SECRET] || "",
  );

  // Telnyx
  const [telnyxApiKey, setTelnyxApiKey] = useState(
    initial[ORG_SMS_KEYS.SMS_TELNYX_API_KEY] || "",
  );

  const webhookSecret = initial[ORG_SMS_KEYS.SMS_WEBHOOK_SECRET] || "";
  const webhookUrl = webhookSecret
    ? `${appUrl}/api/webhooks/sms/${smsProvider}?org_secret=${webhookSecret}`
    : "";

  const handleCopyWebhook = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success(t("sms.webhookCopied"));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    startTransition(async () => {
      if (!enabled) {
        const result = await setSmsSettings({
          [ORG_SMS_KEYS.SMS_PROVIDER]: "",
        });
        if (result.success) {
          toast.success(t("sms.savedDisabled"));
          router.refresh();
        } else {
          toast.error(result.error ?? t("sms.failedSave"));
        }
        return;
      }

      const data: Record<string, string> = {
        [ORG_SMS_KEYS.SMS_PROVIDER]: smsProvider,
        [ORG_SMS_KEYS.SMS_PHONE_NUMBER]: phoneNumber,
        // Twilio
        [ORG_SMS_KEYS.SMS_TWILIO_ACCOUNT_SID]: twilioAccountSid,
        [ORG_SMS_KEYS.SMS_TWILIO_AUTH_TOKEN]: twilioAuthToken,
        // Vonage
        [ORG_SMS_KEYS.SMS_VONAGE_API_KEY]: vonageApiKey,
        [ORG_SMS_KEYS.SMS_VONAGE_API_SECRET]: vonageApiSecret,
        // Telnyx
        [ORG_SMS_KEYS.SMS_TELNYX_API_KEY]: telnyxApiKey,
      };

      const result = await setSmsSettings(data);
      if (result.success) {
        toast.success(t("sms.saved"));
        router.refresh();
      } else {
        toast.error(result.error ?? t("sms.failedSave"));
      }
    });
  };

  const handleTestSms = async () => {
    if (!testPhone.trim()) {
      toast.error(t("sms.enterTestPhone"));
      return;
    }
    setIsTesting(true);
    try {
      const result = await testSmsSend(testPhone.trim());
      if (result.success) {
        toast.success(t("sms.testSentTo", { phone: result.data?.sentTo }));
      } else {
        toast.error(result.error ?? t("sms.testFailed"));
      }
    } finally {
      setIsTesting(false);
    }
  };

  const isTestDisabled =
    isTesting ||
    !enabled ||
    !phoneNumber ||
    !testPhone.trim() ||
    (smsProvider === "twilio" && (!twilioAccountSid || !twilioAuthToken)) ||
    (smsProvider === "vonage" && (!vonageApiKey || !vonageApiSecret)) ||
    (smsProvider === "telnyx" && !telnyxApiKey);

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
        <Card>
          <CardHeader>
            <CardTitle>{t("sms.title")}</CardTitle>
            <CardDescription>{t("sms.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enable-sms">{t("sms.enableLabel")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("sms.enableHint")}
                </p>
              </div>
              <Switch
                id="enable-sms"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>

            {!enabled && (
              <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t("sms.disabledInfo")}
                </p>
              </div>
            )}

            {enabled && (
              <>
                {/* Provider selection */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={smsProvider === "twilio" ? "default" : "outline"}
                    onClick={() => setSmsProvider("twilio")}
                    className="flex-1"
                  >
                    Twilio
                  </Button>
                  <Button
                    type="button"
                    variant={smsProvider === "vonage" ? "default" : "outline"}
                    onClick={() => setSmsProvider("vonage")}
                    className="flex-1"
                  >
                    Vonage
                  </Button>
                  <Button
                    type="button"
                    variant={smsProvider === "telnyx" ? "default" : "outline"}
                    onClick={() => setSmsProvider("telnyx")}
                    className="flex-1"
                  >
                    Telnyx
                  </Button>
                </div>

                {/* Phone number (shared) */}
                <div className="space-y-2">
                  <Label htmlFor="sms-phone-number">
                    {t("sms.phoneNumber")}
                  </Label>
                  <Input
                    id="sms-phone-number"
                    placeholder={t("sms.phoneNumberPlaceholder")}
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("sms.phoneNumberHint")}
                  </p>
                </div>

                {/* Twilio fields */}
                {smsProvider === "twilio" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="twilio-sid">
                        {t("sms.accountSid")}
                      </Label>
                      <Input
                        id="twilio-sid"
                        type="password"
                        placeholder="AC••••••••••••••••••••••••••••••••"
                        value={twilioAccountSid}
                        onChange={(e) => setTwilioAccountSid(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="twilio-token">
                        {t("sms.authToken")}
                      </Label>
                      <Input
                        id="twilio-token"
                        type="password"
                        placeholder="••••••••••••••••••••••••••••••••"
                        value={twilioAuthToken}
                        onChange={(e) => setTwilioAuthToken(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* Vonage fields */}
                {smsProvider === "vonage" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="vonage-key">{t("sms.apiKey")}</Label>
                      <Input
                        id="vonage-key"
                        type="password"
                        placeholder="••••••••"
                        value={vonageApiKey}
                        onChange={(e) => setVonageApiKey(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vonage-secret">
                        {t("sms.apiSecret")}
                      </Label>
                      <Input
                        id="vonage-secret"
                        type="password"
                        placeholder="••••••••••••••••"
                        value={vonageApiSecret}
                        onChange={(e) => setVonageApiSecret(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* Telnyx fields */}
                {smsProvider === "telnyx" && (
                  <div className="space-y-2">
                    <Label htmlFor="telnyx-key">{t("sms.apiKey")}</Label>
                    <Input
                      id="telnyx-key"
                      type="password"
                      placeholder="KEY••••••••••••••••••••••••••••••••"
                      value={telnyxApiKey}
                      onChange={(e) => setTelnyxApiKey(e.target.value)}
                    />
                  </div>
                )}

                {/* Webhook URL */}
                {webhookSecret && (
                  <div className="space-y-2">
                    <Label>{t("sms.webhookUrl")}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={webhookUrl}
                        className="font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleCopyWebhook}
                      >
                        {copied ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("sms.webhookUrlHint", { provider: smsProvider })}
                    </p>
                  </div>
                )}

                {/* Test SMS */}
                <div className="space-y-3 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="test-phone">
                      {t("sms.testPhoneNumber")}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="test-phone"
                        placeholder={t("sms.testPhonePlaceholder")}
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                        className="max-w-xs"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleTestSms}
                        disabled={isTestDisabled}
                      >
                        {isTesting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        {t("sms.sendTestSms")}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("sms.testSmsHint")}
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <SaveButton>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("sms.saveSettings")}
            </Button>
          </div>
        </SaveButton>
      </ReadOnlyWrapper>
    </div>
  );
}
