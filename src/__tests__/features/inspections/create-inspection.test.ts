/**
 * Tests for createInspection server action.
 *
 * Covers:
 * - Technician lookup by memberId (not userId directly as technicianId)
 * - Vehicle and template ownership verification
 * - Template items are copied into inspection items
 * - Graceful handling when user has no technician record
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
    vehicle: { findFirst: vi.fn() },
    inspectionTemplate: { findFirst: vi.fn() },
    technician: { findFirst: vi.fn() },
    inspection: { findFirst: vi.fn() },
    inspectionItem: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";
import { createInspection } from "@/features/inspections/Actions/inspectionActions";

const mockSession = vi.mocked(getCachedSession);
const mockMembership = vi.mocked(getCachedMembership);

const ORG = "org-1";
const USER_ID = "user-1";
const TECH_ID = "tech-1";
const VEHICLE_ID = "veh-1";
const TEMPLATE_ID = "tmpl-1";

function setupAuth() {
  mockSession.mockResolvedValue({ user: { id: USER_ID, email: "tech@example.com" } } as any);
  mockMembership.mockResolvedValue({
    organizationId: ORG,
    role: "owner",
    roleId: null,
    customRole: null,
  } as any);
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any);
}

const TEMPLATE_WITH_ITEMS = {
  id: TEMPLATE_ID,
  organizationId: ORG,
  sections: [
    {
      name: "Brakes",
      sortOrder: 0,
      items: [
        { name: "Front pads", sortOrder: 0 },
        { name: "Rear pads", sortOrder: 1 },
      ],
    },
    {
      name: "Tires",
      sortOrder: 1,
      items: [
        { name: "Tread depth", sortOrder: 0 },
      ],
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Technician lookup — the bug that caused FK constraint violation
// ---------------------------------------------------------------------------

describe("createInspection — technician lookup", () => {
  it("looks up technician by memberId (not userId as technicianId)", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: VEHICLE_ID, organizationId: ORG } as any);
    vi.mocked(db.inspectionTemplate.findFirst).mockResolvedValue(TEMPLATE_WITH_ITEMS as any);
    vi.mocked(db.technician.findFirst).mockResolvedValue({ id: TECH_ID } as any);

    const mockCreate = vi.fn().mockResolvedValue({ id: "insp-1" });
    const mockCreateMany = vi.fn();
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({ inspection: { create: mockCreate }, inspectionItem: { createMany: mockCreateMany } })
    );

    await createInspection({ vehicleId: VEHICLE_ID, templateId: TEMPLATE_ID });

    // Technician must be looked up by userId, not used directly as technicianId
    expect(vi.mocked(db.technician.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER_ID,
          organizationId: ORG,
          isActive: true,
        }),
      })
    );
  });

  it("uses the technician.id (not userId) as technicianId in the inspection", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: VEHICLE_ID, organizationId: ORG } as any);
    vi.mocked(db.inspectionTemplate.findFirst).mockResolvedValue(TEMPLATE_WITH_ITEMS as any);
    vi.mocked(db.technician.findFirst).mockResolvedValue({ id: TECH_ID } as any);

    const mockCreate = vi.fn().mockResolvedValue({ id: "insp-1" });
    const mockCreateMany = vi.fn();
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({ inspection: { create: mockCreate }, inspectionItem: { createMany: mockCreateMany } })
    );

    await createInspection({ vehicleId: VEHICLE_ID, templateId: TEMPLATE_ID });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          technicianId: TECH_ID,  // Must be technician.id, NOT userId
        }),
      })
    );
  });

  it("sets technicianId to null when user has no technician record", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: VEHICLE_ID, organizationId: ORG } as any);
    vi.mocked(db.inspectionTemplate.findFirst).mockResolvedValue(TEMPLATE_WITH_ITEMS as any);
    vi.mocked(db.technician.findFirst).mockResolvedValue(null);

    const mockCreate = vi.fn().mockResolvedValue({ id: "insp-1" });
    const mockCreateMany = vi.fn();
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({ inspection: { create: mockCreate }, inspectionItem: { createMany: mockCreateMany } })
    );

    await createInspection({ vehicleId: VEHICLE_ID, templateId: TEMPLATE_ID });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          technicianId: null,
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Vehicle and template ownership
// ---------------------------------------------------------------------------

describe("createInspection — ownership verification", () => {
  it("rejects when vehicle does not belong to the org", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(null);

    const result = await createInspection({ vehicleId: "other-veh", templateId: TEMPLATE_ID });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Vehicle not found");
    expect(vi.mocked(db.$transaction)).not.toHaveBeenCalled();
  });

  it("rejects when template does not belong to the org", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: VEHICLE_ID, organizationId: ORG } as any);
    vi.mocked(db.inspectionTemplate.findFirst).mockResolvedValue(null);

    const result = await createInspection({ vehicleId: VEHICLE_ID, templateId: "other-tmpl" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Template not found");
    expect(vi.mocked(db.$transaction)).not.toHaveBeenCalled();
  });

  it("scopes vehicle lookup to the caller's organizationId", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(null);

    await createInspection({ vehicleId: VEHICLE_ID, templateId: TEMPLATE_ID });

    expect(vi.mocked(db.vehicle.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG }),
      })
    );
  });

  it("scopes template lookup to the caller's organizationId", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: VEHICLE_ID, organizationId: ORG } as any);
    vi.mocked(db.inspectionTemplate.findFirst).mockResolvedValue(null);

    await createInspection({ vehicleId: VEHICLE_ID, templateId: TEMPLATE_ID });

    expect(vi.mocked(db.inspectionTemplate.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Template items are copied correctly
// ---------------------------------------------------------------------------

describe("createInspection — template item copying", () => {
  it("copies all template items into inspection items", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: VEHICLE_ID, organizationId: ORG } as any);
    vi.mocked(db.inspectionTemplate.findFirst).mockResolvedValue(TEMPLATE_WITH_ITEMS as any);
    vi.mocked(db.technician.findFirst).mockResolvedValue({ id: TECH_ID } as any);

    const mockCreate = vi.fn().mockResolvedValue({ id: "insp-1" });
    const mockCreateMany = vi.fn();
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({ inspection: { create: mockCreate }, inspectionItem: { createMany: mockCreateMany } })
    );

    await createInspection({ vehicleId: VEHICLE_ID, templateId: TEMPLATE_ID });

    // 3 items total: 2 from Brakes + 1 from Tires
    expect(mockCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ name: "Front pads", section: "Brakes", inspectionId: "insp-1" }),
          expect.objectContaining({ name: "Rear pads", section: "Brakes", inspectionId: "insp-1" }),
          expect.objectContaining({ name: "Tread depth", section: "Tires", inspectionId: "insp-1" }),
        ]),
      })
    );
  });

  it("assigns globally unique sortOrder across sections", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: VEHICLE_ID, organizationId: ORG } as any);
    vi.mocked(db.inspectionTemplate.findFirst).mockResolvedValue(TEMPLATE_WITH_ITEMS as any);
    vi.mocked(db.technician.findFirst).mockResolvedValue({ id: TECH_ID } as any);

    const mockCreate = vi.fn().mockResolvedValue({ id: "insp-1" });
    const mockCreateMany = vi.fn();
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({ inspection: { create: mockCreate }, inspectionItem: { createMany: mockCreateMany } })
    );

    await createInspection({ vehicleId: VEHICLE_ID, templateId: TEMPLATE_ID });

    const items = mockCreateMany.mock.calls[0][0].data;
    // Section 0 items: sortOrder 0, 1; Section 1 items: sortOrder 1000
    expect(items[0].sortOrder).toBe(0);    // Brakes[0]
    expect(items[1].sortOrder).toBe(1);    // Brakes[1]
    expect(items[2].sortOrder).toBe(1000); // Tires[0]
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe("createInspection — input validation", () => {
  it("rejects empty vehicleId", async () => {
    setupAuth();

    const result = await createInspection({ vehicleId: "", templateId: TEMPLATE_ID });

    expect(result.success).toBe(false);
  });

  it("rejects empty templateId", async () => {
    setupAuth();

    const result = await createInspection({ vehicleId: VEHICLE_ID, templateId: "" });

    expect(result.success).toBe(false);
  });

  it("accepts optional mileage", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: VEHICLE_ID, organizationId: ORG } as any);
    vi.mocked(db.inspectionTemplate.findFirst).mockResolvedValue(TEMPLATE_WITH_ITEMS as any);
    vi.mocked(db.technician.findFirst).mockResolvedValue({ id: TECH_ID } as any);

    const mockCreate = vi.fn().mockResolvedValue({ id: "insp-1" });
    const mockCreateMany = vi.fn();
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({ inspection: { create: mockCreate }, inspectionItem: { createMany: mockCreateMany } })
    );

    await createInspection({ vehicleId: VEHICLE_ID, templateId: TEMPLATE_ID, mileage: 50000 });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mileage: 50000 }),
      })
    );
  });
});
