/**
 * Tests for tax handling in financial reports.
 *
 * Critical behaviour: reports must produce correct numbers regardless of
 * whether records were entered in inclusive or exclusive tax mode.
 *
 * - getRevenueReport: parts/labor revenue must be NET (pre-tax) so net profit
 *   math works in both modes.
 * - getTaxReport: taxableAmount must be `totalAmount - taxAmount` (the actual
 *   net base, valid in both modes and accounting for discounts).
 * - getPartsUsageReport: per-line totalRevenue must be NET so it adds up with
 *   the always-net partsCost.
 * - getVehicleReport: monthly laborCost must be NET so the breakdown is
 *   consistent across modes.
 *
 * The math itself is locked in src/__tests__/lib/tax.test.ts. These tests
 * prove the report functions wire `netLineTotal` correctly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cached-session", () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    serviceRecord: { findMany: vi.fn() },
    servicePart: { findMany: vi.fn() },
    customer: { findMany: vi.fn() },
    vehicle: { findFirst: vi.fn() },
  },
}));

import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";
import {
  getRevenueReport,
  getTaxReport,
  getPartsUsageReport,
  getVehicleReport,
} from "@/features/reports/Actions/reportActions";

const mockSession = vi.mocked(getCachedSession);
const mockMembership = vi.mocked(getCachedMembership);

const ORG = "org-1";
const USER_ID = "user-1";

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

// ---------------------------------------------------------------------------
// getRevenueReport
// ---------------------------------------------------------------------------

describe("getRevenueReport — net parts/labor calculation", () => {
  it("returns net parts/labor revenue for an exclusive record (no scaling)", async () => {
    setupAuth();
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
      {
        serviceDate: new Date("2026-01-15"),
        startDateTime: new Date("2026-01-15"),
        totalAmount: 250,
        cost: 250,
        type: "repair",
        taxRate: 25,
        taxInclusive: false,
        manuallyPaid: false,
        payments: [],
        partItems: [{ unitCost: 50, quantity: 1, total: 100 }], // net
        laborItems: [{ total: 100 }], // net
      },
    ] as any);

    const result = await getRevenueReport({});

    expect(result.success).toBe(true);
    expect(result.data?.summary.totalPartsRevenue).toBeCloseTo(100);
    expect(result.data?.summary.totalLaborRevenue).toBeCloseTo(100);
    // Net profit = (parts net 100 - cost 50) + labor net 100 = 150
    expect(result.data?.summary.netProfit).toBeCloseTo(150);
  });

  it("back-calculates net parts/labor revenue for an inclusive record", async () => {
    setupAuth();
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
      {
        serviceDate: new Date("2026-01-15"),
        startDateTime: new Date("2026-01-15"),
        totalAmount: 250, // gross customer total (same as exclusive case above)
        cost: 250,
        type: "repair",
        taxRate: 25,
        taxInclusive: true,
        manuallyPaid: false,
        payments: [],
        partItems: [{ unitCost: 50, quantity: 1, total: 125 }], // gross — was 100 net
        laborItems: [{ total: 125 }], // gross — was 100 net
      },
    ] as any);

    const result = await getRevenueReport({});

    expect(result.success).toBe(true);
    // Net values back-calculated: 125 / 1.25 = 100
    expect(result.data?.summary.totalPartsRevenue).toBeCloseTo(100);
    expect(result.data?.summary.totalLaborRevenue).toBeCloseTo(100);
    // Net profit = (parts net 100 - cost 50) + labor net 100 = 150 (SAME as exclusive)
    expect(result.data?.summary.netProfit).toBeCloseTo(150);
  });

  it("the same logical revenue produces identical netProfit in both modes", async () => {
    setupAuth();
    // Exclusive: 100 net parts + 50 parts cost + 200 net labor = 250 net + 25% tax
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
      {
        serviceDate: new Date("2026-01-15"),
        startDateTime: new Date("2026-01-15"),
        totalAmount: 312.5,
        cost: 312.5,
        type: "repair",
        taxRate: 25,
        taxInclusive: false,
        manuallyPaid: false,
        payments: [],
        partItems: [{ unitCost: 50, quantity: 1, total: 100 }],
        laborItems: [{ total: 200 }],
      },
    ] as any);
    const exclusive = await getRevenueReport({});

    // Inclusive equivalent: line items scaled by 1.25
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
      {
        serviceDate: new Date("2026-01-15"),
        startDateTime: new Date("2026-01-15"),
        totalAmount: 312.5,
        cost: 312.5,
        type: "repair",
        taxRate: 25,
        taxInclusive: true,
        manuallyPaid: false,
        payments: [],
        partItems: [{ unitCost: 50, quantity: 1, total: 125 }],
        laborItems: [{ total: 250 }],
      },
    ] as any);
    const inclusive = await getRevenueReport({});

    expect(exclusive.data?.summary.netProfit).toBeCloseTo(inclusive.data!.summary.netProfit);
    expect(exclusive.data?.summary.totalPartsRevenue).toBeCloseTo(inclusive.data!.summary.totalPartsRevenue);
    expect(exclusive.data?.summary.totalLaborRevenue).toBeCloseTo(inclusive.data!.summary.totalLaborRevenue);
  });
});

// ---------------------------------------------------------------------------
// getTaxReport
// ---------------------------------------------------------------------------

describe("getTaxReport — taxableAmount formula", () => {
  it("uses (totalAmount - taxAmount) as the taxable base in exclusive mode", async () => {
    setupAuth();
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
      {
        serviceDate: new Date("2026-02-10"),
        startDateTime: new Date("2026-02-10"),
        subtotal: 200,
        taxRate: 25,
        taxAmount: 45,
        taxInclusive: false,
        totalAmount: 225, // 180 net + 45 tax
      },
    ] as any);

    const result = await getTaxReport({});

    expect(result.success).toBe(true);
    expect(result.data?.summary.totalTaxCollected).toBeCloseTo(45);
    // Net taxable = 225 - 45 = 180. NOT the raw subtotal of 200 (pre-discount).
    expect(result.data?.summary.totalTaxableAmount).toBeCloseTo(180);
  });

  it("uses (totalAmount - taxAmount) as the taxable base in inclusive mode", async () => {
    setupAuth();
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
      {
        serviceDate: new Date("2026-02-10"),
        startDateTime: new Date("2026-02-10"),
        subtotal: 225, // gross
        taxRate: 25,
        taxAmount: 45,
        taxInclusive: true,
        totalAmount: 225, // gross customer total
      },
    ] as any);

    const result = await getTaxReport({});

    expect(result.success).toBe(true);
    expect(result.data?.summary.totalTaxCollected).toBeCloseTo(45);
    // Net taxable = 225 - 45 = 180 (same as exclusive equivalent)
    expect(result.data?.summary.totalTaxableAmount).toBeCloseTo(180);
  });

  it("aggregates tax across mixed-mode records correctly", async () => {
    setupAuth();
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
      // Exclusive: 100 net + 25 tax = 125 total
      {
        serviceDate: new Date("2026-02-01"),
        startDateTime: new Date("2026-02-01"),
        subtotal: 100,
        taxRate: 25,
        taxAmount: 25,
        taxInclusive: false,
        totalAmount: 125,
      },
      // Inclusive: 125 gross = 100 net + 25 tax
      {
        serviceDate: new Date("2026-02-15"),
        startDateTime: new Date("2026-02-15"),
        subtotal: 125,
        taxRate: 25,
        taxAmount: 25,
        taxInclusive: true,
        totalAmount: 125,
      },
    ] as any);

    const result = await getTaxReport({});

    expect(result.data?.summary.totalTaxCollected).toBeCloseTo(50);
    expect(result.data?.summary.totalTaxableAmount).toBeCloseTo(200); // 100 + 100
    expect(result.data?.summary.totalInvoices).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getPartsUsageReport
// ---------------------------------------------------------------------------

describe("getPartsUsageReport — per-line net calculation", () => {
  it("uses net per-line totals so profit math is consistent for inclusive records", async () => {
    setupAuth();
    vi.mocked(db.servicePart.findMany).mockResolvedValue([
      {
        name: "Brake Pad",
        partNumber: "BP-001",
        quantity: 2,
        total: 250, // gross — 200 net at 25%
        unitCost: 50,
        serviceRecord: { taxRate: 25, taxInclusive: true },
      },
    ] as any);

    const result = await getPartsUsageReport({});

    expect(result.success).toBe(true);
    expect(result.data?.totalPartsRevenue).toBeCloseTo(200); // 250 / 1.25
    expect(result.data?.totalPartsCost).toBeCloseTo(100); // 50 * 2
    expect(result.data?.totalPartsNetProfit).toBeCloseTo(100); // 200 - 100
  });

  it("uses raw per-line totals for exclusive records (no scaling)", async () => {
    setupAuth();
    vi.mocked(db.servicePart.findMany).mockResolvedValue([
      {
        name: "Brake Pad",
        partNumber: "BP-001",
        quantity: 2,
        total: 200, // already net
        unitCost: 50,
        serviceRecord: { taxRate: 25, taxInclusive: false },
      },
    ] as any);

    const result = await getPartsUsageReport({});

    expect(result.data?.totalPartsRevenue).toBeCloseTo(200);
    expect(result.data?.totalPartsCost).toBeCloseTo(100);
    expect(result.data?.totalPartsNetProfit).toBeCloseTo(100);
  });
});

// ---------------------------------------------------------------------------
// getVehicleReport
// ---------------------------------------------------------------------------

describe("getVehicleReport — net labor in monthly cost", () => {
  it("nets the labor cost in inclusive records so monthly breakdown is consistent", async () => {
    setupAuth();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({
      id: "veh-1",
      year: 2022,
      make: "Toyota",
      model: "Camry",
      vin: "X",
      licensePlate: "Y",
      mileage: 50000,
      customer: { name: "John" },
    } as any);
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
      {
        id: "sr-1",
        title: "Oil change",
        type: "maintenance",
        status: "completed",
        serviceDate: new Date("2026-03-10"),
        startDateTime: new Date("2026-03-10"),
        totalAmount: 250,
        cost: 250,
        taxRate: 25,
        taxInclusive: true,
        techName: "Tech",
        technician: null,
        partItems: [{ name: "Filter", partNumber: "F1", quantity: 1, unitCost: 50, total: 125 }],
        laborItems: [{ hours: 1, total: 125 }], // gross
      },
    ] as any);

    const result = await getVehicleReport({ vehicleId: "veh-1" });

    expect(result.success).toBe(true);
    // Monthly labor cost should be NET (125 / 1.25 = 100), not gross 125.
    expect(result.data?.monthlyCosts[0].laborCost).toBeCloseTo(100);
  });
});
