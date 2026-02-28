import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    subscription: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { getFeatures, PLAN_FEATURES } from "@/lib/features";

const mockFindUnique = vi.mocked(db.subscription.findUnique);
const mockFindMany = vi.mocked(db.appSetting.findMany);

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("getFeatures — cloud mode", () => {
  beforeEach(() => {
    vi.stubEnv("TORQVOICE_MODE", "cloud");
  });

  it("returns free features when no subscription exists", async () => {
    mockFindUnique.mockResolvedValue(null);
    const features = await getFeatures("org-1");
    expect(features).toEqual(PLAN_FEATURES.free);
  });

  it("returns free features when subscription status is canceled", async () => {
    mockFindUnique.mockResolvedValue({
      status: "canceled",
      plan: { name: "Torq Pro" },
      currentPeriodEnd: null,
    } as any);
    const features = await getFeatures("org-1");
    expect(features).toEqual(PLAN_FEATURES.free);
  });

  it("returns pro features for plan named 'Torq Pro'", async () => {
    mockFindUnique.mockResolvedValue({
      status: "active",
      plan: { name: "Torq Pro" },
      currentPeriodEnd: new Date(Date.now() + 86400000),
    } as any);
    const features = await getFeatures("org-1");
    expect(features).toEqual(PLAN_FEATURES.pro);
  });

  it("returns pro features for plan named 'Pro'", async () => {
    mockFindUnique.mockResolvedValue({
      status: "active",
      plan: { name: "Pro" },
      currentPeriodEnd: new Date(Date.now() + 86400000),
    } as any);
    const features = await getFeatures("org-1");
    expect(features).toEqual(PLAN_FEATURES.pro);
  });

  it("returns enterprise features for plan named 'Enterprise'", async () => {
    mockFindUnique.mockResolvedValue({
      status: "active",
      plan: { name: "Enterprise" },
      currentPeriodEnd: new Date(Date.now() + 86400000),
    } as any);
    const features = await getFeatures("org-1");
    expect(features).toEqual(PLAN_FEATURES.enterprise);
  });

  it("returns pro features for trialing subscription", async () => {
    mockFindUnique.mockResolvedValue({
      status: "trialing",
      plan: { name: "Torq Pro" },
      currentPeriodEnd: new Date(Date.now() + 86400000),
    } as any);
    const features = await getFeatures("org-1");
    expect(features).toEqual(PLAN_FEATURES.pro);
  });

  it("returns free features when past_due", async () => {
    mockFindUnique.mockResolvedValue({
      status: "past_due",
      plan: { name: "Torq Pro" },
      currentPeriodEnd: null,
    } as any);
    const features = await getFeatures("org-1");
    expect(features).toEqual(PLAN_FEATURES.free);
  });

  it("returns free features when period ended and grace period elapsed", async () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    mockFindUnique.mockResolvedValue({
      status: "active",
      plan: { name: "Torq Pro" },
      currentPeriodEnd: fourDaysAgo,
    } as any);
    const features = await getFeatures("org-1");
    expect(features).toEqual(PLAN_FEATURES.free);
  });

  it("returns pro features within grace period after period end", async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    mockFindUnique.mockResolvedValue({
      status: "active",
      plan: { name: "Torq Pro" },
      currentPeriodEnd: oneHourAgo,
    } as any);
    const features = await getFeatures("org-1");
    expect(features).toEqual(PLAN_FEATURES.pro);
  });

  it("returns free features for unknown plan name", async () => {
    mockFindUnique.mockResolvedValue({
      status: "active",
      plan: { name: "Unknown Plan" },
      currentPeriodEnd: new Date(Date.now() + 86400000),
    } as any);
    const features = await getFeatures("org-1");
    expect(features).toEqual(PLAN_FEATURES.free);
  });
});

describe("getFeatures — self-hosted mode", () => {
  beforeEach(() => {
    vi.stubEnv("TORQVOICE_MODE", "self-hosted");
  });

  it("unlocks all features except branding when no license", async () => {
    mockFindMany.mockResolvedValue([]);
    const features = await getFeatures("org-1");
    expect(features.smtp).toBe(true);
    expect(features.api).toBe(true);
    expect(features.payments).toBe(true);
    expect(features.brandingRemoved).toBe(false);
    expect(features.customPlatformName).toBe(false);
  });

  it("unlocks branding when license is valid and not expired", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    mockFindMany.mockResolvedValue([
      { key: "license.valid", value: "true" },
      { key: "license.expiresAt", value: future },
    ] as any);
    const features = await getFeatures("org-1");
    expect(features.brandingRemoved).toBe(true);
    expect(features.customPlatformName).toBe(true);
  });

  it("does not unlock branding when license is expired", async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    mockFindMany.mockResolvedValue([
      { key: "license.valid", value: "true" },
      { key: "license.expiresAt", value: past },
    ] as any);
    const features = await getFeatures("org-1");
    expect(features.brandingRemoved).toBe(false);
  });

  it("does not unlock branding when license.valid is false", async () => {
    mockFindMany.mockResolvedValue([
      { key: "license.valid", value: "false" },
    ] as any);
    const features = await getFeatures("org-1");
    expect(features.brandingRemoved).toBe(false);
  });
});
