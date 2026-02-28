import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    systemSetting: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { getStripeConfig } from "@/lib/stripe-config";

const mockFindMany = vi.mocked(db.systemSetting.findMany);

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("getStripeConfig", () => {
  it("reads test mode keys from DB when mode is test", async () => {
    mockFindMany.mockResolvedValue([
      { id: "1", key: "stripe.mode", value: "test" },
      { id: "2", key: "stripe.test.secretKey", value: "sk_test_db" },
      { id: "3", key: "stripe.test.webhookSecret", value: "whsec_test_db" },
      { id: "4", key: "stripe.test.proPriceId", value: "price_pro_test" },
      { id: "5", key: "stripe.test.enterprisePriceId", value: "price_ent_test" },
    ] as any);

    const config = await getStripeConfig();
    expect(config.secretKey).toBe("sk_test_db");
    expect(config.webhookSecret).toBe("whsec_test_db");
    expect(config.proPriceId).toBe("price_pro_test");
    expect(config.enterprisePriceId).toBe("price_ent_test");
  });

  it("reads live mode keys from DB when mode is live", async () => {
    mockFindMany.mockResolvedValue([
      { id: "1", key: "stripe.mode", value: "live" },
      { id: "2", key: "stripe.live.secretKey", value: "sk_live_db" },
      { id: "3", key: "stripe.live.webhookSecret", value: "whsec_live_db" },
      { id: "4", key: "stripe.live.proPriceId", value: "price_pro_live" },
      { id: "5", key: "stripe.live.enterprisePriceId", value: "price_ent_live" },
    ] as any);

    const config = await getStripeConfig();
    expect(config.secretKey).toBe("sk_live_db");
    expect(config.webhookSecret).toBe("whsec_live_db");
    expect(config.proPriceId).toBe("price_pro_live");
    expect(config.enterprisePriceId).toBe("price_ent_live");
  });

  it("falls back to env vars when DB values are empty", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_env");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_env");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro_env");
    vi.stubEnv("STRIPE_ENTERPRISE_PRICE_ID", "price_ent_env");

    mockFindMany.mockResolvedValue([]);

    const config = await getStripeConfig();
    expect(config.secretKey).toBe("sk_env");
    expect(config.webhookSecret).toBe("whsec_env");
    expect(config.proPriceId).toBe("price_pro_env");
    expect(config.enterprisePriceId).toBe("price_ent_env");
  });

  it("defaults to live mode when no mode is set", async () => {
    mockFindMany.mockResolvedValue([
      { id: "1", key: "stripe.live.secretKey", value: "sk_live_default" },
      { id: "2", key: "stripe.test.secretKey", value: "sk_test_should_not_use" },
    ] as any);

    const config = await getStripeConfig();
    expect(config.secretKey).toBe("sk_live_default");
  });

  it("uses STRIPE_MODE env var when no DB mode is set", async () => {
    vi.stubEnv("STRIPE_MODE", "test");

    mockFindMany.mockResolvedValue([
      { id: "1", key: "stripe.test.secretKey", value: "sk_test_via_env_mode" },
      { id: "2", key: "stripe.live.secretKey", value: "sk_live_should_not_use" },
    ] as any);

    const config = await getStripeConfig();
    expect(config.secretKey).toBe("sk_test_via_env_mode");
  });

  it("DB mode takes priority over STRIPE_MODE env var", async () => {
    vi.stubEnv("STRIPE_MODE", "test");

    mockFindMany.mockResolvedValue([
      { id: "1", key: "stripe.mode", value: "live" },
      { id: "2", key: "stripe.test.secretKey", value: "sk_test_no" },
      { id: "3", key: "stripe.live.secretKey", value: "sk_live_yes" },
    ] as any);

    const config = await getStripeConfig();
    expect(config.secretKey).toBe("sk_live_yes");
  });

  it("returns empty strings when nothing is configured", async () => {
    mockFindMany.mockResolvedValue([]);

    const config = await getStripeConfig();
    expect(config.secretKey).toBe("");
    expect(config.webhookSecret).toBe("");
    expect(config.proPriceId).toBe("");
    expect(config.enterprisePriceId).toBe("");
  });

  it("ignores DB rows with empty values and falls back to env", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_fallback");

    mockFindMany.mockResolvedValue([
      { id: "1", key: "stripe.mode", value: "test" },
      { id: "2", key: "stripe.test.secretKey", value: "" },
    ] as any);

    const config = await getStripeConfig();
    expect(config.secretKey).toBe("sk_fallback");
  });
});
