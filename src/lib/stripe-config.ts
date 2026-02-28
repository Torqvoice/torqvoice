import Stripe from "stripe";
import { db } from "./db";

export type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  proPriceId: string;
  enterprisePriceId: string;
};

/**
 * Read Stripe configuration from DB (system_settings), falling back to env vars.
 * The active mode is determined by the `stripe.mode` setting (default: env
 * STRIPE_MODE or "live").
 */
export async function getStripeConfig(): Promise<StripeConfig> {
  const rows = await db.systemSetting.findMany({
    where: { key: { startsWith: "stripe." } },
  });

  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.value) map.set(row.key, row.value);
  }

  const mode =
    map.get("stripe.mode") || process.env.STRIPE_MODE || "live";

  const secretKey =
    map.get(`stripe.${mode}.secretKey`) ||
    process.env.STRIPE_SECRET_KEY ||
    "";

  const webhookSecret =
    map.get(`stripe.${mode}.webhookSecret`) ||
    process.env.STRIPE_WEBHOOK_SECRET ||
    "";

  const proPriceId =
    map.get(`stripe.${mode}.proPriceId`) ||
    process.env.STRIPE_PRO_PRICE_ID ||
    "";

  const enterprisePriceId =
    map.get(`stripe.${mode}.enterprisePriceId`) ||
    process.env.STRIPE_ENTERPRISE_PRICE_ID ||
    "";

  return { secretKey, webhookSecret, proPriceId, enterprisePriceId };
}

/**
 * Create a Stripe client using DB-driven config.
 * A new instance is created on every call so key changes take effect immediately.
 */
export async function getStripeClient(): Promise<Stripe> {
  const config = await getStripeConfig();
  if (!config.secretKey) {
    throw new Error("Stripe secret key is not configured");
  }
  return new Stripe(config.secretKey);
}
