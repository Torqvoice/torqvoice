/**
 * Tests for work order (service record) creation.
 *
 * Covers both creation flows:
 * - createServiceRecord: Full service record with parts, labor, attachments
 * - createDraftServiceRecord: Quick draft from workboard with technician assignment
 *
 * Key areas:
 * - Vehicle ownership verification
 * - Invoice number generation
 * - Technician resolution (by ID, by default setting, fallback)
 * - Parts inventory deduction
 * - Vehicle mileage update
 * - Org scoping
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cached-session", () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/invoice-utils", () => ({
  resolveInvoicePrefix: vi.fn((p: string) => {
    const now = new Date();
    return p
      .replace("{year}", now.getFullYear().toString())
      .replace("{month}", String(now.getMonth() + 1).padStart(2, "0"));
  }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    vehicle: { findFirst: vi.fn(), update: vi.fn() },
    appSetting: { findMany: vi.fn(), updateMany: vi.fn() },
    organization: { findUnique: vi.fn() },
    serviceRecord: { findFirst: vi.fn(), create: vi.fn() },
    technician: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";
import { createServiceRecord } from "@/features/vehicles/Actions/serviceActions";
import { createDraftServiceRecord } from "@/features/vehicles/Actions/createDraftServiceRecord";

const mockSession = vi.mocked(getCachedSession);
const mockMembership = vi.mocked(getCachedMembership);

const ORG = "org-1";
const USER_ID = "user-1";
const VEHICLE_ID = "veh-1";
const TECH_ID = "tech-1";

const VEHICLE = { id: VEHICLE_ID, organizationId: ORG, mileage: 50000 };

function setupAuth() {
  mockSession.mockResolvedValue({ user: { id: USER_ID, email: "user@example.com" } } as any);
  mockMembership.mockResolvedValue({
    organizationId: ORG,
    role: "owner",
    roleId: null,
    customRole: null,
  } as any);
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false, name: "Test User" } as any);
}

function setupCommonMocks() {
  vi.mocked(db.vehicle.findFirst).mockResolvedValue(VEHICLE as any);
  vi.mocked(db.appSetting.findMany).mockResolvedValue([]);
  vi.mocked(db.organization.findUnique).mockResolvedValue({ name: "Test Shop" } as any);
  vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null); // no previous records
  vi.mocked(db.vehicle.update).mockResolvedValue(VEHICLE as any);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// createServiceRecord — vehicle ownership
// ---------------------------------------------------------------------------

describe("createServiceRecord — vehicle ownership", () => {
  it("rejects when vehicle does not belong to org", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(null);

    const result = await createServiceRecord({
      vehicleId: "other-veh",
      title: "Oil Change",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Vehicle not found");
    expect(vi.mocked(db.$transaction)).not.toHaveBeenCalled();
  });

  it("scopes vehicle lookup to caller's organizationId", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(null);

    await createServiceRecord({ vehicleId: VEHICLE_ID, title: "Oil Change" });

    expect(vi.mocked(db.vehicle.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// createServiceRecord — invoice number generation
// ---------------------------------------------------------------------------

describe("createServiceRecord — invoice number", () => {
  it("generates invoice number starting at 1001 when no previous records", async () => {
    setupAuth();
    setupCommonMocks();

    const mockCreate = vi.fn().mockResolvedValue({ id: "sr-1" });
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        serviceRecord: { create: mockCreate },
        servicePart: { createMany: vi.fn() },
        serviceLabor: { createMany: vi.fn() },
        serviceAttachment: { createMany: vi.fn() },
        inventoryPart: { findFirst: vi.fn(), update: vi.fn() },
      })
    );

    await createServiceRecord({ vehicleId: VEHICLE_ID, title: "Oil Change" });

    const year = new Date().getFullYear();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceNumber: `${year}-1001`,
        }),
      })
    );
  });

  it("increments from last invoice number", async () => {
    setupAuth();
    setupCommonMocks();
    const year = new Date().getFullYear();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({ invoiceNumber: `${year}-1005` } as any);

    const mockCreate = vi.fn().mockResolvedValue({ id: "sr-2" });
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        serviceRecord: { create: mockCreate },
        servicePart: { createMany: vi.fn() },
        serviceLabor: { createMany: vi.fn() },
        serviceAttachment: { createMany: vi.fn() },
        inventoryPart: { findFirst: vi.fn(), update: vi.fn() },
      })
    );

    await createServiceRecord({ vehicleId: VEHICLE_ID, title: "Brake Service" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceNumber: `${year}-1006`,
        }),
      })
    );
  });

  it("uses custom prefix from settings", async () => {
    setupAuth();
    setupCommonMocks();
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: "workshop.invoicePrefix", value: "INV-" } as any,
    ]);

    const mockCreate = vi.fn().mockResolvedValue({ id: "sr-3" });
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        serviceRecord: { create: mockCreate },
        servicePart: { createMany: vi.fn() },
        serviceLabor: { createMany: vi.fn() },
        serviceAttachment: { createMany: vi.fn() },
        inventoryPart: { findFirst: vi.fn(), update: vi.fn() },
      })
    );

    await createServiceRecord({ vehicleId: VEHICLE_ID, title: "Test" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceNumber: expect.stringContaining("INV-"),
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// createServiceRecord — parts and inventory
// ---------------------------------------------------------------------------

describe("createServiceRecord — parts and inventory", () => {
  it("creates part items in the transaction", async () => {
    setupAuth();
    setupCommonMocks();

    const mockCreate = vi.fn().mockResolvedValue({ id: "sr-parts" });
    const mockPartCreateMany = vi.fn();
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        serviceRecord: { create: mockCreate },
        servicePart: { createMany: mockPartCreateMany },
        serviceLabor: { createMany: vi.fn() },
        serviceAttachment: { createMany: vi.fn() },
        inventoryPart: { findFirst: vi.fn(), update: vi.fn() },
      })
    );

    await createServiceRecord({
      vehicleId: VEHICLE_ID,
      title: "Brake Job",
      partItems: [
        { name: "Brake Pads", quantity: 2, unitPrice: 45, total: 90 },
      ],
      subtotal: 90,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 90,
    });

    expect(mockPartCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            name: "Brake Pads",
            quantity: 2,
            serviceRecordId: "sr-parts",
          }),
        ]),
      })
    );
  });

  it("deducts inventory stock when part has inventoryPartId", async () => {
    setupAuth();
    setupCommonMocks();

    const mockCreate = vi.fn().mockResolvedValue({ id: "sr-inv" });
    const mockInvFind = vi.fn().mockResolvedValue({ id: "inv-1", quantity: 10, organizationId: ORG });
    const mockInvUpdate = vi.fn();
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        serviceRecord: { create: mockCreate },
        servicePart: { createMany: vi.fn() },
        serviceLabor: { createMany: vi.fn() },
        serviceAttachment: { createMany: vi.fn() },
        inventoryPart: { findFirst: mockInvFind, update: mockInvUpdate },
      })
    );

    await createServiceRecord({
      vehicleId: VEHICLE_ID,
      title: "Service",
      partItems: [
        { name: "Oil Filter", quantity: 1, unitPrice: 15, total: 15, inventoryPartId: "inv-1" },
      ],
      subtotal: 15,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 15,
    });

    expect(mockInvUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-1" },
        data: { quantity: 9 }, // 10 - 1
      })
    );
  });

  it("does not allow negative inventory (floors at 0)", async () => {
    setupAuth();
    setupCommonMocks();

    const mockCreate = vi.fn().mockResolvedValue({ id: "sr-neg" });
    const mockInvFind = vi.fn().mockResolvedValue({ id: "inv-2", quantity: 1, organizationId: ORG });
    const mockInvUpdate = vi.fn();
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        serviceRecord: { create: mockCreate },
        servicePart: { createMany: vi.fn() },
        serviceLabor: { createMany: vi.fn() },
        serviceAttachment: { createMany: vi.fn() },
        inventoryPart: { findFirst: mockInvFind, update: mockInvUpdate },
      })
    );

    await createServiceRecord({
      vehicleId: VEHICLE_ID,
      title: "Service",
      partItems: [
        { name: "Rare Part", quantity: 5, unitPrice: 100, total: 500, inventoryPartId: "inv-2" },
      ],
      subtotal: 500,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 500,
    });

    expect(mockInvUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { quantity: 0 },
      })
    );
  });
});

// ---------------------------------------------------------------------------
// createServiceRecord — vehicle mileage update
// ---------------------------------------------------------------------------

describe("createServiceRecord — vehicle mileage", () => {
  it("updates vehicle mileage when service mileage is higher", async () => {
    setupAuth();
    setupCommonMocks();

    const mockCreate = vi.fn().mockResolvedValue({ id: "sr-mile" });
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        serviceRecord: { create: mockCreate },
        servicePart: { createMany: vi.fn() },
        serviceLabor: { createMany: vi.fn() },
        serviceAttachment: { createMany: vi.fn() },
        inventoryPart: { findFirst: vi.fn(), update: vi.fn() },
      })
    );

    await createServiceRecord({
      vehicleId: VEHICLE_ID,
      title: "Service",
      mileage: 55000, // higher than vehicle's 50000
    });

    expect(vi.mocked(db.vehicle.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mileage: 55000 }),
      })
    );
  });

  it("does not downgrade vehicle mileage when service mileage is lower", async () => {
    setupAuth();
    setupCommonMocks();

    const mockCreate = vi.fn().mockResolvedValue({ id: "sr-low" });
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        serviceRecord: { create: mockCreate },
        servicePart: { createMany: vi.fn() },
        serviceLabor: { createMany: vi.fn() },
        serviceAttachment: { createMany: vi.fn() },
        inventoryPart: { findFirst: vi.fn(), update: vi.fn() },
      })
    );

    await createServiceRecord({
      vehicleId: VEHICLE_ID,
      title: "Service",
      mileage: 40000, // lower than vehicle's 50000
    });

    // Should NOT include mileage in the update
    expect(vi.mocked(db.vehicle.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ mileage: 40000 }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// createServiceRecord — labor items
// ---------------------------------------------------------------------------

describe("createServiceRecord — labor items", () => {
  it("creates labor items in the transaction", async () => {
    setupAuth();
    setupCommonMocks();

    const mockCreate = vi.fn().mockResolvedValue({ id: "sr-labor" });
    const mockLaborCreateMany = vi.fn();
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        serviceRecord: { create: mockCreate },
        servicePart: { createMany: vi.fn() },
        serviceLabor: { createMany: mockLaborCreateMany },
        serviceAttachment: { createMany: vi.fn() },
        inventoryPart: { findFirst: vi.fn(), update: vi.fn() },
      })
    );

    await createServiceRecord({
      vehicleId: VEHICLE_ID,
      title: "Full Service",
      laborItems: [
        { description: "Oil change labor", hours: 0.5, rate: 80, total: 40 },
        { description: "Brake inspection", hours: 1, rate: 80, total: 80 },
      ],
      subtotal: 120,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 120,
    });

    expect(mockLaborCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ description: "Oil change labor", serviceRecordId: "sr-labor" }),
          expect.objectContaining({ description: "Brake inspection", serviceRecordId: "sr-labor" }),
        ]),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// createServiceRecord — input validation
// ---------------------------------------------------------------------------

describe("createServiceRecord — input validation", () => {
  it("rejects missing title", async () => {
    setupAuth();

    const result = await createServiceRecord({ vehicleId: VEHICLE_ID });

    expect(result.success).toBe(false);
  });

  it("rejects empty title", async () => {
    setupAuth();

    const result = await createServiceRecord({ vehicleId: VEHICLE_ID, title: "" });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createDraftServiceRecord — technician assignment
// ---------------------------------------------------------------------------

describe("createDraftServiceRecord — technician resolution", () => {
  it("uses explicit technicianId when provided", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(VEHICLE as any);
    vi.mocked(db.appSetting.findMany).mockResolvedValue([]);
    vi.mocked(db.organization.findUnique).mockResolvedValue({ name: "Test Shop" } as any);
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null);
    vi.mocked(db.technician.findFirst).mockResolvedValue({ id: TECH_ID, name: "John Mechanic" } as any);

    vi.mocked(db.serviceRecord.create).mockResolvedValue({ id: "sr-tech" } as any);

    await createDraftServiceRecord(VEHICLE_ID, undefined, undefined, TECH_ID);

    expect(vi.mocked(db.serviceRecord.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          technicianId: TECH_ID,
          techName: "John Mechanic",
        }),
      })
    );
  });

  it("falls back to default technician from settings when no technicianId provided", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(VEHICLE as any);
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: "workshop.defaultTechnician", value: "Default Tech" } as any,
    ]);
    vi.mocked(db.organization.findUnique).mockResolvedValue({ name: "Shop" } as any);
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null);
    // First call: default tech lookup by name, second call: tech name lookup by id
    vi.mocked(db.technician.findFirst)
      .mockResolvedValueOnce({ id: "default-tech-id", name: "Default Tech" } as any)
      .mockResolvedValueOnce({ name: "Default Tech" } as any);

    vi.mocked(db.serviceRecord.create).mockResolvedValue({ id: "sr-default" } as any);

    await createDraftServiceRecord(VEHICLE_ID);

    expect(vi.mocked(db.technician.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG,
          name: "Default Tech",
          isActive: true,
        }),
      })
    );

    expect(vi.mocked(db.serviceRecord.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          technicianId: "default-tech-id",
        }),
      })
    );
  });

  it("creates record without technician when no tech found", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(VEHICLE as any);
    vi.mocked(db.appSetting.findMany).mockResolvedValue([]);
    vi.mocked(db.organization.findUnique).mockResolvedValue({ name: "Shop" } as any);
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null);

    vi.mocked(db.serviceRecord.create).mockResolvedValue({ id: "sr-notech" } as any);

    await createDraftServiceRecord(VEHICLE_ID);

    expect(vi.mocked(db.serviceRecord.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          technicianId: expect.any(String),
        }),
      })
    );
  });

  it("rejects when vehicle does not belong to org", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(null);

    const result = await createDraftServiceRecord("other-veh");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Vehicle not found");
  });

  it("scopes vehicle lookup to caller's organizationId", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(null);

    await createDraftServiceRecord(VEHICLE_ID);

    expect(vi.mocked(db.vehicle.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// createDraftServiceRecord — default datetime
// ---------------------------------------------------------------------------

describe("createDraftServiceRecord — scheduling", () => {
  it("defaults to 1 hour duration when no endDateTime provided", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(VEHICLE as any);
    vi.mocked(db.appSetting.findMany).mockResolvedValue([]);
    vi.mocked(db.organization.findUnique).mockResolvedValue({ name: "Shop" } as any);
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null);

    vi.mocked(db.serviceRecord.create).mockResolvedValue({ id: "sr-time" } as any);

    const start = new Date(2026, 2, 8, 9, 0, 0);
    await createDraftServiceRecord(VEHICLE_ID, start);

    expect(vi.mocked(db.serviceRecord.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          startDateTime: start,
          endDateTime: new Date(start.getTime() + 3600000), // +1 hour
        }),
      })
    );
  });

  it("uses workDayStart setting when no startDateTime provided", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(VEHICLE as any);
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: "workboard.workDayStart", value: "08:30" } as any,
    ]);
    vi.mocked(db.organization.findUnique).mockResolvedValue({ name: "Shop" } as any);
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null);

    vi.mocked(db.serviceRecord.create).mockResolvedValue({ id: "sr-daystart" } as any);

    await createDraftServiceRecord(VEHICLE_ID);

    const createCall = vi.mocked(db.serviceRecord.create).mock.calls[0][0] as any;
    const startDT: Date = createCall.data.startDateTime;
    expect(startDT.getHours()).toBe(8);
    expect(startDT.getMinutes()).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Tax injection — both creation actions read settings + customer.taxExempt
// at creation time. These tests prove the wiring (lib/tax math is locked
// separately in src/__tests__/lib/tax.test.ts).
// ---------------------------------------------------------------------------

describe("createServiceRecord — tax injection", () => {
  it("inherits the org's workshop.taxInclusive setting when caller doesn't pass it", async () => {
    setupAuth();
    setupCommonMocks();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ ...VEHICLE, customer: { taxExempt: false } } as any);
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: "workshop.taxInclusive", value: "true" } as any,
    ]);

    const mockCreate = vi.fn().mockResolvedValue({ id: "sr-incl" });
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        serviceRecord: { create: mockCreate },
        servicePart: { createMany: vi.fn() },
        serviceLabor: { createMany: vi.fn() },
        serviceAttachment: { createMany: vi.fn() },
        inventoryPart: { findFirst: vi.fn(), update: vi.fn() },
      })
    );

    await createServiceRecord({ vehicleId: VEHICLE_ID, title: "Test" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ taxInclusive: true }),
      })
    );
  });

  it("respects an explicit taxInclusive value from the caller (overrides org default)", async () => {
    setupAuth();
    setupCommonMocks();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ ...VEHICLE, customer: { taxExempt: false } } as any);
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: "workshop.taxInclusive", value: "true" } as any,
    ]);

    const mockCreate = vi.fn().mockResolvedValue({ id: "sr-explicit" });
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        serviceRecord: { create: mockCreate },
        servicePart: { createMany: vi.fn() },
        serviceLabor: { createMany: vi.fn() },
        serviceAttachment: { createMany: vi.fn() },
        inventoryPart: { findFirst: vi.fn(), update: vi.fn() },
      })
    );

    // Caller explicitly passes taxInclusive: false. Should be respected.
    await createServiceRecord({ vehicleId: VEHICLE_ID, title: "Test", taxInclusive: false });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ taxInclusive: false }),
      })
    );
  });

  it("forces taxRate=0 and taxAmount=0 when the customer is tax exempt", async () => {
    setupAuth();
    setupCommonMocks();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ ...VEHICLE, customer: { taxExempt: true } } as any);

    const mockCreate = vi.fn().mockResolvedValue({ id: "sr-exempt" });
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        serviceRecord: { create: mockCreate },
        servicePart: { createMany: vi.fn() },
        serviceLabor: { createMany: vi.fn() },
        serviceAttachment: { createMany: vi.fn() },
        inventoryPart: { findFirst: vi.fn(), update: vi.fn() },
      })
    );

    // Caller passes a non-zero rate; the exempt flag must override it.
    await createServiceRecord({
      vehicleId: VEHICLE_ID,
      title: "Test",
      taxRate: 25,
      taxAmount: 50,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ taxRate: 0, taxAmount: 0 }),
      })
    );
  });
});

describe("createDraftServiceRecord — tax injection", () => {
  it("injects the org default tax rate from settings", async () => {
    setupAuth();
    setupCommonMocks();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ ...VEHICLE, customer: { taxExempt: false } } as any);
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: "workshop.defaultTaxRate", value: "25" } as any,
      { key: "workshop.taxEnabled", value: "true" } as any,
    ]);
    vi.mocked(db.serviceRecord.create).mockResolvedValue({ id: "draft-1" } as any);

    await createDraftServiceRecord(VEHICLE_ID);

    expect(vi.mocked(db.serviceRecord.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ taxRate: 25 }),
      })
    );
  });

  it("injects taxInclusive=true from the org setting", async () => {
    setupAuth();
    setupCommonMocks();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ ...VEHICLE, customer: { taxExempt: false } } as any);
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: "workshop.defaultTaxRate", value: "25" } as any,
      { key: "workshop.taxEnabled", value: "true" } as any,
      { key: "workshop.taxInclusive", value: "true" } as any,
    ]);
    vi.mocked(db.serviceRecord.create).mockResolvedValue({ id: "draft-incl" } as any);

    await createDraftServiceRecord(VEHICLE_ID);

    expect(vi.mocked(db.serviceRecord.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ taxInclusive: true }),
      })
    );
  });

  it("forces taxRate=0 when the vehicle's customer is tax exempt", async () => {
    setupAuth();
    setupCommonMocks();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ ...VEHICLE, customer: { taxExempt: true } } as any);
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: "workshop.defaultTaxRate", value: "25" } as any,
      { key: "workshop.taxEnabled", value: "true" } as any,
    ]);
    vi.mocked(db.serviceRecord.create).mockResolvedValue({ id: "draft-exempt" } as any);

    await createDraftServiceRecord(VEHICLE_ID);

    // Even though the org default is 25%, the exempt customer overrides it.
    expect(vi.mocked(db.serviceRecord.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ taxRate: 0 }),
      })
    );
  });

  it("uses 0 as the default rate when tax is disabled in settings", async () => {
    setupAuth();
    setupCommonMocks();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ ...VEHICLE, customer: { taxExempt: false } } as any);
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: "workshop.defaultTaxRate", value: "25" } as any,
      { key: "workshop.taxEnabled", value: "false" } as any,
    ]);
    vi.mocked(db.serviceRecord.create).mockResolvedValue({ id: "draft-disabled" } as any);

    await createDraftServiceRecord(VEHICLE_ID);

    expect(vi.mocked(db.serviceRecord.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ taxRate: 0 }),
      })
    );
  });
});
