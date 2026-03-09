import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- Module mocks (hoisted) ----------

const mockSubscriptionsRetrieve = vi.fn();
const mockSubscriptionsUpdate = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: {
    api: { getSession: vi.fn() },
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/db", () => ({
  db: {
    organizationMember: { findFirst: vi.fn() },
    subscription: { findUnique: vi.fn(), update: vi.fn() },
    subscriptionPlan: { upsert: vi.fn() },
    appSetting: { upsert: vi.fn() },
  },
}));

vi.mock("@/lib/stripe-config", () => ({
  getStripeConfig: vi.fn(),
  getStripeClient: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStripeClient, getStripeConfig } from "@/lib/stripe-config";
import { POST } from "@/app/api/protected/subscription/upgrade/route";

const mockGetSession = vi.mocked(auth.api.getSession);
const mockFindMember = vi.mocked(db.organizationMember.findFirst);
const mockFindSubscription = vi.mocked(db.subscription.findUnique);
const mockUpdateSubscription = vi.mocked(db.subscription.update);
const mockUpsertPlan = vi.mocked(db.subscriptionPlan.upsert);
const mockUpsertSetting = vi.mocked(db.appSetting.upsert);
const mockGetStripeConfig = vi.mocked(getStripeConfig);
const mockGetStripeClient = vi.mocked(getStripeClient);

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/protected/subscription/upgrade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupAuth(userId = "user-1", orgId = "org-1") {
  mockGetSession.mockResolvedValue({
    user: { id: userId, email: "user@example.com" },
  } as any);
  mockFindMember.mockResolvedValue({ organizationId: orgId } as any);
}

function setupStripe() {
  mockGetStripeConfig.mockResolvedValue({
    secretKey: "sk_test",
    webhookSecret: "whsec_test",
    proPriceId: "price_pro",
    enterprisePriceId: "price_enterprise",
  });
  mockGetStripeClient.mockResolvedValue({
    subscriptions: {
      retrieve: mockSubscriptionsRetrieve,
      update: mockSubscriptionsUpdate,
    },
  } as any);
}

function setupActiveSubscription() {
  mockFindSubscription.mockResolvedValue({
    stripeSubscriptionId: "sub_123",
    status: "active",
    organizationId: "org-1",
    plan: { name: "Torq Pro", stripePriceId: "price_pro" },
  } as any);
}

function setupStripeResponses() {
  mockSubscriptionsRetrieve.mockResolvedValue({
    id: "sub_123",
    items: {
      data: [{ id: "si_item_1", price: { id: "price_pro" } }],
    },
  });
  mockSubscriptionsUpdate.mockResolvedValue({
    id: "sub_123",
    items: {
      data: [
        {
          id: "si_item_1",
          price: { id: "price_enterprise" },
          current_period_start: 1700000000,
          current_period_end: 1731536000,
        },
      ],
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/protected/subscription/upgrade", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ plan: "enterprise" }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when user has no organization", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1" },
    } as any);
    mockFindMember.mockResolvedValue(null);

    const res = await POST(makeRequest({ plan: "enterprise" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("No organization found");
  });

  it("returns 400 for invalid plan (not enterprise)", async () => {
    setupAuth();
    const res = await POST(makeRequest({ plan: "pro" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Can only upgrade to enterprise");
  });

  it("returns 400 when no subscription exists", async () => {
    setupAuth();
    mockFindSubscription.mockResolvedValue(null);

    const res = await POST(makeRequest({ plan: "enterprise" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("No active subscription found");
  });

  it("returns 400 when subscription is not active", async () => {
    setupAuth();
    mockFindSubscription.mockResolvedValue({
      stripeSubscriptionId: "sub_123",
      status: "canceled",
    } as any);

    const res = await POST(makeRequest({ plan: "enterprise" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Subscription is not active");
  });

  it("returns 500 when enterprise price ID is not configured", async () => {
    setupAuth();
    setupActiveSubscription();
    mockGetStripeConfig.mockResolvedValue({
      secretKey: "sk_test",
      webhookSecret: "whsec_test",
      proPriceId: "price_pro",
      enterprisePriceId: "",
    });

    const res = await POST(makeRequest({ plan: "enterprise" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Enterprise price ID not configured");
  });

  it("returns 400 when stripe subscription has no items", async () => {
    setupAuth();
    setupActiveSubscription();
    setupStripe();
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_123",
      items: { data: [] },
    });

    const res = await POST(makeRequest({ plan: "enterprise" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("No subscription item found");
  });

  it("successfully upgrades from pro to enterprise with proration", async () => {
    setupAuth("user-1", "org-1");
    setupActiveSubscription();
    setupStripe();
    setupStripeResponses();
    mockUpsertPlan.mockResolvedValue({ id: "plan-ent" } as any);
    mockUpdateSubscription.mockResolvedValue({} as any);
    mockUpsertSetting.mockResolvedValue({} as any);

    const res = await POST(makeRequest({ plan: "enterprise" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify Stripe was called with correct proration
    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith("sub_123");
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_123", {
      items: [{ id: "si_item_1", price: "price_enterprise" }],
      proration_behavior: "always_invoice",
      metadata: { plan: "enterprise", organizationId: "org-1" },
    });

    // Verify DB plan upsert
    expect(mockUpsertPlan).toHaveBeenCalledWith({
      where: { stripePriceId: "price_enterprise" },
      create: {
        name: "Enterprise",
        stripePriceId: "price_enterprise",
        price: 140,
        interval: "year",
        maxMembers: 50,
      },
      update: {},
    });

    // Verify DB subscription update
    expect(mockUpdateSubscription).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      data: {
        planId: "plan-ent",
        status: "active",
        currentPeriodStart: new Date(1700000000 * 1000),
        currentPeriodEnd: new Date(1731536000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });

    // Verify license plan updated
    expect(mockUpsertSetting).toHaveBeenCalledWith({
      where: {
        organizationId_key: {
          organizationId: "org-1",
          key: "license.plan",
        },
      },
      create: {
        organizationId: "org-1",
        key: "license.plan",
        value: "enterprise",
        userId: "",
      },
      update: { value: "enterprise" },
    });
  });

  it("returns 500 when Stripe API fails", async () => {
    setupAuth();
    setupActiveSubscription();
    setupStripe();
    mockSubscriptionsRetrieve.mockRejectedValue(new Error("Stripe API error"));

    const res = await POST(makeRequest({ plan: "enterprise" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Stripe API error");
  });

  it("returns 500 when Stripe update fails", async () => {
    setupAuth();
    setupActiveSubscription();
    setupStripe();
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_123",
      items: { data: [{ id: "si_item_1" }] },
    });
    mockSubscriptionsUpdate.mockRejectedValue(
      new Error("Card was declined"),
    );

    const res = await POST(makeRequest({ plan: "enterprise" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Card was declined");
  });

  it("handles subscription with past_due status", async () => {
    setupAuth();
    mockFindSubscription.mockResolvedValue({
      stripeSubscriptionId: "sub_123",
      status: "past_due",
    } as any);

    const res = await POST(makeRequest({ plan: "enterprise" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Subscription is not active");
  });

  it("handles subscription without stripeSubscriptionId", async () => {
    setupAuth();
    mockFindSubscription.mockResolvedValue({
      stripeSubscriptionId: null,
      status: "active",
    } as any);

    const res = await POST(makeRequest({ plan: "enterprise" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("No active subscription found");
  });
});
