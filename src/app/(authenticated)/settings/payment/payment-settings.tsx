"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { setSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { Banknote, CreditCard, Loader2, Save, Copy, Check } from "lucide-react";
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from "../read-only-guard";

export function PaymentSettings({ settings, orgId }: { settings: Record<string, string>; orgId: string }) {
  const router = useRouter();
  const t = useTranslations('settings');
  const [saving, setSaving] = useState(false);

  // Existing fields
  const [bankAccount, setBankAccount] = useState(settings[SETTING_KEYS.INVOICE_BANK_ACCOUNT] || "");
  const [paymentTerms, setPaymentTerms] = useState(settings[SETTING_KEYS.INVOICE_PAYMENT_TERMS] || "");
  const [termsOfSale, setTermsOfSale] = useState(settings[SETTING_KEYS.PAYMENT_TERMS_OF_SALE] || "");
  const [termsOfSaleUrl, setTermsOfSaleUrl] = useState(settings[SETTING_KEYS.PAYMENT_TERMS_OF_SALE_URL] || "");

  // Online payment providers
  const enabledRaw = settings[SETTING_KEYS.PAYMENT_PROVIDERS_ENABLED] || "";
  const enabledList = enabledRaw.split(",").map((s) => s.trim()).filter(Boolean);

  const [stripeEnabled, setStripeEnabled] = useState(enabledList.includes("stripe"));
  const [vippsEnabled, setVippsEnabled] = useState(enabledList.includes("vipps"));
  const [paypalEnabled, setPaypalEnabled] = useState(enabledList.includes("paypal"));

  // Stripe fields
  const [stripeSecretKey, setStripeSecretKey] = useState(settings[SETTING_KEYS.PAYMENT_STRIPE_SECRET_KEY] || "");
  const [stripePublishableKey, setStripePublishableKey] = useState(settings[SETTING_KEYS.PAYMENT_STRIPE_PUBLISHABLE_KEY] || "");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState(settings[SETTING_KEYS.PAYMENT_STRIPE_WEBHOOK_SECRET] || "");

  // Vipps fields
  const [vippsClientId, setVippsClientId] = useState(settings[SETTING_KEYS.PAYMENT_VIPPS_CLIENT_ID] || "");
  const [vippsClientSecret, setVippsClientSecret] = useState(settings[SETTING_KEYS.PAYMENT_VIPPS_CLIENT_SECRET] || "");
  const [vippsSubscriptionKey, setVippsSubscriptionKey] = useState(settings[SETTING_KEYS.PAYMENT_VIPPS_SUBSCRIPTION_KEY] || "");
  const [vippsMsn, setVippsMsn] = useState(settings[SETTING_KEYS.PAYMENT_VIPPS_MSN] || "");
  const [vippsTestMode, setVippsTestMode] = useState(settings[SETTING_KEYS.PAYMENT_VIPPS_USE_TEST] === "true");

  // PayPal fields
  const [paypalClientId, setPaypalClientId] = useState(settings[SETTING_KEYS.PAYMENT_PAYPAL_CLIENT_ID] || "");
  const [paypalClientSecret, setPaypalClientSecret] = useState(settings[SETTING_KEYS.PAYMENT_PAYPAL_CLIENT_SECRET] || "");
  const [paypalSandbox, setPaypalSandbox] = useState(settings[SETTING_KEYS.PAYMENT_PAYPAL_USE_SANDBOX] === "true");

  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [appUrl, setAppUrl] = useState("");

  useEffect(() => {
    setAppUrl(window.location.origin);
  }, []);

  const handleSave = async () => {
    setSaving(true);

    const providers: string[] = [];
    if (stripeEnabled) providers.push("stripe");
    if (vippsEnabled) providers.push("vipps");
    if (paypalEnabled) providers.push("paypal");

    await setSettings({
      [SETTING_KEYS.INVOICE_BANK_ACCOUNT]: bankAccount,
      [SETTING_KEYS.INVOICE_PAYMENT_TERMS]: paymentTerms,
      [SETTING_KEYS.PAYMENT_TERMS_OF_SALE]: termsOfSale,
      [SETTING_KEYS.PAYMENT_TERMS_OF_SALE_URL]: termsOfSaleUrl,
      [SETTING_KEYS.PAYMENT_PROVIDERS_ENABLED]: providers.join(","),
      [SETTING_KEYS.PAYMENT_STRIPE_SECRET_KEY]: stripeSecretKey,
      [SETTING_KEYS.PAYMENT_STRIPE_PUBLISHABLE_KEY]: stripePublishableKey,
      [SETTING_KEYS.PAYMENT_STRIPE_WEBHOOK_SECRET]: stripeWebhookSecret,
      [SETTING_KEYS.PAYMENT_VIPPS_CLIENT_ID]: vippsClientId,
      [SETTING_KEYS.PAYMENT_VIPPS_CLIENT_SECRET]: vippsClientSecret,
      [SETTING_KEYS.PAYMENT_VIPPS_SUBSCRIPTION_KEY]: vippsSubscriptionKey,
      [SETTING_KEYS.PAYMENT_VIPPS_MSN]: vippsMsn,
      [SETTING_KEYS.PAYMENT_VIPPS_USE_TEST]: vippsTestMode ? "true" : "false",
      [SETTING_KEYS.PAYMENT_PAYPAL_CLIENT_ID]: paypalClientId,
      [SETTING_KEYS.PAYMENT_PAYPAL_CLIENT_SECRET]: paypalClientSecret,
      [SETTING_KEYS.PAYMENT_PAYPAL_USE_SANDBOX]: paypalSandbox ? "true" : "false",
    });

    setSaving(false);
    router.refresh();
    toast.success(t('payment.saved'));
  };

  const copyWebhookUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Banknote className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('payment.detailsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {t('payment.detailsDescription')}
          </p>

          <div className="space-y-2">
            <Label htmlFor="bankAccount">{t('payment.bankAccount')}</Label>
            <Input
              id="bankAccount"
              placeholder={t('payment.bankAccountPlaceholder')}
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t('payment.bankAccountHint')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentTerms">{t('payment.paymentTerms')}</Label>
            <Input
              id="paymentTerms"
              placeholder={t('payment.paymentTermsPlaceholder')}
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t('payment.paymentTermsHint')}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('payment.onlinePayments')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {t('payment.onlinePaymentsDescription')}
          </p>

          {/* Stripe */}
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">{t('payment.stripe')}</Label>
                <p className="text-xs text-muted-foreground">{t('payment.stripeDescription')}</p>
              </div>
              <Switch checked={stripeEnabled} onCheckedChange={setStripeEnabled} />
            </div>

            {stripeEnabled && (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="stripeSecretKey">{t('payment.secretKey')}</Label>
                  <Input
                    id="stripeSecretKey"
                    type="password"
                    placeholder="sk_live_..."
                    value={stripeSecretKey}
                    onChange={(e) => setStripeSecretKey(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stripePublishableKey">{t('payment.publishableKey')}</Label>
                  <Input
                    id="stripePublishableKey"
                    type="password"
                    placeholder="pk_live_..."
                    value={stripePublishableKey}
                    onChange={(e) => setStripePublishableKey(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stripeWebhookSecret">{t('payment.webhookSecret')}</Label>
                  <Input
                    id="stripeWebhookSecret"
                    type="password"
                    placeholder="whsec_..."
                    value={stripeWebhookSecret}
                    onChange={(e) => setStripeWebhookSecret(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('payment.webhookUrl')}</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted px-3 py-2 text-xs break-all">
                      {appUrl}/api/webhooks/stripe
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyWebhookUrl(`${appUrl}/api/webhooks/stripe`)}
                    >
                      {copiedUrl === `${appUrl}/api/webhooks/stripe` ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.rich('payment.stripeWebhookHint', { code: (chunks) => <code className="text-xs">{chunks}</code> })}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Vipps */}
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">{t('payment.vipps')}</Label>
                <p className="text-xs text-muted-foreground">{t('payment.vippsDescription')}</p>
              </div>
              <Switch checked={vippsEnabled} onCheckedChange={setVippsEnabled} />
            </div>

            {vippsEnabled && (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="vippsClientId">{t('payment.clientId')}</Label>
                  <Input
                    id="vippsClientId"
                    type="password"
                    placeholder="Client ID"
                    value={vippsClientId}
                    onChange={(e) => setVippsClientId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vippsClientSecret">{t('payment.clientSecret')}</Label>
                  <Input
                    id="vippsClientSecret"
                    type="password"
                    placeholder="Client Secret"
                    value={vippsClientSecret}
                    onChange={(e) => setVippsClientSecret(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vippsSubscriptionKey">{t('payment.subscriptionKey')}</Label>
                  <Input
                    id="vippsSubscriptionKey"
                    type="password"
                    placeholder="Ocp-Apim-Subscription-Key"
                    value={vippsSubscriptionKey}
                    onChange={(e) => setVippsSubscriptionKey(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vippsMsn">{t('payment.merchantSerialNumber')}</Label>
                  <Input
                    id="vippsMsn"
                    placeholder="123456"
                    value={vippsMsn}
                    onChange={(e) => setVippsMsn(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={vippsTestMode} onCheckedChange={setVippsTestMode} />
                  <Label>{t('payment.testMode')}</Label>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('payment.callbackUrl')}</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted px-3 py-2 text-xs break-all">
                      {appUrl}/api/webhooks/vipps
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyWebhookUrl(`${appUrl}/api/webhooks/vipps`)}
                    >
                      {copiedUrl === `${appUrl}/api/webhooks/vipps` ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="termsOfSale">{t('payment.termsOfSale')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('payment.termsOfSaleDescription')}
                  </p>
                  <Textarea
                    id="termsOfSale"
                    rows={10}
                    placeholder={"1. Parties\n2. Payment\n3. Delivery\n4. Right of withdrawal\n5. Returns\n6. Complaints\n7. Disputes"}
                    value={termsOfSale}
                    onChange={(e) => setTermsOfSale(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="termsOfSaleUrl">{t('payment.externalTermsUrl')}</Label>
                  <Input
                    id="termsOfSaleUrl"
                    type="url"
                    placeholder="https://example.com/salgsvilkar"
                    value={termsOfSaleUrl}
                    onChange={(e) => setTermsOfSaleUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('payment.externalTermsUrlHint')}
                  </p>
                </div>

                {!termsOfSaleUrl && termsOfSale && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('payment.publicTermsUrl')}</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded bg-muted px-3 py-2 text-xs break-all">
                        {appUrl}/share/terms/{orgId}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyWebhookUrl(`${appUrl}/share/terms/${orgId}`)}
                      >
                        {copiedUrl === `${appUrl}/share/terms/${orgId}` ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('payment.publicTermsUrlHint')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PayPal */}
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">{t('payment.paypal')}</Label>
                <p className="text-xs text-muted-foreground">{t('payment.paypalDescription')}</p>
              </div>
              <Switch checked={paypalEnabled} onCheckedChange={setPaypalEnabled} />
            </div>

            {paypalEnabled && (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="paypalClientId">{t('payment.clientId')}</Label>
                  <Input
                    id="paypalClientId"
                    type="password"
                    placeholder="PayPal Client ID"
                    value={paypalClientId}
                    onChange={(e) => setPaypalClientId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paypalClientSecret">{t('payment.clientSecret')}</Label>
                  <Input
                    id="paypalClientSecret"
                    type="password"
                    placeholder="PayPal Client Secret"
                    value={paypalClientSecret}
                    onChange={(e) => setPaypalClientSecret(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={paypalSandbox} onCheckedChange={setPaypalSandbox} />
                  <Label>{t('payment.sandboxMode')}</Label>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('payment.webhookUrl')}</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted px-3 py-2 text-xs break-all">
                      {appUrl}/api/webhooks/paypal
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyWebhookUrl(`${appUrl}/api/webhooks/paypal`)}
                    >
                      {copiedUrl === `${appUrl}/api/webhooks/paypal` ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.rich('payment.paypalWebhookHint', { code: (chunks) => <code className="text-xs">{chunks}</code> })}
                  </p>
                </div>
              </div>
            )}
          </div>

          <SaveButton>
            <Separator />
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {t('payment.savePayment')}
              </Button>
            </div>
          </SaveButton>
        </CardContent>
      </Card>
      </ReadOnlyWrapper>
    </div>
  );
}
