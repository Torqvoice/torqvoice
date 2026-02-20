/**
 * Multi-tenancy isolation tests: Vehicles & Service Records
 *
 * Verifies that a user from Org A cannot read, modify, or delete data
 * belonging to Org B.  The DB mocks simulate what Prisma returns when a
 * where-clause contains a mismatched organizationId: findFirst → null,
 * updateMany/deleteMany → { count: 0 }.
 *
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

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    vehicle: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    serviceRecord: {
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    serviceAttachment: {
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";
import {
  getVehicle,
  getVehicles,
  updateVehicle,
  deleteVehicle,
} from "@/features/vehicles/Actions/vehicleActions";
import {
  getServiceRecord,
  deleteServiceRecord,
  deleteServiceAttachment,
} from "@/features/vehicles/Actions/serviceActions";

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

const ORG_A_VEHICLE = {
  id: "veh-a",
  organizationId: ORG_A,
  make: "Toyota",
  model: "Camry",
  year: 2020,
  mileage: 50000,
  imageUrl: null,
  isArchived: false,
  serviceRecords: [],
  notes: [],
  reminders: [],
  customer: null,
  _count: { serviceRecords: 0, notes: 0, reminders: 0 },
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Vehicle read isolation
// ---------------------------------------------------------------------------

describe("getVehicle — cross-org isolation", () => {
  it("returns 'Vehicle not found' error when requesting another org's vehicle ID", async () => {
    setupOrgAOwner();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(null);

    const result = await getVehicle(`${ORG_B}-vehicle-id`);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Vehicle not found");
  });

  it("returns vehicle data for a vehicle that belongs to the caller's org", async () => {
    setupOrgAOwner();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(ORG_A_VEHICLE as any);

    const result = await getVehicle("veh-a");

    expect(result.success).toBe(true);
    expect((result.data as any).id).toBe("veh-a");
  });

  it("db query always scopes vehicles to the caller's organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(ORG_A_VEHICLE as any);

    await getVehicle("veh-a");

    expect(vi.mocked(db.vehicle.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Vehicle list isolation
// ---------------------------------------------------------------------------

describe("getVehicles — org scoping", () => {
  it("list query always includes the caller's organizationId in the where clause", async () => {
    setupOrgAOwner();
    vi.mocked(db.vehicle.findMany).mockResolvedValue([ORG_A_VEHICLE] as any);

    await getVehicles();

    expect(vi.mocked(db.vehicle.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Vehicle update isolation
// ---------------------------------------------------------------------------

describe("updateVehicle — cross-org isolation", () => {
  it("🐛 BUG-1: silently returns success when targeting another org's vehicle — nothing is actually changed", async () => {
    setupOrgAOwner();
    // updateMany with org filter matches 0 rows for a cross-org id
    vi.mocked(db.vehicle.updateMany).mockResolvedValue({ count: 0 } as any);

    const result = await updateVehicle({ id: `${ORG_B}-vehicle-id`, make: "Hacked" });

    // BUG: should be { success: false, error: "Vehicle not found" }
    // Fix: check `result.count === 0` in updateVehicle and throw.
    expect(result.success).toBe(false); // FAILS until bug is fixed
  });

  it("update query always includes organizationId to prevent cross-org writes", async () => {
    setupOrgAOwner();
    vi.mocked(db.vehicle.updateMany).mockResolvedValue({ count: 1 } as any);

    await updateVehicle({ id: "veh-a", make: "Toyota" });

    expect(vi.mocked(db.vehicle.updateMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("successfully updates a vehicle belonging to the caller's org", async () => {
    setupOrgAOwner();
    vi.mocked(db.vehicle.updateMany).mockResolvedValue({ count: 1 } as any);

    const result = await updateVehicle({ id: "veh-a", make: "Toyota", model: "Updated" });

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Vehicle delete isolation
// ---------------------------------------------------------------------------

describe("deleteVehicle — cross-org isolation", () => {
  it("🐛 BUG-2: silently returns success when targeting another org's vehicle — nothing is actually deleted", async () => {
    setupOrgAOwner();
    // findFirst returns null (cross-org vehicle invisible to caller)
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(null);
    // deleteMany with org filter matches 0 rows
    vi.mocked(db.vehicle.deleteMany).mockResolvedValue({ count: 0 } as any);

    const result = await deleteVehicle(`${ORG_B}-vehicle-id`);

    // BUG: should be { success: false, error: "Vehicle not found" }
    // Fix: throw when findFirst returns null (before deleteMany).
    expect(result.success).toBe(false); // FAILS until bug is fixed
  });

  it("delete query always includes organizationId to prevent cross-org deletes", async () => {
    setupOrgAOwner();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ imageUrl: null, serviceRecords: [] } as any);
    vi.mocked(db.vehicle.deleteMany).mockResolvedValue({ count: 1 } as any);

    await deleteVehicle("veh-a");

    expect(vi.mocked(db.vehicle.deleteMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("successfully deletes a vehicle belonging to the caller's org", async () => {
    setupOrgAOwner();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ imageUrl: null, serviceRecords: [] } as any);
    vi.mocked(db.vehicle.deleteMany).mockResolvedValue({ count: 1 } as any);

    const result = await deleteVehicle("veh-a");

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Service record isolation
// ---------------------------------------------------------------------------

describe("getServiceRecord — cross-org isolation", () => {
  it("returns null data (not an error) when querying another org's service record", async () => {
    setupOrgAOwner();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null);

    const result = await getServiceRecord(`${ORG_B}-record-id`);

    // Returns success:true with null data — caller must check for null.
    // Note: inconsistent with getVehicle / getQuote which throw. Not a
    // security issue (no cross-org data is returned) but worth noting.
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  it("db query scopes service records to the caller's org via vehicle relation", async () => {
    setupOrgAOwner();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null);

    await getServiceRecord("sr-a");

    expect(vi.mocked(db.serviceRecord.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          vehicle: expect.objectContaining({ organizationId: ORG_A }),
        }),
      })
    );
  });

  it("returns service record data when querying the caller's own record", async () => {
    setupOrgAOwner();
    const record = { id: "sr-a", vehicleId: "veh-a", title: "Oil Change" };
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(record as any);

    const result = await getServiceRecord("sr-a");

    expect(result.success).toBe(true);
    expect((result.data as any)?.id).toBe("sr-a");
  });
});

describe("deleteServiceRecord — cross-org isolation", () => {
  it("returns 'Record not found' error when targeting another org's service record", async () => {
    setupOrgAOwner();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null);

    const result = await deleteServiceRecord(`${ORG_B}-record-id`);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Record not found");
  });

  it("successfully deletes a service record belonging to the caller's org", async () => {
    setupOrgAOwner();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      id: "sr-a",
      vehicleId: "veh-a",
      attachments: [],
    } as any);
    vi.mocked(db.serviceRecord.delete).mockResolvedValue({} as any);

    const result = await deleteServiceRecord("sr-a");

    expect(result.success).toBe(true);
  });
});

describe("deleteServiceAttachment — cross-org isolation", () => {
  it("returns 'Attachment not found' error when targeting another org's attachment", async () => {
    setupOrgAOwner();
    vi.mocked(db.serviceAttachment.findFirst).mockResolvedValue(null);

    const result = await deleteServiceAttachment(`${ORG_B}-attachment-id`);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Attachment not found");
  });

  it("attachment lookup always scopes through vehicle's organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.serviceAttachment.findFirst).mockResolvedValue(null);

    await deleteServiceAttachment("att-x");

    expect(vi.mocked(db.serviceAttachment.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          serviceRecord: expect.objectContaining({
            vehicle: expect.objectContaining({ organizationId: ORG_A }),
          }),
        }),
      })
    );
  });

  it("successfully deletes an attachment belonging to the caller's org", async () => {
    setupOrgAOwner();
    vi.mocked(db.serviceAttachment.findFirst).mockResolvedValue({
      id: "att-a",
      fileUrl: "uploads/photo.jpg",
      serviceRecord: { vehicleId: "veh-a", id: "sr-a" },
    } as any);
    vi.mocked(db.serviceAttachment.delete).mockResolvedValue({} as any);

    const result = await deleteServiceAttachment("att-a");

    expect(result.success).toBe(true);
    expect((result.data as any)?.deleted).toBe(true);
  });
});
