"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Check,
  Crown,
  CreditCard,
  Loader2,
  Shield,
  X,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { cancelSubscription, resumeSubscription } from "@/features/subscription/Actions/subscriptionActions";
import type { PlanFeatures } from "@/lib/features";

type Props = {
  plan: string;
  status: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  currentPeriodStart: string | null;
  planPrice: number;
  planInterval: string;
  hasStripeCustomer: boolean;
  usage: { customers: number; members: number };
  features: PlanFeatures;
};

export function SubscriptionSettings({
  plan,
  status,
  cancelAtPeriodEnd,
  currentPeriodEnd,
  currentPeriodStart,
  planPrice,
  planInterval,
  hasStripeCustomer,
  usage,
  features,
}: Props) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [checkoutLoading, setCheckoutLoading] = useState<"pro" | "enterprise" | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);

  const isPaid = plan === "pro" || plan === "enterprise";
  const isCanceling = cancelAtPeriodEnd && status === "active";
  const isPastDue = status === "past_due";

  const handleCheckout = async (selectedPlan: "pro" | "enterprise") => {
    setCheckoutLoading(selectedPlan);
    try {
      const res = await fetch("/api/protected/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error ?? "Failed to start checkout");
        setCheckoutLoading(null);
      }
    } catch {
      toast.error("Failed to start checkout");
      setCheckoutLoading(null);
    }
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    const result = await cancelSubscription();
    if (result.success) {
      toast.success(t("subscription.cancelSuccess"));
      router.refresh();
    } else {
      toast.error(result.error ?? t("subscription.cancelError"));
    }
    setCancelLoading(false);
  };

  const handleResume = async () => {
    setResumeLoading(true);
    const result = await resumeSubscription();
    if (result.success) {
      toast.success(t("subscription.resumeSuccess"));
      router.refresh();
    } else {
      toast.error(result.error ?? t("subscription.resumeError"));
    }
    setResumeLoading(false);
  };

  const handleBillingPortal = async () => {
    setBillingLoading(true);
    try {
      const res = await fetch("/api/protected/subscription/billing-portal", {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error ?? t("subscription.billingPortalError"));
        setBillingLoading(false);
      }
    } catch {
      toast.error(t("subscription.billingPortalError"));
      setBillingLoading(false);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const intervalLabel = planInterval === "month" ? t("subscription.perMonth") : t("subscription.perYear");

  const planIcon = plan === "enterprise" ? (
    <Crown className="h-5 w-5" />
  ) : plan === "pro" ? (
    <Zap className="h-5 w-5" />
  ) : (
    <Shield className="h-5 w-5" />
  );

  const planBadge = plan === "enterprise" ? (
    <Badge className="bg-purple-600 hover:bg-purple-700">{t("subscription.planEnterprise")}</Badge>
  ) : plan === "pro" ? (
    <Badge className="bg-blue-600 hover:bg-blue-700">{t("subscription.planPro")}</Badge>
  ) : (
    <Badge variant="secondary">{t("subscription.planFree")}</Badge>
  );

  const statusBadge = isPastDue ? (
    <Badge variant="destructive">{t("subscription.statusPastDue")}</Badge>
  ) : isCanceling ? (
    <Badge variant="outline" className="border-yellow-500 text-yellow-600">
      {t("subscription.statusCanceling")}
    </Badge>
  ) : status === "active" ? (
    <Badge variant="outline" className="border-green-500 text-green-600">
      {t("subscription.statusActive")}
    </Badge>
  ) : null;

  const featureRows: { label: string; type: "usage" | "boolean"; value: boolean | string }[] = [
    {
      label: t("subscription.featureCustomers"),
      type: "usage",
      value: features.maxCustomers >= 999999
        ? t("subscription.usageUnlimited", { used: String(usage.customers) })
        : t("subscription.usageOf", { used: String(usage.customers), limit: String(features.maxCustomers) }),
    },
    {
      label: t("subscription.featureTeamMembers"),
      type: "usage",
      value: features.maxUsers >= 999999
        ? t("subscription.usageUnlimited", { used: String(usage.members) })
        : t("subscription.usageOf", { used: String(usage.members), limit: String(features.maxUsers) }),
    },
    { label: t("subscription.featureSmtp"), type: "boolean", value: features.smtp },
    { label: t("subscription.featureApi"), type: "boolean", value: features.api },
    { label: t("subscription.featurePayments"), type: "boolean", value: features.payments },
    { label: t("subscription.featureCustomFields"), type: "boolean", value: features.customFields },
    { label: t("subscription.featureSms"), type: "boolean", value: features.sms },
    { label: t("subscription.featureCustomerPortal"), type: "boolean", value: features.customerPortal },
    { label: t("subscription.featureCustomTemplates"), type: "boolean", value: features.customTemplates },
    { label: t("subscription.featureBrandingRemoved"), type: "boolean", value: features.brandingRemoved },
  ];

  return (
    <div className="space-y-6">
      {/* Card 1: Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {planIcon}
            {t("subscription.title")}
          </CardTitle>
          <CardDescription>{t("subscription.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Label>{t("subscription.currentPlan")}:</Label>
            {planBadge}
            {statusBadge}
          </div>

          {isPaid && planPrice > 0 && (
            <div className="text-sm text-muted-foreground">
              ${planPrice}/{intervalLabel}
            </div>
          )}

          {isPaid && currentPeriodStart && currentPeriodEnd && (
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{t("subscription.billingPeriod")}:</span>
                <span>
                  {t("subscription.billingPeriodDates", {
                    start: formatDate(currentPeriodStart),
                    end: formatDate(currentPeriodEnd),
                  })}
                </span>
              </div>
              {!isCanceling && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{t("subscription.nextRenewal")}:</span>
                  <span>{formatDate(currentPeriodEnd)}</span>
                </div>
              )}
            </div>
          )}

          {isPastDue && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">
                {t("subscription.pastDueWarning")}
              </p>
            </div>
          )}

          {isCanceling && currentPeriodEnd && (
            <div className="flex items-center gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3">
              <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
              <p className="text-sm text-yellow-600">
                {t("subscription.cancelingWarning", { date: formatDate(currentPeriodEnd) })}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 2: Plan Features */}
      <Card>
        <CardHeader>
          <CardTitle>{t("subscription.featuresTitle")}</CardTitle>
          <CardDescription>{t("subscription.featuresDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {featureRows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <span className="text-sm">{row.label}</span>
                {row.type === "usage" ? (
                  <span className="text-sm text-muted-foreground">{row.value as string}</span>
                ) : row.value ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <Check className="h-4 w-4" />
                    <span className="text-xs">{t("subscription.included")}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <X className="h-4 w-4" />
                    <span className="text-xs">{t("subscription.notIncluded")}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Manage Subscription */}
      {isPaid && (
        <Card>
          <CardHeader>
            <CardTitle>{t("subscription.manageTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {hasStripeCustomer && (
              <Button
                variant="outline"
                onClick={handleBillingPortal}
                disabled={billingLoading}
              >
                {billingLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                {t("subscription.manageBilling")}
              </Button>
            )}

            {isCanceling ? (
              <Button
                variant="default"
                onClick={handleResume}
                disabled={resumeLoading}
              >
                {resumeLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("subscription.resumeSubscription")}
              </Button>
            ) : (
              status === "active" && !cancelAtPeriodEnd && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                      {t("subscription.cancelSubscription")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("subscription.cancelDialogTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("subscription.cancelDialogDescription", {
                          date: formatDate(currentPeriodEnd),
                        })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("subscription.cancelDialogCancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={handleCancel}
                        disabled={cancelLoading}
                      >
                        {cancelLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t("subscription.cancelDialogConfirm")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )
            )}
          </CardContent>
        </Card>
      )}

      {/* Upgrade Section */}
      {plan === "free" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("subscription.upgradeTitle")}</CardTitle>
            <CardDescription>{t("subscription.upgradeToProDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => handleCheckout("pro")}
                disabled={checkoutLoading !== null}
              >
                {checkoutLoading === "pro" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-4 w-4" />
                )}
                {t("subscription.upgradeToPro")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCheckout("enterprise")}
                disabled={checkoutLoading !== null}
              >
                {checkoutLoading === "enterprise" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Crown className="mr-2 h-4 w-4" />
                )}
                {t("subscription.upgradeToEnterprise")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {plan === "pro" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("subscription.upgradeTitle")}</CardTitle>
            <CardDescription>{t("subscription.upgradeToEnterpriseDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCheckout("enterprise")}
              disabled={checkoutLoading !== null}
            >
              {checkoutLoading === "enterprise" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Crown className="mr-2 h-4 w-4" />
              )}
              {t("subscription.upgradeToEnterprise")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
