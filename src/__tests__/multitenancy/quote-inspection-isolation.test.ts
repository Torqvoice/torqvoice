/**
 * Multi-tenancy isolation tests: Quotes & Inspections
 *
 * Verifies that a user from Org A cannot read, modify, or delete quotes or
 * inspections belonging to Org B.
 *
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cached-session", () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/lib/invoice-utils", () => ({
  resolveInvoicePrefix: vi.fn((p: string) => p),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
    quote: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    inspection: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    inspectionItem: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";
import {
  getQuote,
  getQuotesPaginated,
  updateQuote,
  updateQuoteStatus,
  deleteQuote,
} from "@/features/quotes/Actions/quoteActions";
import {
  getInspection,
  getInspectionsPaginated,
  updateInspectionItem,
  completeInspection,
  deleteInspection,
} from "@/features/inspections/Actions/inspectionActions";

const mockSession = vi.mocked(getCachedSession);
const mockMembership = vi.mocked(getCachedMembership);
const mockUserFindUnique = vi.mocked(db.user.findUnique);

const ORG_A = "org-a";
const ORG_B = "org-b";

function setupOrgAOwner() {
  mockSession.mockResolvedValue({ user: { id: "user-a", email: "a@example.com" } } as any);
  mockMembership.mockResolvedValue({
    organizationId: ORG_A,
    role: "owner",
    roleId: null,
    customRole: null,
  } as any);
  mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
}

const ORG_A_QUOTE = {
  id: "quote-a",
  organizationId: ORG_A,
  title: "Brake Service",
  quoteNumber: "QT-1001",
  status: "sent",
  partItems: [],
  laborItems: [],
  customer: null,
  vehicle: null,
  inspection: null,
};

const ORG_A_INSPECTION = {
  id: "insp-a",
  organizationId: ORG_A,
  status: "in_progress",
  vehicleId: "veh-a",
  vehicle: null,
  template: null,
  items: [],
  quotes: [],
  quoteRequests: [],
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Quote read isolation
// ---------------------------------------------------------------------------

describe("getQuote — cross-org isolation", () => {
  it("returns 'Quote not found' error when requesting another org's quote ID", async () => {
    setupOrgAOwner();
    vi.mocked(db.quote.findFirst).mockResolvedValue(null);

    const result = await getQuote(`${ORG_B}-quote-id`);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Quote not found");
  });

  it("returns quote data when requesting the caller's own quote", async () => {
    setupOrgAOwner();
    vi.mocked(db.quote.findFirst).mockResolvedValue(ORG_A_QUOTE as any);

    const result = await getQuote("quote-a");

    expect(result.success).toBe(true);
    expect((result.data as any).id).toBe("quote-a");
  });

  it("read query always scopes to the caller's organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.quote.findFirst).mockResolvedValue(ORG_A_QUOTE as any);

    await getQuote("quote-a");

    expect(vi.mocked(db.quote.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Quote list isolation
// ---------------------------------------------------------------------------

describe("getQuotesPaginated — org scoping", () => {
  it("list query always scopes to the caller's organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.quote.findMany).mockResolvedValue([]);
    vi.mocked(db.quote.count).mockResolvedValue(0);
    vi.mocked(db.quote.groupBy).mockResolvedValue([]);

    await getQuotesPaginated({});

    expect(vi.mocked(db.quote.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Quote update isolation
// ---------------------------------------------------------------------------

describe("updateQuote — cross-org isolation", () => {
  it("returns 'Quote not found' error when targeting another org's quote", async () => {
    setupOrgAOwner();
    vi.mocked(db.quote.findFirst).mockResolvedValue(null);

    const result = await updateQuote({ id: `${ORG_B}-quote-id`, title: "Injected" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Quote not found");
  });

  it("ownership is verified before the update transaction runs", async () => {
    setupOrgAOwner();
    vi.mocked(db.quote.findFirst).mockResolvedValue(null);

    await updateQuote({ id: `${ORG_B}-quote-id`, title: "Injected" });

    // $transaction must never be called if ownership check fails
    expect(vi.mocked(db.$transaction)).not.toHaveBeenCalled();
  });

  it("successfully updates the caller's own quote", async () => {
    setupOrgAOwner();
    vi.mocked(db.quote.findFirst).mockResolvedValue(ORG_A_QUOTE as any);
    const updatedQuote = { ...ORG_A_QUOTE, title: "Updated Title" };
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        quote: { update: vi.fn().mockResolvedValue(updatedQuote) },
        quotePart: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), createMany: vi.fn() },
        quoteLabor: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), createMany: vi.fn() },
      })
    );

    const result = await updateQuote({ id: "quote-a", title: "Updated Title" });

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Quote status update isolation
// ---------------------------------------------------------------------------

describe("updateQuoteStatus — cross-org isolation", () => {
  it("returns 'Quote not found' error when targeting another org's quote status", async () => {
    setupOrgAOwner();
    vi.mocked(db.quote.findFirst).mockResolvedValue(null);

    const result = await updateQuoteStatus(`${ORG_B}-quote-id`, "accepted");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Quote not found");
  });

  it("successfully updates status of the caller's own quote", async () => {
    setupOrgAOwner();
    vi.mocked(db.quote.findFirst).mockResolvedValue(ORG_A_QUOTE as any);
    vi.mocked(db.quote.updateMany).mockResolvedValue({ count: 1 } as any);

    const result = await updateQuoteStatus("quote-a", "accepted");

    expect(result.success).toBe(true);
  });

  it("status update query includes organizationId for defense-in-depth", async () => {
    setupOrgAOwner();
    vi.mocked(db.quote.findFirst).mockResolvedValue(ORG_A_QUOTE as any);
    vi.mocked(db.quote.updateMany).mockResolvedValue({ count: 1 } as any);

    await updateQuoteStatus("quote-a", "accepted");

    expect(vi.mocked(db.quote.updateMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Quote delete isolation
// ---------------------------------------------------------------------------

describe("deleteQuote — cross-org isolation", () => {
  it("returns 'Quote not found' error when targeting another org's quote", async () => {
    setupOrgAOwner();
    vi.mocked(db.quote.findFirst).mockResolvedValue(null);

    const result = await deleteQuote(`${ORG_B}-quote-id`);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Quote not found");
  });

  it("delete is never called when ownership check fails", async () => {
    setupOrgAOwner();
    vi.mocked(db.quote.findFirst).mockResolvedValue(null);

    await deleteQuote(`${ORG_B}-quote-id`);

    expect(vi.mocked(db.quote.deleteMany)).not.toHaveBeenCalled();
  });

  it("successfully deletes the caller's own quote", async () => {
    setupOrgAOwner();
    vi.mocked(db.quote.findFirst).mockResolvedValue(ORG_A_QUOTE as any);
    vi.mocked(db.quote.deleteMany).mockResolvedValue({ count: 1 } as any);

    const result = await deleteQuote("quote-a");

    expect(result.success).toBe(true);
  });

  it("delete query includes organizationId for defense-in-depth", async () => {
    setupOrgAOwner();
    vi.mocked(db.quote.findFirst).mockResolvedValue(ORG_A_QUOTE as any);
    vi.mocked(db.quote.deleteMany).mockResolvedValue({ count: 1 } as any);

    await deleteQuote("quote-a");

    expect(vi.mocked(db.quote.deleteMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Inspection read isolation
// ---------------------------------------------------------------------------

describe("getInspection — cross-org isolation", () => {
  it("returns 'Inspection not found' error when requesting another org's inspection", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue(null);

    const result = await getInspection(`${ORG_B}-insp-id`);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Inspection not found");
  });

  it("returns inspection data when requesting the caller's own inspection", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue(ORG_A_INSPECTION as any);

    const result = await getInspection("insp-a");

    expect(result.success).toBe(true);
    expect((result.data as any).id).toBe("insp-a");
  });

  it("read query always scopes to the caller's organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue(ORG_A_INSPECTION as any);

    await getInspection("insp-a");

    expect(vi.mocked(db.inspection.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Inspection list isolation
// ---------------------------------------------------------------------------

describe("getInspectionsPaginated — org scoping", () => {
  it("list query always scopes to the caller's organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue(null);

    // Mock the underlying db calls getInspectionsPaginated uses
    const mockDb = vi.mocked(db) as any;
    if (!mockDb.inspection.findMany) {
      mockDb.inspection.findMany = vi.fn().mockResolvedValue([]);
    } else {
      vi.mocked(mockDb.inspection.findMany).mockResolvedValue([]);
    }
    if (!mockDb.inspection.count) {
      mockDb.inspection.count = vi.fn().mockResolvedValue(0);
    } else {
      vi.mocked(mockDb.inspection.count).mockResolvedValue(0);
    }
    if (!mockDb.inspection.groupBy) {
      mockDb.inspection.groupBy = vi.fn().mockResolvedValue([]);
    } else {
      vi.mocked(mockDb.inspection.groupBy).mockResolvedValue([]);
    }

    await getInspectionsPaginated({});

    // The findMany inside getInspectionsPaginated should use organizationId
    expect(mockDb.inspection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Inspection item update isolation
// ---------------------------------------------------------------------------

describe("updateInspectionItem — cross-org isolation", () => {
  it("returns 'Inspection item not found' when updating an item from another org", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspectionItem.findFirst).mockResolvedValue(null);

    const result = await updateInspectionItem(`${ORG_B}-item-id`, { condition: "pass" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Inspection item not found");
  });

  it("item lookup always scopes through the inspection's organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspectionItem.findFirst).mockResolvedValue(null);

    await updateInspectionItem("item-x", { condition: "pass" });

    expect(vi.mocked(db.inspectionItem.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          inspection: expect.objectContaining({ organizationId: ORG_A }),
        }),
      })
    );
  });

  it("update is never called when ownership check fails", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspectionItem.findFirst).mockResolvedValue(null);

    await updateInspectionItem(`${ORG_B}-item-id`, { condition: "fail" });

    expect(vi.mocked(db.inspectionItem.update)).not.toHaveBeenCalled();
  });

  it("successfully updates an inspection item belonging to the caller's org", async () => {
    setupOrgAOwner();
    const item = { id: "item-a", inspectionId: "insp-a", condition: "not_inspected" };
    vi.mocked(db.inspectionItem.findFirst).mockResolvedValue(item as any);
    vi.mocked(db.inspectionItem.update).mockResolvedValue({ ...item, condition: "pass" } as any);

    const result = await updateInspectionItem("item-a", { condition: "pass" });

    expect(result.success).toBe(true);
    expect((result.data as any).condition).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// Complete inspection isolation
// ---------------------------------------------------------------------------

describe("completeInspection — cross-org isolation", () => {
  it("returns 'Inspection not found' when completing another org's inspection", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue(null);

    const result = await completeInspection(`${ORG_B}-insp-id`);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Inspection not found");
  });

  it("inspection update is never called when ownership check fails", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue(null);

    await completeInspection(`${ORG_B}-insp-id`);

    expect(vi.mocked(db.inspection.updateMany)).not.toHaveBeenCalled();
  });

  it("successfully completes the caller's own inspection", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue(ORG_A_INSPECTION as any);
    vi.mocked(db.inspection.updateMany).mockResolvedValue({ count: 1 } as any);

    const result = await completeInspection("insp-a");

    expect(result.success).toBe(true);
  });

  it("complete query includes organizationId for defense-in-depth", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue(ORG_A_INSPECTION as any);
    vi.mocked(db.inspection.updateMany).mockResolvedValue({ count: 1 } as any);

    await completeInspection("insp-a");

    expect(vi.mocked(db.inspection.updateMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Delete inspection isolation
// ---------------------------------------------------------------------------

describe("deleteInspection — cross-org isolation", () => {
  it("returns 'Inspection not found' when deleting another org's inspection", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue(null);

    const result = await deleteInspection(`${ORG_B}-insp-id`);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Inspection not found");
  });

  it("inspection delete is never called when ownership check fails", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue(null);

    await deleteInspection(`${ORG_B}-insp-id`);

    expect(vi.mocked(db.inspection.deleteMany)).not.toHaveBeenCalled();
  });

  it("successfully deletes the caller's own inspection", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue(ORG_A_INSPECTION as any);
    vi.mocked(db.inspection.deleteMany).mockResolvedValue({ count: 1 } as any);

    const result = await deleteInspection("insp-a");

    expect(result.success).toBe(true);
  });

  it("delete query includes organizationId for defense-in-depth", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue(ORG_A_INSPECTION as any);
    vi.mocked(db.inspection.deleteMany).mockResolvedValue({ count: 1 } as any);

    await deleteInspection("insp-a");

    expect(vi.mocked(db.inspection.deleteMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });
});
