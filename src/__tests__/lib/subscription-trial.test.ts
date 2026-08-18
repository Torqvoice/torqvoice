import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    subscription: { findUnique: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { isTrialEligible, TRIAL_PERIOD_DAYS } from "@/lib/subscription-trial";

const mockFindUnique = vi.mocked(db.subscription.findUnique);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("isTrialEligible", () => {
  it("is eligible when the org never had a subscription row", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(isTrialEligible("org-1")).resolves.toBe(true);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      select: { id: true },
    });
  });

  it("is not eligible when an active subscription exists", async () => {
    mockFindUnique.mockResolvedValue({ id: "sub-1" } as any);
    await expect(isTrialEligible("org-1")).resolves.toBe(false);
  });

  it("is not eligible when a canceled subscription row persists", async () => {
    // Rows persist after cancellation; a prior subscription (or a used trial)
    // means no second trial.
    mockFindUnique.mockResolvedValue({ id: "sub-canceled" } as any);
    await expect(isTrialEligible("org-1")).resolves.toBe(false);
  });

  it("is not eligible for orgs with an admin-granted demo row", async () => {
    mockFindUnique.mockResolvedValue({ id: "sub-demo" } as any);
    await expect(isTrialEligible("org-1")).resolves.toBe(false);
  });

  it("exposes a 14-day trial length", () => {
    expect(TRIAL_PERIOD_DAYS).toBe(14);
  });
});
