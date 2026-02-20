/**
 * Multi-tenancy isolation tests: Customers & Inventory Parts
 *
 * Verifies that a user from Org A cannot read, modify, or delete customers or
 * inventory parts belonging to Org B.
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

vi.mock("@/lib/features", () => ({
  getFeatures: vi.fn().mockResolvedValue({ maxCustomers: 1000 }),
  FeatureGatedError: class FeatureGatedError extends Error {
    constructor(feature: string, msg: string) { super(msg); }
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    customer: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    inventoryPart: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";
import {
  getCustomer,
  getCustomers,
  updateCustomer,
  deleteCustomer,
} from "@/features/customers/Actions/customerActions";
import {
  getInventoryPart,
  updateInventoryPart,
  deleteInventoryPart,
  adjustInventoryStock,
} from "@/features/inventory/Actions/inventoryActions";

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

const ORG_A_CUSTOMER = {
  id: "cust-a",
  organizationId: ORG_A,
  name: "Alice Smith",
  email: "alice@example.com",
  phone: null,
  address: null,
  company: null,
  notes: null,
  vehicles: [],
};

const ORG_A_PART = {
  id: "part-a",
  organizationId: ORG_A,
  name: "Oil Filter",
  quantity: 10,
  unitCost: 5,
  sellPrice: 10,
  isArchived: false,
  imageUrl: null,
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Customer read isolation
// ---------------------------------------------------------------------------

describe("getCustomer — cross-org isolation", () => {
  it("returns 'Customer not found' error when requesting another org's customer", async () => {
    setupOrgAOwner();
    vi.mocked(db.customer.findFirst).mockResolvedValue(null);

    const result = await getCustomer(`${ORG_B}-customer-id`);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Customer not found");
  });

  it("returns customer data when requesting the caller's own customer", async () => {
    setupOrgAOwner();
    vi.mocked(db.customer.findFirst).mockResolvedValue(ORG_A_CUSTOMER as any);

    const result = await getCustomer("cust-a");

    expect(result.success).toBe(true);
    expect((result.data as any).id).toBe("cust-a");
  });

  it("read query always scopes to the caller's organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.customer.findFirst).mockResolvedValue(ORG_A_CUSTOMER as any);

    await getCustomer("cust-a");

    expect(vi.mocked(db.customer.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Customer list isolation
// ---------------------------------------------------------------------------

describe("getCustomers — org scoping", () => {
  it("list query always scopes to the caller's organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.customer.findMany).mockResolvedValue([ORG_A_CUSTOMER] as any);

    await getCustomers();

    expect(vi.mocked(db.customer.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("returns only the caller's own customers", async () => {
    setupOrgAOwner();
    vi.mocked(db.customer.findMany).mockResolvedValue([ORG_A_CUSTOMER] as any);

    const result = await getCustomers();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect((result.data as any)[0].organizationId).toBe(ORG_A);
  });
});

// ---------------------------------------------------------------------------
// Customer update isolation
// ---------------------------------------------------------------------------

describe("updateCustomer — cross-org isolation", () => {
  it("🐛 BUG-3: silently returns success when targeting another org's customer — nothing is actually changed", async () => {
    setupOrgAOwner();
    // updateMany with org filter matches 0 rows for a cross-org customer id
    vi.mocked(db.customer.updateMany).mockResolvedValue({ count: 0 } as any);

    const result = await updateCustomer({ id: `${ORG_B}-customer-id`, name: "Hacked" });

    // BUG: should be { success: false, error: "Customer not found" }
    // Fix: check `result.count === 0` and throw (same pattern as inventoryActions).
    expect(result.success).toBe(false); // FAILS until bug is fixed
  });

  it("update query always includes organizationId to prevent cross-org writes", async () => {
    setupOrgAOwner();
    vi.mocked(db.customer.updateMany).mockResolvedValue({ count: 1 } as any);

    await updateCustomer({ id: "cust-a", name: "Alice Updated" });

    expect(vi.mocked(db.customer.updateMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("successfully updates the caller's own customer", async () => {
    setupOrgAOwner();
    vi.mocked(db.customer.updateMany).mockResolvedValue({ count: 1 } as any);

    const result = await updateCustomer({ id: "cust-a", name: "Alice Updated" });

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Customer delete isolation
// ---------------------------------------------------------------------------

describe("deleteCustomer — cross-org isolation", () => {
  it("🐛 BUG-4: silently returns success when deleting another org's customer — nothing is actually deleted", async () => {
    setupOrgAOwner();
    // deleteMany with org filter matches 0 rows for a cross-org customer id
    vi.mocked(db.customer.deleteMany).mockResolvedValue({ count: 0 } as any);

    const result = await deleteCustomer(`${ORG_B}-customer-id`);

    // BUG: should be { success: false, error: "Customer not found" }
    // Fix: check `result.count === 0` and throw (same pattern as inventoryActions).
    expect(result.success).toBe(false); // FAILS until bug is fixed
  });

  it("delete query always includes organizationId to prevent cross-org deletes", async () => {
    setupOrgAOwner();
    vi.mocked(db.customer.deleteMany).mockResolvedValue({ count: 1 } as any);

    await deleteCustomer("cust-a");

    expect(vi.mocked(db.customer.deleteMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("successfully deletes the caller's own customer", async () => {
    setupOrgAOwner();
    vi.mocked(db.customer.deleteMany).mockResolvedValue({ count: 1 } as any);

    const result = await deleteCustomer("cust-a");

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Inventory read isolation
// ---------------------------------------------------------------------------

describe("getInventoryPart — cross-org isolation", () => {
  it("returns 'Part not found' error when requesting another org's inventory part", async () => {
    setupOrgAOwner();
    vi.mocked(db.inventoryPart.findFirst).mockResolvedValue(null);

    const result = await getInventoryPart(`${ORG_B}-part-id`);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Part not found");
  });

  it("returns part data when requesting the caller's own part", async () => {
    setupOrgAOwner();
    vi.mocked(db.inventoryPart.findFirst).mockResolvedValue(ORG_A_PART as any);

    const result = await getInventoryPart("part-a");

    expect(result.success).toBe(true);
    expect((result.data as any).id).toBe("part-a");
  });

  it("read query always scopes to the caller's organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.inventoryPart.findFirst).mockResolvedValue(ORG_A_PART as any);

    await getInventoryPart("part-a");

    expect(vi.mocked(db.inventoryPart.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Inventory update isolation
// ---------------------------------------------------------------------------

describe("updateInventoryPart — cross-org isolation", () => {
  it("returns 'Part not found' error when targeting another org's part (count check enforced)", async () => {
    setupOrgAOwner();
    // updateMany with org filter matches 0 rows — action checks count and throws
    vi.mocked(db.inventoryPart.updateMany).mockResolvedValue({ count: 0 } as any);

    const result = await updateInventoryPart({ id: `${ORG_B}-part-id`, name: "Hacked" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Part not found");
  });

  it("update query always includes organizationId to prevent cross-org writes", async () => {
    setupOrgAOwner();
    vi.mocked(db.inventoryPart.updateMany).mockResolvedValue({ count: 1 } as any);

    await updateInventoryPart({ id: "part-a", name: "Updated Filter" });

    expect(vi.mocked(db.inventoryPart.updateMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("successfully updates the caller's own inventory part", async () => {
    setupOrgAOwner();
    vi.mocked(db.inventoryPart.updateMany).mockResolvedValue({ count: 1 } as any);

    const result = await updateInventoryPart({ id: "part-a", name: "Updated Filter" });

    expect(result.success).toBe(true);
    expect((result.data as any).updated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Inventory delete isolation
// ---------------------------------------------------------------------------

describe("deleteInventoryPart — cross-org isolation", () => {
  it("returns 'Part not found' error when targeting another org's part (count check enforced)", async () => {
    setupOrgAOwner();
    vi.mocked(db.inventoryPart.findFirst).mockResolvedValue(null); // no imageUrl to clean
    vi.mocked(db.inventoryPart.deleteMany).mockResolvedValue({ count: 0 } as any);

    const result = await deleteInventoryPart(`${ORG_B}-part-id`);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Part not found");
  });

  it("delete query always includes organizationId to prevent cross-org deletes", async () => {
    setupOrgAOwner();
    vi.mocked(db.inventoryPart.findFirst).mockResolvedValue({ imageUrl: null } as any);
    vi.mocked(db.inventoryPart.deleteMany).mockResolvedValue({ count: 1 } as any);

    await deleteInventoryPart("part-a");

    expect(vi.mocked(db.inventoryPart.deleteMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("successfully deletes the caller's own inventory part", async () => {
    setupOrgAOwner();
    vi.mocked(db.inventoryPart.findFirst).mockResolvedValue({ imageUrl: null } as any);
    vi.mocked(db.inventoryPart.deleteMany).mockResolvedValue({ count: 1 } as any);

    const result = await deleteInventoryPart("part-a");

    expect(result.success).toBe(true);
    expect((result.data as any).deleted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Inventory stock adjustment isolation
// ---------------------------------------------------------------------------

describe("adjustInventoryStock — cross-org isolation", () => {
  it("returns 'Part not found' error when targeting another org's part", async () => {
    setupOrgAOwner();
    // findFirst with organizationId filter returns null for cross-org part
    vi.mocked(db.inventoryPart.findFirst).mockResolvedValue(null);

    const result = await adjustInventoryStock({ id: `${ORG_B}-part-id`, adjustment: 10 });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Part not found");
  });

  it("ownership findFirst always includes organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.inventoryPart.findFirst).mockResolvedValue(null);

    await adjustInventoryStock({ id: "part-x", adjustment: 5 });

    expect(vi.mocked(db.inventoryPart.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("inventory update is never called when ownership check fails", async () => {
    setupOrgAOwner();
    vi.mocked(db.inventoryPart.findFirst).mockResolvedValue(null);

    await adjustInventoryStock({ id: `${ORG_B}-part-id`, adjustment: 99 });

    expect(vi.mocked(db.inventoryPart.updateMany)).not.toHaveBeenCalled();
  });

  it("successfully adjusts stock for the caller's own part", async () => {
    setupOrgAOwner();
    vi.mocked(db.inventoryPart.findFirst).mockResolvedValue(ORG_A_PART as any);
    vi.mocked(db.inventoryPart.updateMany).mockResolvedValue({ count: 1 } as any);

    const result = await adjustInventoryStock({ id: "part-a", adjustment: 5 });

    expect(result.success).toBe(true);
    expect((result.data as any).quantity).toBe(15);
  });

  it("stock adjustment query includes organizationId for defense-in-depth", async () => {
    setupOrgAOwner();
    vi.mocked(db.inventoryPart.findFirst).mockResolvedValue(ORG_A_PART as any);
    vi.mocked(db.inventoryPart.updateMany).mockResolvedValue({ count: 1 } as any);

    await adjustInventoryStock({ id: "part-a", adjustment: 5 });

    expect(vi.mocked(db.inventoryPart.updateMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("returns 'Insufficient stock' error when adjustment would make quantity negative", async () => {
    setupOrgAOwner();
    // quantity is 10, adjustment is -15 → would go to -5
    vi.mocked(db.inventoryPart.findFirst).mockResolvedValue({ ...ORG_A_PART, quantity: 10 } as any);

    const result = await adjustInventoryStock({ id: "part-a", adjustment: -15 });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Insufficient stock");
  });
});
