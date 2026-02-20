/**
 * Permission enforcement tests
 *
 * Verifies that:
 *  1. Every permission subject correctly denies access to custom-role users lacking permissions
 *  2. Users with the correct permission pass the permission gate
 *  3. Owner, admin, custom-admin, and members without custom roles bypass permission checks
 *  4. Permission checks are action-specific and subject-specific
 *  5. All withAuth-protected actions reject unauthenticated calls
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- Module mocks (hoisted) ----------

vi.mock("@/lib/cached-session", () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn() }),
}));

vi.mock("@/lib/email", () => ({
  sendOrgMail: vi.fn(),
  getOrgFromAddress: vi.fn(),
}));

vi.mock("@/lib/features", () => ({
  getFeatures: vi.fn().mockResolvedValue({
    maxCustomers: 999999,
    maxUsers: 999999,
    templates: 999999,
    customTemplates: true,
    reports: true,
    smtp: true,
    api: true,
    payments: true,
    customFields: true,
    brandingRemoved: true,
    customPlatformName: true,
    maxImagesPerService: 999999,
    maxDiagnosticsPerService: 999999,
    maxDocumentsPerService: 999999,
  }),
  FeatureGatedError: class FeatureGatedError extends Error {
    feature: string;
    constructor(f: string) {
      super(`Feature gated: ${f}`);
      this.feature = f;
      this.name = "FeatureGatedError";
    }
  },
  isCloudMode: vi.fn().mockReturnValue(false),
  requireFeature: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    vehicle: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    customer: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    serviceRecord: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), aggregate: vi.fn() },
    quote: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    inventoryPart: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    inspection: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    inspectionItem: { findMany: vi.fn(), update: vi.fn() },
    inspectionTemplate: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    organizationMember: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    organizationSetting: { findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
    appSetting: { findMany: vi.fn() },
    subscription: { findUnique: vi.fn() },
    teamInvitation: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    role: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    quoteRequest: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    payment: { create: vi.fn(), delete: vi.fn(), findFirst: vi.fn() },
    recurringInvoice: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    fieldDefinition: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    customFieldValue: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    note: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findFirst: vi.fn() },
    reminder: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findFirst: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

// ---------- Imports ----------

import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";

// Representative actions — one per permission subject
import { getDashboardStats } from "@/features/vehicles/Actions/dashboardActions";
import { getVehicles, createVehicle, updateVehicle } from "@/features/vehicles/Actions/vehicleActions";
import { getCustomers } from "@/features/customers/Actions/customerActions";
import { getWorkOrders, getServiceRecords } from "@/features/vehicles/Actions/serviceActions";
import { getQuotesPaginated } from "@/features/quotes/Actions/quoteActions";
import { getBillingHistory } from "@/features/billing/Actions/billingActions";
import { getInventoryPartsPaginated } from "@/features/inventory/Actions/inventoryActions";
import { getInspectionsPaginated } from "@/features/inspections/Actions/inspectionActions";
import { getRevenueReport } from "@/features/reports/Actions/reportActions";
import { getSetting } from "@/features/settings/Actions/settingsActions";
import { removeMember } from "@/features/team/Actions/teamActions";
import { deleteVehicle } from "@/features/vehicles/Actions/deleteVehicle";

// ---------- Helpers ----------

const mockSession = vi.mocked(getCachedSession);
const mockMembership = vi.mocked(getCachedMembership);
const mockUserFindUnique = vi.mocked(db.user.findUnique);

const ORG_A = "org-a";

/**
 * Set up a user with a custom role and the given permissions.
 * Empty permissions array triggers "Insufficient permissions" for any protected action.
 */
function setupRestrictedUser(permissions: { action: string; subject: string }[] = []) {
  mockSession.mockResolvedValue({ user: { id: "restricted-user" } } as any);
  mockMembership.mockResolvedValue({
    organizationId: ORG_A,
    role: "member",
    roleId: "custom-role-id",
    customRole: { isAdmin: false, permissions },
  } as any);
  mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
}

function setupOwner() {
  mockSession.mockResolvedValue({ user: { id: "owner-user" } } as any);
  mockMembership.mockResolvedValue({
    organizationId: ORG_A,
    role: "owner",
    roleId: null,
    customRole: null,
  } as any);
  mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
}

