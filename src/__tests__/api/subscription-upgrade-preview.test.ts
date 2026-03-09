import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSubscriptionsRetrieve = vi.fn();
const mockInvoicesCreatePreview = vi.fn();

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
    subscription: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/stripe-config", () => ({
  getStripeConfig: vi.fn(),
  getStripeClient: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStripeClient, getStripeConfig } from "@/lib/stripe-config";
import { POST } from "@/app/api/protected/subscription/upgrade-preview/route";

const mockGetSession = vi.mocked(auth.api.getSession);
const mockFindMember = vi.mocked(db.organizationMember.findFirst);
const mockFindSubscription = vi.mocked(db.subscription.findUnique);
const mockGetStripeConfig = vi.mocked(getStripeConfig);
const mockGetStripeClient = vi.mocked(getStripeClient);

function setupAuth() {
  mockGetSession.mockResolvedValue({
    user: { id: "user-1", email: "user@example.com" },
  } as any);
  mockFindMember.mockResolvedValue({ organizationId: "org-1" } as any);
}

function setupStripe() {
  mockGetStripeConfig.mockResolvedValue({
    secretKey: "sk_test",
    webhookSecret: "whsec_test",
    proPriceId: "price_pro",
    enterprisePriceId: "price_enterprise",
  });
  mockGetStripeClient.mockResolvedValue({
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
    invoices: { createPreview: mockInvoicesCreatePreview },
  } as any);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/protected/subscription/upgrade-preview", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 400 when no subscription exists", async () => {
    setupAuth();
    mockFindSubscription.mockResolvedValue(null);

    const res = await POST();
    expect(res.status).toBe(400);
  });

  it("returns only proration amount, not full invoice", async () => {
    setupAuth();
    mockFindSubscription.mockResolvedValue({
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      status: "active",
    } as any);
    setupStripe();

    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_123",
      items: { data: [{ id: "si_item_1" }] },
    });

    // Simulate Stripe preview with proration items + next period charge
    mockInvoicesCreatePreview.mockResolvedValue({
      amount_due: 18100, // Total including next period — should NOT be used
      currency: "usd",
      lines: {
        data: [
          { type: "invoiceitem", amount: -9900 }, // Credit for unused Pro
          { type: "invoiceitem", amount: 13900 }, // Charge for Enterprise remainder
          { type: "subscription", amount: 14000 }, // Next period (should be excluded)
        ],
      },
    });

    const res = await POST();
    expect(res.status).toBe(200);
    const data = await res.json();
    // Only proration items: -9900 + 13900 = 4000 cents = $40.00
    expect(data.amountDue).toBe(40);
    expect(data.currency).toBe("usd");
    expect(data.prorationDate).toBeTypeOf("number");
  });

  it("returns 0 when proration is negative", async () => {
    setupAuth();
    mockFindSubscription.mockResolvedValue({
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      status: "active",
    } as any);
    setupStripe();

    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_123",
      items: { data: [{ id: "si_item_1" }] },
    });

    mockInvoicesCreatePreview.mockResolvedValue({
      amount_due: 0,
      currency: "usd",
      lines: {
        data: [
          { type: "invoiceitem", amount: -5000 },
        ],
      },
    });

    const res = await POST();
    const data = await res.json();
    expect(data.amountDue).toBe(0);
  });

  it("calls Stripe createPreview with correct params", async () => {
    setupAuth();
    mockFindSubscription.mockResolvedValue({
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      status: "active",
    } as any);
    setupStripe();

    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_123",
      items: { data: [{ id: "si_item_1" }] },
    });

    mockInvoicesCreatePreview.mockResolvedValue({
      amount_due: 0,
      currency: "usd",
      lines: { data: [] },
    });

    await POST();

    expect(mockInvoicesCreatePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_123",
        subscription: "sub_123",
        subscription_details: expect.objectContaining({
          items: [{ id: "si_item_1", price: "price_enterprise" }],
        }),
      }),
    );
  });

  it("returns 400 when subscription is not active", async () => {
    setupAuth();
    mockFindSubscription.mockResolvedValue({
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      status: "canceled",
    } as any);

    const res = await POST();
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Subscription is not active");
  });
});
