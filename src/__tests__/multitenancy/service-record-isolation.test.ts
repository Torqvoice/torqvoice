/**
 * Multi-tenancy isolation tests: Service Record CRUD
 *
 * Verifies that getServiceRecord, updateServiceRecord, and deleteServiceRecord
 * are properly scoped to the caller's organization and reject cross-org access.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cached-session", () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/resolve-upload-path", () => ({
  resolveUploadPath: vi.fn((url: string) => `/uploads/${url}`),
}));
vi.mock("@/lib/notification-bus", () => ({
  notificationBus: { emit: vi.fn() },
}));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    vehicle: { findFirst: vi.fn(), update: vi.fn() },
    serviceRecord: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";
import {
  getServiceRecord,
  updateServiceRecord,
  deleteServiceRecord,
} from "@/features/vehicles/Actions/serviceActions";

const mockSession = vi.mocked(getCachedSession);
const mockMembership = vi.mocked(getCachedMembership);
const mockUserFindUnique = vi.mocked(db.user.findUnique);
const ORG_A = "org-a";
const ORG_B = "org-b";

function setupOrgAOwner() {
  mockSession.mockResolvedValue({ user: { id: "user-a", email: "a@example.com" } } as any);
  mockMembership.mockResolvedValue({
    organizationId: ORG_A, role: "owner", roleId: null, customRole: null,
  } as any);
  mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
}

function setupOrgAMember() {
  mockSession.mockResolvedValue({ user: { id: "user-m", email: "m@example.com" } } as any);
  mockMembership.mockResolvedValue({
    organizationId: ORG_A, role: "member", roleId: null, customRole: null,
  } as any);
  mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
}

const ORG_A_RECORD = {
  id: "sr-a", vehicleId: "veh-a", title: "Oil Change", status: "pending", attachments: [],
  vehicle: { id: "veh-a", mileage: 50000, make: "Toyota", model: "Camry", year: 2020, licensePlate: "ABC123" },
};

const orgWhereClause = expect.objectContaining({
  where: expect.objectContaining({
    vehicle: expect.objectContaining({ organizationId: ORG_A }),
  }),
});

beforeEach(() => { vi.resetAllMocks(); });

describe("getServiceRecord — cross-org isolation", () => {
  it("returns null data when querying another org's service record", async () => {
    setupOrgAOwner();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null);
    const result = await getServiceRecord(`${ORG_B}-record-id`);
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  it("scopes the query to the caller's organizationId via vehicle relation", async () => {
    setupOrgAOwner();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null);
    await getServiceRecord("sr-a");
    expect(vi.mocked(db.serviceRecord.findFirst)).toHaveBeenCalledWith(orgWhereClause);
  });

  it("returns the service record when it belongs to the caller's org", async () => {
    setupOrgAMember();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(ORG_A_RECORD as any);
    const result = await getServiceRecord("sr-a");
    expect(result.success).toBe(true);
    expect((result.data as any)?.id).toBe("sr-a");
  });
});

describe("updateServiceRecord — cross-org isolation", () => {
  it("returns error when targeting another org's service record", async () => {
    setupOrgAOwner();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null);
    const result = await updateServiceRecord({ id: `${ORG_B}-record-id` });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Service record not found");
  });

  it("ownership check always includes organizationId via vehicle relation", async () => {
    setupOrgAOwner();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null);
    await updateServiceRecord({ id: "sr-x" });
    expect(vi.mocked(db.serviceRecord.findFirst)).toHaveBeenCalledWith(orgWhereClause);
  });

  it("successfully updates a service record belonging to the caller's org", async () => {
    setupOrgAOwner();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(ORG_A_RECORD as any);
    const updatedRecord = { ...ORG_A_RECORD, title: "Brake Pads" };
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({ serviceRecord: { update: vi.fn().mockResolvedValue(updatedRecord) } })
    );
    const result = await updateServiceRecord({ id: "sr-a", title: "Brake Pads" });
    expect(result.success).toBe(true);
    expect((result.data as any)?.title).toBe("Brake Pads");
  });
});

describe("deleteServiceRecord — cross-org isolation", () => {
  it("returns error when deleting another org's service record", async () => {
    setupOrgAOwner();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null);
    const result = await deleteServiceRecord(`${ORG_B}-record-id`);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Record not found");
  });

  it("ownership check always includes organizationId via vehicle relation", async () => {
    setupOrgAOwner();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null);
    await deleteServiceRecord("sr-x");
    expect(vi.mocked(db.serviceRecord.findFirst)).toHaveBeenCalledWith(orgWhereClause);
  });

  it("successfully deletes a service record belonging to the caller's org", async () => {
    setupOrgAOwner();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      id: "sr-a", vehicleId: "veh-a", attachments: [],
    } as any);
    vi.mocked(db.serviceRecord.delete).mockResolvedValue({} as any);
    const result = await deleteServiceRecord("sr-a");
    expect(result.success).toBe(true);
    expect((result.data as any)?.recordId).toBe("sr-a");
  });
});
