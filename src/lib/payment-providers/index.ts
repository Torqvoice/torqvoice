import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import type { PaymentProvider } from "./types";
import { StripeProvider } from "./stripe";
import { VippsProvider } from "./vipps";

export type { PaymentProvider, CheckoutRequest, CheckoutResult, VerifyResult } from "./types";

export function getPaymentProvider(
  provider: string,
  settings: Record<string, string>,
): PaymentProvider {
  switch (provider) {
    case "stripe": {
      const secretKey = settings[SETTING_KEYS.PAYMENT_STRIPE_SECRET_KEY];
      if (!secretKey) {
        throw new Error("Stripe secret key not configured");
      }
      return new StripeProvider(secretKey);
    }
    case "vipps": {
      const clientId = settings[SETTING_KEYS.PAYMENT_VIPPS_CLIENT_ID];
      const clientSecret = settings[SETTING_KEYS.PAYMENT_VIPPS_CLIENT_SECRET];
      const subscriptionKey = settings[SETTING_KEYS.PAYMENT_VIPPS_SUBSCRIPTION_KEY];
      const msn = settings[SETTING_KEYS.PAYMENT_VIPPS_MSN];
      if (!clientId || !clientSecret || !subscriptionKey || !msn) {
        throw new Error("Vipps credentials not fully configured");
      }
      return new VippsProvider({
        clientId,
        clientSecret,
        subscriptionKey,
        merchantSerialNumber: msn,
        useTestMode: settings[SETTING_KEYS.PAYMENT_VIPPS_USE_TEST] === "true",
      });
    }
    default:
      throw new Error(`Unknown payment provider: ${provider}`);
  }
}

export function getEnabledProviders(
  settings: Record<string, string>,
): string[] {
  const raw = settings[SETTING_KEYS.PAYMENT_PROVIDERS_ENABLED];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
