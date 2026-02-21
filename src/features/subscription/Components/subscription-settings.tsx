"use client";

import { useState } from "react";
import { toast } from "sonner";
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
import { Crown, Loader2, Shield, Zap } from "lucide-react";

export function SubscriptionSettings({
  plan,
  status,
  cancelAtPeriodEnd,
  currentPeriodEnd,
}: {
  plan: string;
  status: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}) {
  const [checkoutLoading, setCheckoutLoading] = useState<"pro" | "enterprise" | null>(null);

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {plan === "enterprise" ? (
              <Crown className="h-5 w-5" />
            ) : plan === "pro" ? (
              <Zap className="h-5 w-5" />
            ) : (
              <Shield className="h-5 w-5" />
            )}
            Subscription Plan
          </CardTitle>
          <CardDescription>
            Your organization&apos;s current Torqvoice subscription tier and available features.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Label>Current Plan:</Label>
            {plan === "enterprise" ? (
              <Badge className="bg-purple-600 hover:bg-purple-700">Enterprise</Badge>
            ) : plan === "pro" ? (
              <Badge className="bg-blue-600 hover:bg-blue-700">Torq Pro</Badge>
            ) : (
              <Badge variant="secondary">Free</Badge>
            )}
          </div>

          {status === "past_due" && (
            <p className="text-sm text-destructive">
              Your payment is past due. Please update your payment method to avoid service interruption.
            </p>
          )}

          {cancelAtPeriodEnd && currentPeriodEnd && (
            <p className="text-sm text-muted-foreground">
              Your subscription will cancel at the end of the current period ({new Date(currentPeriodEnd).toLocaleDateString()}).
            </p>
          )}

          {plan === "free" && (
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-sm text-muted-foreground">
                Upgrade to unlock unlimited customers, team members, reports, SMTP, API access, and more.
              </p>
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
                  Upgrade to Pro — $99/yr
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
                  Enterprise — $140/yr
                </Button>
              </div>
            </div>
          )}

          {plan === "pro" && (
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-sm text-muted-foreground">
                Need more than 5 team members? Upgrade to Enterprise for up to 50 users.
              </p>
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
                Upgrade to Enterprise — $140/yr
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