function setupAdmin() {
  mockSession.mockResolvedValue({ user: { id: "admin-user" } } as any);
  mockMembership.mockResolvedValue({
    organizationId: ORG_A,
    role: "admin",
    roleId: null,
    customRole: null,
  } as any);
  mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
}

function setupCustomAdmin() {
  mockSession.mockResolvedValue({ user: { id: "custom-admin-user" } } as any);
  mockMembership.mockResolvedValue({
    organizationId: ORG_A,
    role: "member",
    roleId: "admin-custom-role-id",
    customRole: { isAdmin: true, permissions: [] },
  } as any);
  mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
}

function setupMemberNoCustomRole() {
  mockSession.mockResolvedValue({ user: { id: "plain-member" } } as any);
  mockMembership.mockResolvedValue({
    organizationId: ORG_A,
    role: "member",
    roleId: null,
    customRole: null,
  } as any);
  mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
}

function setupSuperAdmin() {
  mockSession.mockResolvedValue({ user: { id: "super-admin" } } as any);
  mockMembership.mockResolvedValue(null as any);
  mockUserFindUnique.mockResolvedValue({ isSuperAdmin: true } as any);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// =============================================================================
// 1. Permission denial — every subject blocks users with no permissions
// =============================================================================

describe("Permission denial — restricted custom role with no permissions", () => {
  beforeEach(() => setupRestrictedUser());

  const denialCases: [string, string, () => Promise<any>][] = [
    ["DASHBOARD", "READ", () => getDashboardStats()],
    ["VEHICLES", "READ", () => getVehicles()],
    ["CUSTOMERS", "READ", () => getCustomers()],
    ["WORK_ORDERS", "READ", () => getWorkOrders({})],
    ["QUOTES", "READ", () => getQuotesPaginated({})],
    ["SERVICES", "READ", () => getServiceRecords("any-vehicle-id")],
    ["BILLING", "READ", () => getBillingHistory({})],
    ["INVENTORY", "READ", () => getInventoryPartsPaginated({})],
    ["INSPECTIONS", "READ", () => getInspectionsPaginated({})],
    ["REPORTS", "READ", () => getRevenueReport({})],
    ["SETTINGS", "READ", () => getSetting("organization.name" as any)],
    ["SETTINGS", "MANAGE", () => removeMember("some-member-id")],
  ];

  it.each(denialCases)(
    "denies access to %s (%s) when user has no permissions",
    async (_subject, _action, callAction) => {
      const result = await callAction();
      expect(result).toEqual(
        expect.objectContaining({ success: false, error: "Insufficient permissions" })
      );
    }
  );
});

// =============================================================================
// 2. Permission grant — correct permission passes the gate
// =============================================================================

describe("Permission grant — correct permission allows access past the gate", () => {
  const grantCases: [string, { action: string; subject: string }, () => Promise<any>][] = [
    ["DASHBOARD (READ)", { action: "read", subject: "dashboard" }, () => getDashboardStats()],
    ["VEHICLES (READ)", { action: "read", subject: "vehicles" }, () => getVehicles()],
    ["VEHICLES (CREATE)", { action: "create", subject: "vehicles" }, () => createVehicle({})],
    ["VEHICLES (UPDATE)", { action: "update", subject: "vehicles" }, () => updateVehicle({})],
    ["VEHICLES (DELETE)", { action: "delete", subject: "vehicles" }, () => deleteVehicle("any-id")],
    ["CUSTOMERS (READ)", { action: "read", subject: "customers" }, () => getCustomers()],
    ["WORK_ORDERS (READ)", { action: "read", subject: "work_orders" }, () => getWorkOrders({})],
    ["QUOTES (READ)", { action: "read", subject: "quotes" }, () => getQuotesPaginated({})],
    ["SERVICES (READ)", { action: "read", subject: "services" }, () => getServiceRecords("any-id")],
    ["BILLING (READ)", { action: "read", subject: "billing" }, () => getBillingHistory({})],
    ["INVENTORY (READ)", { action: "read", subject: "inventory" }, () => getInventoryPartsPaginated({})],
    ["INSPECTIONS (READ)", { action: "read", subject: "inspections" }, () => getInspectionsPaginated({})],
    ["REPORTS (READ)", { action: "read", subject: "reports" }, () => getRevenueReport({})],
    ["SETTINGS (READ)", { action: "read", subject: "settings" }, () => getSetting("organization.name" as any)],
    ["SETTINGS (MANAGE)", { action: "manage", subject: "settings" }, () => removeMember("some-id")],
  ];

  it.each(grantCases)(
    "grants access to %s when user has the correct permission",
    async (_label, permission, callAction) => {
      setupRestrictedUser([permission]);
      const result = await callAction();
      // The action may fail for other reasons (ZodError, missing DB data, etc.)
      // but it must NOT fail with "Insufficient permissions"
      expect(result.error).not.toBe("Insufficient permissions");
    }
  );
});

// =============================================================================
// 3. Permission bypass — privileged roles skip permission checks
// =============================================================================

describe("Permission bypass — privileged roles skip permission checks", () => {
  // Use getVehicles (requires READ+VEHICLES) as the test action.
  // None of these roles should get "Insufficient permissions".

  it("owner bypasses permission checks", async () => {
    setupOwner();
    vi.mocked(db.vehicle.findMany).mockResolvedValue([]);
    const result = await getVehicles();
    expect(result.error).not.toBe("Insufficient permissions");
  });

  it("admin bypasses permission checks", async () => {
    setupAdmin();
    vi.mocked(db.vehicle.findMany).mockResolvedValue([]);
    const result = await getVehicles();
    expect(result.error).not.toBe("Insufficient permissions");
  });

  it("custom role with isAdmin:true bypasses permission checks", async () => {
    setupCustomAdmin();
    vi.mocked(db.vehicle.findMany).mockResolvedValue([]);
    const result = await getVehicles();
    expect(result.error).not.toBe("Insufficient permissions");
  });

  it("member without custom role bypasses permission checks (full access by design)", async () => {
    setupMemberNoCustomRole();
    vi.mocked(db.vehicle.findMany).mockResolvedValue([]);
    const result = await getVehicles();
    expect(result.error).not.toBe("Insufficient permissions");
  });

  it("super admin bypasses all permission checks even without org membership", async () => {
    setupSuperAdmin();
    vi.mocked(db.vehicle.findMany).mockResolvedValue([]);
    const result = await getVehicles();
    expect(result.error).not.toBe("Insufficient permissions");
  });
});

// =============================================================================
// 4. Permission specificity — wrong action or subject is denied
// =============================================================================

describe("Permission specificity — wrong action or subject is denied", () => {
  it("READ+VEHICLES does not grant access to CREATE+VEHICLES (wrong action)", async () => {
    setupRestrictedUser([{ action: "read", subject: "vehicles" }]);
    const result = await createVehicle({});
    expect(result).toEqual(
      expect.objectContaining({ success: false, error: "Insufficient permissions" })
    );
  });

  it("READ+VEHICLES does not grant access to DELETE+VEHICLES (wrong action)", async () => {
    setupRestrictedUser([{ action: "read", subject: "vehicles" }]);
    const result = await deleteVehicle("any-id");
    expect(result).toEqual(
      expect.objectContaining({ success: false, error: "Insufficient permissions" })
    );
  });

  it("UPDATE+VEHICLES does not grant access to READ+VEHICLES (wrong action)", async () => {
    setupRestrictedUser([{ action: "update", subject: "vehicles" }]);
    const result = await getVehicles();
    expect(result).toEqual(
      expect.objectContaining({ success: false, error: "Insufficient permissions" })
    );
  });

  it("READ+CUSTOMERS does not grant access to READ+VEHICLES (wrong subject)", async () => {
    setupRestrictedUser([{ action: "read", subject: "customers" }]);
    const result = await getVehicles();
    expect(result).toEqual(
      expect.objectContaining({ success: false, error: "Insufficient permissions" })
    );
  });

  it("READ+VEHICLES does not grant access to READ+CUSTOMERS (wrong subject)", async () => {
    setupRestrictedUser([{ action: "read", subject: "vehicles" }]);
    const result = await getCustomers();
    expect(result).toEqual(
      expect.objectContaining({ success: false, error: "Insufficient permissions" })
    );
  });

  it("UPDATE+SETTINGS does not grant access to MANAGE+SETTINGS", async () => {
    setupRestrictedUser([{ action: "update", subject: "settings" }]);
    const result = await removeMember("some-id");
    expect(result).toEqual(
      expect.objectContaining({ success: false, error: "Insufficient permissions" })
    );
  });

  it("MANAGE+SETTINGS does not grant access to READ+DASHBOARD (wrong subject)", async () => {
    setupRestrictedUser([{ action: "manage", subject: "settings" }]);
    const result = await getDashboardStats();
    expect(result).toEqual(
      expect.objectContaining({ success: false, error: "Insufficient permissions" })
    );
  });

  it("READ+REPORTS does not grant access to READ+BILLING (wrong subject)", async () => {
    setupRestrictedUser([{ action: "read", subject: "reports" }]);
    const result = await getBillingHistory({});
    expect(result).toEqual(
      expect.objectContaining({ success: false, error: "Insufficient permissions" })
    );
  });
});

// =============================================================================
// 5. Multiple permissions — user can hold permissions for multiple subjects
// =============================================================================

describe("Multiple permissions — user can hold permissions for multiple subjects", () => {
  it("user with READ+VEHICLES and READ+CUSTOMERS can access both", async () => {
    setupRestrictedUser([
      { action: "read", subject: "vehicles" },
      { action: "read", subject: "customers" },
    ]);
    vi.mocked(db.vehicle.findMany).mockResolvedValue([]);
    vi.mocked(db.customer.findMany).mockResolvedValue([]);

    const vehicleResult = await getVehicles();
    const customerResult = await getCustomers();

    expect(vehicleResult.error).not.toBe("Insufficient permissions");
    expect(customerResult.error).not.toBe("Insufficient permissions");
  });

  it("user with READ+VEHICLES and READ+CUSTOMERS is still denied BILLING", async () => {
    setupRestrictedUser([
      { action: "read", subject: "vehicles" },
      { action: "read", subject: "customers" },
    ]);

    const result = await getBillingHistory({});
    expect(result).toEqual(
      expect.objectContaining({ success: false, error: "Insufficient permissions" })
    );
  });

  it("user with all CRUD on VEHICLES can create, read, update, and delete", async () => {
    setupRestrictedUser([
      { action: "create", subject: "vehicles" },
      { action: "read", subject: "vehicles" },
      { action: "update", subject: "vehicles" },
      { action: "delete", subject: "vehicles" },
    ]);

    const readResult = await getVehicles();
    const createResult = await createVehicle({});
    const updateResult = await updateVehicle({});
    const deleteResult = await deleteVehicle("any-id");

    expect(readResult.error).not.toBe("Insufficient permissions");
    expect(createResult.error).not.toBe("Insufficient permissions");
    expect(updateResult.error).not.toBe("Insufficient permissions");
    expect(deleteResult.error).not.toBe("Insufficient permissions");
  });
});

// =============================================================================
// 6. Unauthenticated access — all actions reject unauthenticated calls
// =============================================================================

describe("Unauthenticated access — all actions require authentication", () => {
  beforeEach(() => {
    mockSession.mockResolvedValue(null);
  });

  const unauthCases: [string, () => Promise<any>][] = [
    ["getDashboardStats", () => getDashboardStats()],
    ["getVehicles", () => getVehicles()],
    ["getCustomers", () => getCustomers()],
    ["getWorkOrders", () => getWorkOrders({})],
    ["getQuotesPaginated", () => getQuotesPaginated({})],
    ["getServiceRecords", () => getServiceRecords("any-id")],
    ["getBillingHistory", () => getBillingHistory({})],
    ["getInventoryPartsPaginated", () => getInventoryPartsPaginated({})],
    ["getInspectionsPaginated", () => getInspectionsPaginated({})],
    ["getRevenueReport", () => getRevenueReport({})],
    ["getSetting", () => getSetting("organization.name" as any)],
    ["removeMember", () => removeMember("some-id")],
    ["createVehicle", () => createVehicle({})],
    ["updateVehicle", () => updateVehicle({})],
    ["deleteVehicle", () => deleteVehicle("any-id")],
  ];

  it.each(unauthCases)(
    "%s rejects unauthenticated calls",
    async (_name, callAction) => {
      const result = await callAction();
      expect(result).toEqual(
        expect.objectContaining({ success: false, error: "Unauthorized" })
      );
    }
  );
});

// =============================================================================
// 7. No-org access — users without organization membership are rejected
// =============================================================================

describe("No-org access — users without organization are rejected", () => {
  beforeEach(() => {
    mockSession.mockResolvedValue({ user: { id: "orphan-user" } } as any);
    mockMembership.mockResolvedValue(null as any);
    mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
  });

  it("rejects non-super-admin users without an organization", async () => {
    const result = await getVehicles();
    expect(result).toEqual(
      expect.objectContaining({ success: false, error: "No organization found" })
    );
  });
});
