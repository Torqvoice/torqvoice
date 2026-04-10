/**
 * Tests for addPartToServiceRecord — recalculates totals after adding a part.
 *
 * Critical behaviour: must call calculateTotals() with the record's stored
 * taxInclusive flag so inclusive records aren't broken when the user adds a
 * part. The math is locked in src/__tests__/lib/tax.test.ts; these tests prove
 * the wiring is correct.
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
    serviceRecord: { findFirst: vi.fn(), update: vi.fn() },
    servicePart: { create: vi.fn(), aggregate: vi.fn() },
    serviceLabor: { aggregate: vi.fn() },
    inventoryPart: { update: vi.fn() },
  },
}));

import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";
import { addPartToServiceRecord } from "@/features/vehicles/Actions/addPartToServiceRecord";

const mockSession = vi.mocked(getCachedSession);
const mockMembership = vi.mocked(getCachedMembership);

const ORG = "org-1";
const USER_ID = "user-1";
const RECORD_ID = "sr-1";
const VEHICLE_ID = "veh-1";

function setupAuth() {
  mockSession.mockResolvedValue({ user: { id: USER_ID, email: "user@example.com" } } as any);
  mockMembership.mockResolvedValue({
    organizationId: ORG,
    role: "owner",
    roleId: null,
    customRole: null,
  } as any);
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("addPartToServiceRecord — totals recalculation", () => {
  it("calculates exclusive totals correctly when adding a part to an exclusive record", async () => {
    setupAuth();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      id: RECORD_ID,
      vehicleId: VEHICLE_ID,
      subtotal: 100,
      taxRate: 25,
      taxInclusive: false,
      discountType: null,
      discountValue: 0,
    } as any);
    vi.mocked(db.servicePart.create).mockResolvedValue({ id: "part-1" } as any);
    // After the new part is added, parts agg = 200, labor agg = 0
    vi.mocked(db.servicePart.aggregate).mockResolvedValue({ _sum: { total: 200 } } as any);
    vi.mocked(db.serviceLabor.aggregate).mockResolvedValue({ _sum: { total: 0 } } as any);

    await addPartToServiceRecord({
      serviceRecordId: RECORD_ID,
      name: "New Part",
      quantity: 1,
      unitPrice: 100,
      total: 100,
      unitCost: 50,
    });

    // Exclusive: subtotal=200, tax=200*0.25=50, total=250
    expect(vi.mocked(db.serviceRecord.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 200,
          taxAmount: 50,
          totalAmount: 250,
        }),
      })
    );
  });

  it("calculates inclusive totals correctly when adding a part to an inclusive record", async () => {
    setupAuth();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      id: RECORD_ID,
      vehicleId: VEHICLE_ID,
      subtotal: 125,
      taxRate: 25,
      taxInclusive: true,
      discountType: null,
      discountValue: 0,
    } as any);
    vi.mocked(db.servicePart.create).mockResolvedValue({ id: "part-2" } as any);
    // After adding a 125 (gross) part, parts agg = 250
    vi.mocked(db.servicePart.aggregate).mockResolvedValue({ _sum: { total: 250 } } as any);
    vi.mocked(db.serviceLabor.aggregate).mockResolvedValue({ _sum: { total: 0 } } as any);

    await addPartToServiceRecord({
      serviceRecordId: RECORD_ID,
      name: "Inclusive Part",
      quantity: 1,
      unitPrice: 125,
      total: 125,
      unitCost: 50,
    });

    // Inclusive: gross subtotal=250, net=200, tax=50, total=250 (gross)
    const updateCall = vi.mocked(db.serviceRecord.update).mock.calls[0][0] as any;
    expect(updateCall.data.subtotal).toBe(250);
    expect(updateCall.data.taxAmount).toBeCloseTo(50);
    expect(updateCall.data.totalAmount).toBeCloseTo(250);
  });

  it("respects a fixed discount when recalculating in inclusive mode", async () => {
    setupAuth();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      id: RECORD_ID,
      vehicleId: VEHICLE_ID,
      subtotal: 0,
      taxRate: 10,
      taxInclusive: true,
      discountType: "fixed",
      discountValue: 22, // 22 gross discount
    } as any);
    vi.mocked(db.servicePart.create).mockResolvedValue({ id: "part-3" } as any);
    // After adding, parts agg = 110 (gross), labor = 0
    vi.mocked(db.servicePart.aggregate).mockResolvedValue({ _sum: { total: 110 } } as any);
    vi.mocked(db.serviceLabor.aggregate).mockResolvedValue({ _sum: { total: 0 } } as any);

    await addPartToServiceRecord({
      serviceRecordId: RECORD_ID,
      name: "Discounted Part",
      quantity: 1,
      unitPrice: 110,
      total: 110,
      unitCost: 50,
    });

    // Inclusive 10%, subtotal=110, discount=22, base=88, net=80, tax=8, total=88
    const updateCall = vi.mocked(db.serviceRecord.update).mock.calls[0][0] as any;
    expect(updateCall.data.subtotal).toBe(110);
    expect(updateCall.data.taxAmount).toBeCloseTo(8);
    expect(updateCall.data.totalAmount).toBeCloseTo(88);
  });

  it("rejects when the service record does not belong to the org", async () => {
    setupAuth();
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null);

    const result = await addPartToServiceRecord({
      serviceRecordId: "other-record",
      name: "Test",
      quantity: 1,
      unitPrice: 10,
      total: 10,
      unitCost: 5,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Service record not found");
    expect(vi.mocked(db.servicePart.create)).not.toHaveBeenCalled();
  });
});
