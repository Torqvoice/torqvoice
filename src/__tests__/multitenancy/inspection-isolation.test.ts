/**
 * Multi-tenancy isolation tests: Inspections
 *
 * Verifies that a user from Org A cannot read, update, or delete inspections
 * belonging to Org B.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cached-session", () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/notification-bus", () => ({
  notificationBus: { emit: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    inspection: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    inspectionItem: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";
import {
  getInspection,
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

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getInspection — cross-org isolation", () => {
  it("returns error when requesting another org's inspection", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue(null);

    const result = await getInspection(`${ORG_B}-inspection-id`);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Inspection not found");
  });

  it("read query is scoped to organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue({
      id: "insp-a",
      organizationId: ORG_A,
    } as any);

    await getInspection("insp-a");

    expect(vi.mocked(db.inspection.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });
});

describe("updateInspectionItem — cross-org isolation", () => {
  it("returns error when targeting another org's inspection item", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspectionItem.findFirst).mockResolvedValue(null);

    const result = await updateInspectionItem(`${ORG_B}-item-id`, {
      condition: "fail",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Inspection item not found");
  });

  it("update query includes organizationId via inspection relation", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspectionItem.findFirst).mockResolvedValue({ id: "item-a" } as any);
    vi.mocked(db.inspectionItem.update).mockResolvedValue({ id: "item-a" } as any);

    await updateInspectionItem("item-a", { condition: "pass" });

    expect(vi.mocked(db.inspectionItem.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          inspection: expect.objectContaining({ organizationId: ORG_A }),
        }),
      })
    );
  });

  it("successfully updates the caller's own inspection item", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspectionItem.findFirst).mockResolvedValue({ id: "item-a" } as any);
    vi.mocked(db.inspectionItem.update).mockResolvedValue({ id: "item-a", condition: "pass" } as any);

    const result = await updateInspectionItem("item-a", { condition: "pass" });

    expect(result.success).toBe(true);
  });
});

describe("completeInspection — cross-org isolation", () => {
  it("returns error when targeting another org's inspection", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue(null);

    const result = await completeInspection(`${ORG_B}-inspection-id`);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Inspection not found");
  });

  it("update query includes organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue({
      id: "insp-a",
      vehicleId: "veh-a",
      organizationId: ORG_A,
    } as any);
    vi.mocked(db.inspection.updateMany).mockResolvedValue({ count: 1 } as any);

    await completeInspection("insp-a");

    expect(vi.mocked(db.inspection.updateMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });
});

describe("deleteInspection — cross-org isolation", () => {
  it("returns error when deleting another org's inspection", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue(null);

    const result = await deleteInspection(`${ORG_B}-inspection-id`);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Inspection not found");
  });

  it("delete query includes organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.inspection.findFirst).mockResolvedValue({
      id: "insp-a",
      vehicleId: "veh-a",
      organizationId: ORG_A,
    } as any);
    vi.mocked(db.inspection.deleteMany).mockResolvedValue({ count: 1 } as any);

    await deleteInspection("insp-a");

    expect(vi.mocked(db.inspection.deleteMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });
});
