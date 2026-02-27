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
import { Loader2, Send, Info } from "lucide-react";
import { ORG_EMAIL_KEYS } from "../Schema/emailSettingsSchema";
import {
  setEmailSettings,
  testOrgEmailConnection,
} from "../Actions/emailSettingsActions";
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from "@/app/(authenticated)/settings/read-only-guard";

type EmailProviderType =
  | "smtp"
  | "resend"
  | "postmark"
  | "mailgun"
  | "sendgrid"
  | "ses";

export function EmailSettingsForm({
  initial,
}: {
  initial: Record<string, string>;
}) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isTesting, setIsTesting] = useState(false);

  const hasCustomProvider = !!initial[ORG_EMAIL_KEYS.EMAIL_PROVIDER];
  const [useCustom, setUseCustom] = useState(hasCustomProvider);

  // Provider
  const [emailProvider, setEmailProvider] = useState<EmailProviderType>(
    (initial[ORG_EMAIL_KEYS.EMAIL_PROVIDER] as EmailProviderType) || "smtp",
  );

  // SMTP
  const [smtpHost, setSmtpHost] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_SMTP_HOST] || "",
  );
  const [smtpPort, setSmtpPort] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_SMTP_PORT] || "587",
  );
  const [smtpUser, setSmtpUser] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_SMTP_USER] || "",
  );
  const [smtpPass, setSmtpPass] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_SMTP_PASS] || "",
  );
  const [smtpSecure, setSmtpSecure] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_SMTP_SECURE] === "true",
  );
  const [smtpFromEmail, setSmtpFromEmail] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_SMTP_FROM_EMAIL] || "",
  );
  const [smtpFromName, setSmtpFromName] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_SMTP_FROM_NAME] || "",
  );
  const [smtpRejectUnauthorized, setSmtpRejectUnauthorized] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_SMTP_REJECT_UNAUTHORIZED] !== "false",
  );
  const [smtpRequireTls, setSmtpRequireTls] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_SMTP_REQUIRE_TLS] === "true",
  );

  // Resend
  const [resendApiKey, setResendApiKey] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_RESEND_API_KEY] || "",
  );
  const [resendFromEmail, setResendFromEmail] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_RESEND_FROM_EMAIL] || "",
  );
  const [resendFromName, setResendFromName] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_RESEND_FROM_NAME] || "",
  );

  // Postmark
  const [postmarkApiKey, setPostmarkApiKey] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_POSTMARK_API_KEY] || "",
  );
  const [postmarkFromEmail, setPostmarkFromEmail] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_POSTMARK_FROM_EMAIL] || "",
  );
  const [postmarkFromName, setPostmarkFromName] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_POSTMARK_FROM_NAME] || "",
  );

  // Mailgun
  const [mailgunApiKey, setMailgunApiKey] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_MAILGUN_API_KEY] || "",
  );
  const [mailgunDomain, setMailgunDomain] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_MAILGUN_DOMAIN] || "",
  );
  const [mailgunRegion, setMailgunRegion] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_MAILGUN_REGION] || "us",
  );
  const [mailgunFromEmail, setMailgunFromEmail] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_MAILGUN_FROM_EMAIL] || "",
  );
  const [mailgunFromName, setMailgunFromName] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_MAILGUN_FROM_NAME] || "",
  );

  // SendGrid
  const [sendgridApiKey, setSendgridApiKey] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_SENDGRID_API_KEY] || "",
  );
  const [sendgridFromEmail, setSendgridFromEmail] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_SENDGRID_FROM_EMAIL] || "",
  );
  const [sendgridFromName, setSendgridFromName] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_SENDGRID_FROM_NAME] || "",
  );

  // Amazon SES
  const [sesAccessKeyId, setSesAccessKeyId] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_SES_ACCESS_KEY_ID] || "",
  );
  const [sesSecretAccessKey, setSesSecretAccessKey] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_SES_SECRET_ACCESS_KEY] || "",
  );
  const [sesRegion, setSesRegion] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_SES_REGION] || "us-east-1",
  );
  const [sesFromEmail, setSesFromEmail] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_SES_FROM_EMAIL] || "",
  );
  const [sesFromName, setSesFromName] = useState(
    initial[ORG_EMAIL_KEYS.EMAIL_SES_FROM_NAME] || "",
  );

  const handleSave = () => {
    startTransition(async () => {
      if (!useCustom) {
        // Clear the provider key to revert to platform default
        const result = await setEmailSettings({
          [ORG_EMAIL_KEYS.EMAIL_PROVIDER]: "",
        });
        if (result.success) {
          toast.success(t("email.savedDefault"));
          router.refresh();
        } else {
          toast.error(result.error ?? t("email.failedSave"));
        }
        return;
      }

      const data: Record<string, string> = {
        [ORG_EMAIL_KEYS.EMAIL_PROVIDER]: emailProvider,
        // SMTP
        [ORG_EMAIL_KEYS.EMAIL_SMTP_HOST]: smtpHost,
        [ORG_EMAIL_KEYS.EMAIL_SMTP_PORT]: smtpPort,
        [ORG_EMAIL_KEYS.EMAIL_SMTP_USER]: smtpUser,
        [ORG_EMAIL_KEYS.EMAIL_SMTP_PASS]: smtpPass,
        [ORG_EMAIL_KEYS.EMAIL_SMTP_SECURE]: String(smtpSecure),
        [ORG_EMAIL_KEYS.EMAIL_SMTP_FROM_EMAIL]: smtpFromEmail,
        [ORG_EMAIL_KEYS.EMAIL_SMTP_FROM_NAME]: smtpFromName,
        [ORG_EMAIL_KEYS.EMAIL_SMTP_REJECT_UNAUTHORIZED]: String(
          smtpRejectUnauthorized,
        ),
        [ORG_EMAIL_KEYS.EMAIL_SMTP_REQUIRE_TLS]: String(smtpRequireTls),
        // Resend
        [ORG_EMAIL_KEYS.EMAIL_RESEND_API_KEY]: resendApiKey,
        [ORG_EMAIL_KEYS.EMAIL_RESEND_FROM_EMAIL]: resendFromEmail,
        [ORG_EMAIL_KEYS.EMAIL_RESEND_FROM_NAME]: resendFromName,
        // Postmark
        [ORG_EMAIL_KEYS.EMAIL_POSTMARK_API_KEY]: postmarkApiKey,
        [ORG_EMAIL_KEYS.EMAIL_POSTMARK_FROM_EMAIL]: postmarkFromEmail,
        [ORG_EMAIL_KEYS.EMAIL_POSTMARK_FROM_NAME]: postmarkFromName,
        // Mailgun
        [ORG_EMAIL_KEYS.EMAIL_MAILGUN_API_KEY]: mailgunApiKey,
        [ORG_EMAIL_KEYS.EMAIL_MAILGUN_DOMAIN]: mailgunDomain,
        [ORG_EMAIL_KEYS.EMAIL_MAILGUN_REGION]: mailgunRegion,
        [ORG_EMAIL_KEYS.EMAIL_MAILGUN_FROM_EMAIL]: mailgunFromEmail,
        [ORG_EMAIL_KEYS.EMAIL_MAILGUN_FROM_NAME]: mailgunFromName,
        // SendGrid
        [ORG_EMAIL_KEYS.EMAIL_SENDGRID_API_KEY]: sendgridApiKey,
        [ORG_EMAIL_KEYS.EMAIL_SENDGRID_FROM_EMAIL]: sendgridFromEmail,
        [ORG_EMAIL_KEYS.EMAIL_SENDGRID_FROM_NAME]: sendgridFromName,
        // Amazon SES
        [ORG_EMAIL_KEYS.EMAIL_SES_ACCESS_KEY_ID]: sesAccessKeyId,
        [ORG_EMAIL_KEYS.EMAIL_SES_SECRET_ACCESS_KEY]: sesSecretAccessKey,
        [ORG_EMAIL_KEYS.EMAIL_SES_REGION]: sesRegion,
        [ORG_EMAIL_KEYS.EMAIL_SES_FROM_EMAIL]: sesFromEmail,
        [ORG_EMAIL_KEYS.EMAIL_SES_FROM_NAME]: sesFromName,
      };

      const result = await setEmailSettings(data);
      if (result.success) {
        toast.success(t("email.saved"));
        router.refresh();
      } else {
        toast.error(result.error ?? t("email.failedSave"));
      }
    });
  };

  const handleTestEmail = async () => {
    setIsTesting(true);
    try {
      const result = await testOrgEmailConnection();
      if (result.success) {
        toast.success(t("email.testSentTo", { email: result.data?.sentTo }));
      } else {
        toast.error(result.error ?? t("email.testFailed"));
      }
    } finally {
      setIsTesting(false);
    }
  };

  const isTestDisabled =
    isTesting ||
    !useCustom ||
    (emailProvider === "smtp" && !smtpHost) ||
    (emailProvider === "resend" && !resendApiKey) ||
    (emailProvider === "postmark" && !postmarkApiKey) ||
    (emailProvider === "mailgun" && !mailgunApiKey) ||
    (emailProvider === "sendgrid" && !sendgridApiKey) ||
    (emailProvider === "ses" && !sesAccessKeyId);

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
      <Card>
        <CardHeader>
          <CardTitle>{t("email.title")}</CardTitle>
          <CardDescription>
            {t("email.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="use-custom-email">
                {t("email.useCustomLabel")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("email.useCustomHint")}
              </p>
            </div>
            <Switch
              id="use-custom-email"
              checked={useCustom}
              onCheckedChange={setUseCustom}
            />
          </div>

          {!useCustom && (
            <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("email.platformDefaultInfo")}
              </p>
            </div>
          )}

          {useCustom && (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={emailProvider === "smtp" ? "default" : "outline"}
                  onClick={() => setEmailProvider("smtp")}
                  className="flex-1"
                >
                  SMTP
                </Button>
                <Button
                  type="button"
                  variant={emailProvider === "resend" ? "default" : "outline"}
                  onClick={() => setEmailProvider("resend")}
                  className="flex-1"
                >
                  Resend
                </Button>
                <Button
                  type="button"
                  variant={emailProvider === "postmark" ? "default" : "outline"}
                  onClick={() => setEmailProvider("postmark")}
                  className="flex-1"
                >
                  Postmark
                </Button>
                <Button
                  type="button"
                  variant={emailProvider === "mailgun" ? "default" : "outline"}
                  onClick={() => setEmailProvider("mailgun")}
                  className="flex-1"
                >
                  Mailgun
                </Button>
                <Button
                  type="button"
                  variant={
                    emailProvider === "sendgrid" ? "default" : "outline"
                  }
                  onClick={() => setEmailProvider("sendgrid")}
                  className="flex-1"
                >
                  SendGrid
                </Button>
                <Button
                  type="button"
                  variant={emailProvider === "ses" ? "default" : "outline"}
                  onClick={() => setEmailProvider("ses")}
                  className="flex-1"
                >
                  Amazon SES
                </Button>
              </div>

              {emailProvider === "smtp" && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="org-smtp-host">{t("email.smtpHost")}</Label>
                      <Input
                        id="org-smtp-host"
                        placeholder={t("email.smtpHostPlaceholder")}
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="org-smtp-port">{t("email.smtpPort")}</Label>
                      <Input
                        id="org-smtp-port"
                        placeholder={t("email.smtpPortPlaceholder")}
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="org-smtp-user">{t("email.username")}</Label>
                      <Input
                        id="org-smtp-user"
                        placeholder={t("email.usernamePlaceholder")}
                        value={smtpUser}
                        onChange={(e) => setSmtpUser(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="org-smtp-pass">{t("email.password")}</Label>
                      <Input
                        id="org-smtp-pass"
                        type="password"
                        placeholder="••••••••"
                        value={smtpPass}
                        onChange={(e) => setSmtpPass(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="org-smtp-from-email">{t("email.fromEmail")}</Label>
                      <Input
                        id="org-smtp-from-email"
                        placeholder={t("email.fromEmailPlaceholder")}
                        value={smtpFromEmail}
                        onChange={(e) => setSmtpFromEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="org-smtp-from-name">{t("email.fromName")}</Label>
                      <Input
                        id="org-smtp-from-name"
                        placeholder={t("email.fromNamePlaceholder")}
                        value={smtpFromName}
                        onChange={(e) => setSmtpFromName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="org-smtp-secure">
                          {t("email.tlsConnection")}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {t("email.tlsConnectionHint")}
                        </p>
                      </div>
                      <Switch
                        id="org-smtp-secure"
                        checked={smtpSecure}
                        onCheckedChange={setSmtpSecure}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="org-smtp-reject-unauthorized">
                          {t("email.verifyTlsCerts")}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {t("email.verifyTlsCertsHint")}
                        </p>
                      </div>
                      <Switch
                        id="org-smtp-reject-unauthorized"
                        checked={smtpRejectUnauthorized}
                        onCheckedChange={setSmtpRejectUnauthorized}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="org-smtp-require-tls">
                          {t("email.requireTlsUpgrade")}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {t("email.requireTlsUpgradeHint")}
                        </p>
                      </div>
                      <Switch
                        id="org-smtp-require-tls"
                        checked={smtpRequireTls}
                        onCheckedChange={setSmtpRequireTls}
                      />
                    </div>
                  </div>
                </>
              )}

              {emailProvider === "resend" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="org-resend-api-key">{t("email.apiKey")}</Label>
                    <Input
                      id="org-resend-api-key"
                      type="password"
                      placeholder="re_••••••••"
                      value={resendApiKey}
                      onChange={(e) => setResendApiKey(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("email.apiKeyHintResend")}{" "}
                      <a
                        href="https://resend.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        resend.com
                      </a>
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="org-resend-from-email">{t("email.fromEmail")}</Label>
                      <Input
                        id="org-resend-from-email"
                        placeholder={t("email.fromEmailDomainPlaceholder")}
                        value={resendFromEmail}
                        onChange={(e) => setResendFromEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="org-resend-from-name">{t("email.fromName")}</Label>
                      <Input
                        id="org-resend-from-name"
                        placeholder={t("email.fromNamePlaceholder")}
                        value={resendFromName}
                        onChange={(e) => setResendFromName(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {emailProvider === "postmark" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="org-postmark-api-key">{t("email.serverToken")}</Label>
                    <Input
                      id="org-postmark-api-key"
                      type="password"
                      placeholder="••••••••-••••-••••-••••-••••••••••••"
                      value={postmarkApiKey}
                      onChange={(e) => setPostmarkApiKey(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("email.serverTokenHintPostmark")}{" "}
                      <a
                        href="https://postmarkapp.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        postmarkapp.com
                      </a>
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="org-postmark-from-email">
                        {t("email.fromEmail")}
                      </Label>
                      <Input
                        id="org-postmark-from-email"
                        placeholder={t("email.fromEmailDomainPlaceholder")}
                        value={postmarkFromEmail}
                        onChange={(e) => setPostmarkFromEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="org-postmark-from-name">{t("email.fromName")}</Label>
                      <Input
                        id="org-postmark-from-name"
                        placeholder={t("email.fromNamePlaceholder")}
                        value={postmarkFromName}
                        onChange={(e) => setPostmarkFromName(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {emailProvider === "mailgun" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="org-mailgun-api-key">{t("email.apiKey")}</Label>
                    <Input
                      id="org-mailgun-api-key"
                      type="password"
                      placeholder="key-••••••••••••••••••••••••••••••••"
                      value={mailgunApiKey}
                      onChange={(e) => setMailgunApiKey(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("email.apiKeyHintMailgun")}{" "}
                      <a
                        href="https://app.mailgun.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        app.mailgun.com
                      </a>
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="org-mailgun-domain">{t("email.domain")}</Label>
                      <Input
                        id="org-mailgun-domain"
                        placeholder={t("email.domainPlaceholder")}
                        value={mailgunDomain}
                        onChange={(e) => setMailgunDomain(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="org-mailgun-region">{t("email.region")}</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={
                            mailgunRegion === "us" ? "default" : "outline"
                          }
                          onClick={() => setMailgunRegion("us")}
                          className="flex-1"
                          size="sm"
                        >
                          US
                        </Button>
                        <Button
                          type="button"
                          variant={
                            mailgunRegion === "eu" ? "default" : "outline"
                          }
                          onClick={() => setMailgunRegion("eu")}
                          className="flex-1"
                          size="sm"
                        >
                          EU
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="org-mailgun-from-email">
                        {t("email.fromEmail")}
                      </Label>
                      <Input
                        id="org-mailgun-from-email"
                        placeholder={t("email.fromEmailDomainPlaceholder")}
                        value={mailgunFromEmail}
                        onChange={(e) => setMailgunFromEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="org-mailgun-from-name">{t("email.fromName")}</Label>
                      <Input
                        id="org-mailgun-from-name"
                        placeholder={t("email.fromNamePlaceholder")}
                        value={mailgunFromName}
                        onChange={(e) => setMailgunFromName(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {emailProvider === "sendgrid" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="org-sendgrid-api-key">{t("email.apiKey")}</Label>
                    <Input
                      id="org-sendgrid-api-key"
                      type="password"
                      placeholder="SG.••••••••••••••••••••••••••••••••"
                      value={sendgridApiKey}
                      onChange={(e) => setSendgridApiKey(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("email.apiKeyHintSendGrid")}{" "}
                      <a
                        href="https://app.sendgrid.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        app.sendgrid.com
                      </a>
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="org-sendgrid-from-email">
                        {t("email.fromEmail")}
                      </Label>
                      <Input
                        id="org-sendgrid-from-email"
                        placeholder={t("email.fromEmailDomainPlaceholder")}
                        value={sendgridFromEmail}
                        onChange={(e) => setSendgridFromEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="org-sendgrid-from-name">{t("email.fromName")}</Label>
                      <Input
                        id="org-sendgrid-from-name"
                        placeholder={t("email.fromNamePlaceholder")}
                        value={sendgridFromName}
                        onChange={(e) => setSendgridFromName(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {emailProvider === "ses" && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="org-ses-access-key">
                        {t("email.accessKeyId")}
                      </Label>
                      <Input
                        id="org-ses-access-key"
                        type="password"
                        placeholder="AKIA••••••••••••••••"
                        value={sesAccessKeyId}
                        onChange={(e) => setSesAccessKeyId(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="org-ses-secret-key">
                        {t("email.secretAccessKey")}
                      </Label>
                      <Input
                        id="org-ses-secret-key"
                        type="password"
                        placeholder="••••••••••••••••••••••••••••••••••••••••"
                        value={sesSecretAccessKey}
                        onChange={(e) => setSesSecretAccessKey(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="org-ses-region">{t("email.awsRegion")}</Label>
                    <Input
                      id="org-ses-region"
                      placeholder={t("email.awsRegionPlaceholder")}
                      value={sesRegion}
                      onChange={(e) => setSesRegion(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("email.awsRegionHint")}
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="org-ses-from-email">{t("email.fromEmail")}</Label>
                      <Input
                        id="org-ses-from-email"
                        placeholder={t("email.fromEmailDomainPlaceholder")}
                        value={sesFromEmail}
                        onChange={(e) => setSesFromEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="org-ses-from-name">{t("email.fromName")}</Label>
                      <Input
                        id="org-ses-from-name"
                        placeholder={t("email.fromNamePlaceholder")}
                        value={sesFromName}
                        onChange={(e) => setSesFromName(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestEmail}
                  disabled={isTestDisabled}
                >
                  {isTesting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {t("email.sendTestEmail")}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t("email.testEmailHint")}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <SaveButton>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("email.saveSettings")}
          </Button>
        </div>
      </SaveButton>
      </ReadOnlyWrapper>
    </div>
  );
}
