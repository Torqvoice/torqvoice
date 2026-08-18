/**
 * Tests for the first-run sample data lifecycle.
 *
 * The seed records every id it creates in one AppSetting row; removal must
 * delete exactly those ids (scoped to the organization), in an order that
 * respects the FK graph, and then clear the row. The checklist must exclude
 * the sample ids from its counts, so the steps only complete on real data.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cached-session", () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    customer: { count: vi.fn(), deleteMany: vi.fn() },
    vehicle: { count: vi.fn(), deleteMany: vi.fn() },
    serviceRecord: { count: vi.fn(), deleteMany: vi.fn() },
    quote: { deleteMany: vi.fn() },
    inspection: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";
import {
  getOnboardingChecklist,
  removeSampleData,
} from "@/features/onboarding/Actions/checklistActions";
import {
  parseSampleDataIds,
  hasAnySampleIds,
  EMPTY_SAMPLE_IDS,
} from "@/features/onboarding/Lib/onboardingKeys";

const ORG = "org-1";
const USER_ID = "user-1";

const SAMPLE_IDS = {
  customers: ["c1", "c2", "c3"],
  vehicles: ["v1", "v2", "v3", "v4"],
  serviceRecords: ["s1", "s2", "s3"],
  quotes: ["q1"],
  inspections: ["i1"],
};

function setupAuth() {
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: USER_ID, email: "user@example.com" },
  } as never);
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: "owner",
    roleId: null,
    customRole: null,
  } as never);
  vi.mocked(db.user.findUnique).mockResolvedValue({
    isSuperAdmin: false,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupAuth();
});

describe("parseSampleDataIds", () => {
  it("parses a recorded id set", () => {
    const ids = parseSampleDataIds(JSON.stringify(SAMPLE_IDS));
    expect(ids).toEqual(SAMPLE_IDS);
    expect(hasAnySampleIds(ids)).toBe(true);
  });

  it("survives missing, malformed and partial values", () => {
    expect(parseSampleDataIds(null)).toEqual(EMPTY_SAMPLE_IDS);
    expect(parseSampleDataIds("not json")).toEqual(EMPTY_SAMPLE_IDS);
    expect(parseSampleDataIds('{"customers": ["a", 5]}')).toEqual({
      ...EMPTY_SAMPLE_IDS,
      customers: ["a"],
    });
    expect(hasAnySampleIds(parseSampleDataIds(null))).toBe(false);
  });
});

describe("removeSampleData", () => {
  it("deletes exactly the recorded ids, org-scoped, and clears the marker", async () => {
    vi.mocked(db.appSetting.findFirst).mockResolvedValue({
      id: "setting-1",
      value: JSON.stringify(SAMPLE_IDS),
    } as never);
    vi.mocked(db.$transaction).mockResolvedValue([] as never);

    const result = await removeSampleData();
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ removed: true });

    expect(db.serviceRecord.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: { in: SAMPLE_IDS.serviceRecords } },
    });
    expect(db.quote.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: { in: SAMPLE_IDS.quotes } },
    });
    expect(db.inspection.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: { in: SAMPLE_IDS.inspections } },
    });
    expect(db.vehicle.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: { in: SAMPLE_IDS.vehicles } },
    });
    expect(db.customer.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: { in: SAMPLE_IDS.customers } },
    });
    expect(db.appSetting.delete).toHaveBeenCalledWith({
      where: { id: "setting-1" },
    });
    // Everything runs inside one transaction.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when nothing was recorded", async () => {
    vi.mocked(db.appSetting.findFirst).mockResolvedValue(null as never);

    const result = await removeSampleData();
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ removed: false });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("getOnboardingChecklist", () => {
  it("excludes sample ids from step detection", async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: "onboarding.checklistDismissed", value: "false" },
      { key: "onboarding.sampleDataIds", value: JSON.stringify(SAMPLE_IDS) },
    ] as never);
    // Only the sample rows exist, so every real count is zero.
    vi.mocked(db.customer.count).mockResolvedValue(0 as never);
    vi.mocked(db.vehicle.count).mockResolvedValue(0 as never);
    vi.mocked(db.serviceRecord.count).mockResolvedValue(0 as never);

    const result = await getOnboardingChecklist();
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      steps: { customer: false, vehicle: false, workOrder: false, invoice: false },
      allDone: false,
      hasSampleData: true,
    });

    expect(db.customer.count).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: { notIn: SAMPLE_IDS.customers } },
    });
    expect(db.serviceRecord.count).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: { notIn: SAMPLE_IDS.serviceRecords } },
    });
  });

  it("hides the card once dismissed", async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: "onboarding.checklistDismissed", value: "true" },
    ] as never);

    const result = await getOnboardingChecklist();
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
    expect(db.customer.count).not.toHaveBeenCalled();
  });

  it("hides the card for pre-existing orgs that already do everything", async () => {
    // No onboarding rows at all: an org that predates the checklist.
    vi.mocked(db.appSetting.findMany).mockResolvedValue([] as never);
    vi.mocked(db.customer.count).mockResolvedValue(12 as never);
    vi.mocked(db.vehicle.count).mockResolvedValue(30 as never);
    vi.mocked(db.serviceRecord.count).mockResolvedValue(80 as never);

    const result = await getOnboardingChecklist();
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  it("shows open steps for pre-existing orgs with partial data", async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([] as never);
    vi.mocked(db.customer.count).mockResolvedValue(3 as never);
    vi.mocked(db.vehicle.count).mockResolvedValue(2 as never);
    // First serviceRecord.count call: any work order; second: shared invoices.
    vi.mocked(db.serviceRecord.count)
      .mockResolvedValueOnce(1 as never)
      .mockResolvedValueOnce(0 as never);

    const result = await getOnboardingChecklist();
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      steps: { customer: true, vehicle: true, workOrder: true, invoice: false },
      allDone: false,
      hasSampleData: false,
    });
  });

  it("completes the invoice step from the download marker", async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: "onboarding.checklistDismissed", value: "false" },
      { key: "onboarding.invoiceIssued", value: "true" },
    ] as never);
    vi.mocked(db.customer.count).mockResolvedValue(1 as never);
    vi.mocked(db.vehicle.count).mockResolvedValue(1 as never);
    vi.mocked(db.serviceRecord.count)
      .mockResolvedValueOnce(1 as never)
      .mockResolvedValueOnce(0 as never);

    const result = await getOnboardingChecklist();
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      steps: { customer: true, vehicle: true, workOrder: true, invoice: true },
      allDone: true,
      hasSampleData: false,
    });
  });
});
