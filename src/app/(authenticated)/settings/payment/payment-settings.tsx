"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { setSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { Banknote, CreditCard, Loader2, Save, Copy, Check } from "lucide-react";
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from "../read-only-guard";

export function PaymentSettings({ settings }: { settings: Record<string, string> }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Existing fields
  const [bankAccount, setBankAccount] = useState(settings[SETTING_KEYS.INVOICE_BANK_ACCOUNT] || "");
  const [paymentTerms, setPaymentTerms] = useState(settings[SETTING_KEYS.INVOICE_PAYMENT_TERMS] || "");

  // Online payment providers
  const enabledRaw = settings[SETTING_KEYS.PAYMENT_PROVIDERS_ENABLED] || "";
  const enabledList = enabledRaw.split(",").map((s) => s.trim()).filter(Boolean);

  const [stripeEnabled, setStripeEnabled] = useState(enabledList.includes("stripe"));
  const [vippsEnabled, setVippsEnabled] = useState(enabledList.includes("vipps"));

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

  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  const handleSave = async () => {
    setSaving(true);

    const providers: string[] = [];
    if (stripeEnabled) providers.push("stripe");
    if (vippsEnabled) providers.push("vipps");

    await setSettings({
      [SETTING_KEYS.INVOICE_BANK_ACCOUNT]: bankAccount,
      [SETTING_KEYS.INVOICE_PAYMENT_TERMS]: paymentTerms,
      [SETTING_KEYS.PAYMENT_PROVIDERS_ENABLED]: providers.join(","),
      [SETTING_KEYS.PAYMENT_STRIPE_SECRET_KEY]: stripeSecretKey,
      [SETTING_KEYS.PAYMENT_STRIPE_PUBLISHABLE_KEY]: stripePublishableKey,
      [SETTING_KEYS.PAYMENT_STRIPE_WEBHOOK_SECRET]: stripeWebhookSecret,
      [SETTING_KEYS.PAYMENT_VIPPS_CLIENT_ID]: vippsClientId,
      [SETTING_KEYS.PAYMENT_VIPPS_CLIENT_SECRET]: vippsClientSecret,
      [SETTING_KEYS.PAYMENT_VIPPS_SUBSCRIPTION_KEY]: vippsSubscriptionKey,
      [SETTING_KEYS.PAYMENT_VIPPS_MSN]: vippsMsn,
      [SETTING_KEYS.PAYMENT_VIPPS_USE_TEST]: vippsTestMode ? "true" : "false",
    });

    setSaving(false);
    router.refresh();
    toast.success("Payment settings saved");
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
          <CardTitle className="text-lg">Payment Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Bank account and payment terms shown on invoices.
          </p>

          <div className="space-y-2">
            <Label htmlFor="bankAccount">Bank Account (IBAN / Til Konto)</Label>
            <Input
              id="bankAccount"
              placeholder="NO93 8601 1117 947"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Your bank account number or IBAN for receiving payments
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentTerms">Payment Terms</Label>
            <Input
              id="paymentTerms"
              placeholder="Net 14 days"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Payment terms text displayed on invoices (e.g. &quot;Net 14 days&quot;, &quot;Due on receipt&quot;)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Online Payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Allow customers to pay invoices online via shared invoice links.
          </p>

          {/* Stripe */}
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Stripe</Label>
                <p className="text-xs text-muted-foreground">Accept credit/debit card payments</p>
              </div>
              <Switch checked={stripeEnabled} onCheckedChange={setStripeEnabled} />
            </div>

            {stripeEnabled && (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="stripeSecretKey">Secret Key</Label>
                  <Input
                    id="stripeSecretKey"
                    type="password"
                    placeholder="sk_live_..."
                    value={stripeSecretKey}
                    onChange={(e) => setStripeSecretKey(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stripePublishableKey">Publishable Key</Label>
                  <Input
                    id="stripePublishableKey"
                    type="password"
                    placeholder="pk_live_..."
                    value={stripePublishableKey}
                    onChange={(e) => setStripePublishableKey(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stripeWebhookSecret">Webhook Secret</Label>
                  <Input
                    id="stripeWebhookSecret"
                    type="password"
                    placeholder="whsec_..."
                    value={stripeWebhookSecret}
                    onChange={(e) => setStripeWebhookSecret(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Webhook URL</Label>
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
                    Add this URL in your Stripe Dashboard under Webhooks. Subscribe to <code className="text-xs">checkout.session.completed</code>.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Vipps */}
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Vipps</Label>
                <p className="text-xs text-muted-foreground">Accept Vipps mobile payments (Norway)</p>
              </div>
              <Switch checked={vippsEnabled} onCheckedChange={setVippsEnabled} />
            </div>

            {vippsEnabled && (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="vippsClientId">Client ID</Label>
                  <Input
                    id="vippsClientId"
                    type="password"
                    placeholder="Client ID"
                    value={vippsClientId}
                    onChange={(e) => setVippsClientId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vippsClientSecret">Client Secret</Label>
                  <Input
                    id="vippsClientSecret"
                    type="password"
                    placeholder="Client Secret"
                    value={vippsClientSecret}
                    onChange={(e) => setVippsClientSecret(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vippsSubscriptionKey">Subscription Key</Label>
                  <Input
                    id="vippsSubscriptionKey"
                    type="password"
                    placeholder="Ocp-Apim-Subscription-Key"
                    value={vippsSubscriptionKey}
                    onChange={(e) => setVippsSubscriptionKey(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vippsMsn">Merchant Serial Number</Label>
                  <Input
                    id="vippsMsn"
                    placeholder="123456"
                    value={vippsMsn}
                    onChange={(e) => setVippsMsn(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={vippsTestMode} onCheckedChange={setVippsTestMode} />
                  <Label>Test Mode</Label>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Callback URL</Label>
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
                Save Payment Settings
              </Button>
            </div>
          </SaveButton>
        </CardContent>
      </Card>
      </ReadOnlyWrapper>
    </div>
  );
}
