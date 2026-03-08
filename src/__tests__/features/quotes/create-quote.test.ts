/**
 * Tests for createQuote server action.
 *
 * Covers:
 * - Quote number generation with prefix
 * - Labor items from inspection are persisted
 * - InspectionId linkage
 * - Vehicle and customer association
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cached-session", () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/invoice-utils", () => ({
  resolveInvoicePrefix: vi.fn((p: string) => p),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
    quote: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";
import { createQuote } from "@/features/quotes/Actions/quoteActions";

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

function setupQuoteCreation() {
  vi.mocked(db.appSetting.findMany).mockResolvedValue([]);
  vi.mocked(db.quote.findFirst).mockResolvedValue(null); // no previous quotes
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Quote number generation
// ---------------------------------------------------------------------------

describe("createQuote — quote number generation", () => {
  it("generates QT-1001 when no previous quotes exist", async () => {
    setupAuth();
    setupQuoteCreation();

    const mockCreate = vi.fn().mockResolvedValue({ id: "q-1", quoteNumber: "QT-1001" });
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        quote: { create: mockCreate },
        quotePart: { createMany: vi.fn() },
        quoteLabor: { createMany: vi.fn() },
      })
    );

    const result = await createQuote({
      title: "Test Quote",
      status: "draft",
      subtotal: 0,
      taxRate: 0,
      taxAmount: 0,
      discountValue: 0,
      discountAmount: 0,
      totalAmount: 0,
    });

    expect(result.success).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quoteNumber: "QT-1001" }),
      })
    );
  });

  it("increments quote number from the last existing quote", async () => {
    setupAuth();
    vi.mocked(db.appSetting.findMany).mockResolvedValue([]);
    vi.mocked(db.quote.findFirst).mockResolvedValue({ quoteNumber: "QT-1005" } as any);

    const mockCreate = vi.fn().mockResolvedValue({ id: "q-2", quoteNumber: "QT-1006" });
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        quote: { create: mockCreate },
        quotePart: { createMany: vi.fn() },
        quoteLabor: { createMany: vi.fn() },
      })
    );

    await createQuote({
      title: "Test Quote",
      status: "draft",
      subtotal: 0,
      taxRate: 0,
      taxAmount: 0,
      discountValue: 0,
      discountAmount: 0,
      totalAmount: 0,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quoteNumber: "QT-1006" }),
      })
    );
  });

  it("uses custom prefix from settings", async () => {
    setupAuth();
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: "workshop.quotePrefix", value: "QUOTE-" } as any,
    ]);
    vi.mocked(db.quote.findFirst).mockResolvedValue(null);

    const mockCreate = vi.fn().mockResolvedValue({ id: "q-3" });
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        quote: { create: mockCreate },
        quotePart: { createMany: vi.fn() },
        quoteLabor: { createMany: vi.fn() },
      })
    );

    await createQuote({
      title: "Test",
      status: "draft",
      subtotal: 0,
      taxRate: 0,
      taxAmount: 0,
      discountValue: 0,
      discountAmount: 0,
      totalAmount: 0,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quoteNumber: "QUOTE-1001" }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Creating quote from inspection (the new flow)
// ---------------------------------------------------------------------------

describe("createQuote — from inspection", () => {
  it("links quote to inspectionId, vehicleId, and customerId", async () => {
    setupAuth();
    setupQuoteCreation();

    const mockCreate = vi.fn().mockResolvedValue({ id: "q-insp" });
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        quote: { create: mockCreate },
        quotePart: { createMany: vi.fn() },
        quoteLabor: { createMany: vi.fn() },
      })
    );

    await createQuote({
      title: "2024 Toyota Camry - Inspection Quote",
      vehicleId: "veh-1",
      customerId: "cust-1",
      inspectionId: "insp-1",
      status: "draft",
      subtotal: 0,
      taxRate: 0,
      taxAmount: 0,
      discountValue: 0,
      discountAmount: 0,
      totalAmount: 0,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: "veh-1",
          customerId: "cust-1",
          inspectionId: "insp-1",
          organizationId: ORG,
          userId: USER_ID,
        }),
      })
    );
  });

  it("creates labor items from inspection fail/attention items", async () => {
    setupAuth();
    setupQuoteCreation();

    const mockCreate = vi.fn().mockResolvedValue({ id: "q-labor" });
    const mockLaborCreateMany = vi.fn();
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        quote: { create: mockCreate },
        quotePart: { createMany: vi.fn() },
        quoteLabor: { createMany: mockLaborCreateMany },
      })
    );

    await createQuote({
      title: "Inspection Quote",
      inspectionId: "insp-1",
      status: "draft",
      laborItems: [
        { description: "Front brake pads - Worn below 2mm", hours: 0, rate: 0, total: 0 },
        { description: "Tire alignment - Pulling left", hours: 0, rate: 0, total: 0 },
      ],
      subtotal: 0,
      taxRate: 0,
      taxAmount: 0,
      discountValue: 0,
      discountAmount: 0,
      totalAmount: 0,
    });

    expect(mockLaborCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ description: "Front brake pads - Worn below 2mm", quoteId: "q-labor" }),
          expect.objectContaining({ description: "Tire alignment - Pulling left", quoteId: "q-labor" }),
        ]),
      })
    );
  });

  it("creates quote without labor items when none provided", async () => {
    setupAuth();
    setupQuoteCreation();

    const mockCreate = vi.fn().mockResolvedValue({ id: "q-no-labor" });
    const mockLaborCreateMany = vi.fn();
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        quote: { create: mockCreate },
        quotePart: { createMany: vi.fn() },
        quoteLabor: { createMany: mockLaborCreateMany },
      })
    );

    await createQuote({
      title: "Simple Quote",
      status: "draft",
      subtotal: 0,
      taxRate: 0,
      taxAmount: 0,
      discountValue: 0,
      discountAmount: 0,
      totalAmount: 0,
    });

    // laborCreateMany should not be called when no labor items
    expect(mockLaborCreateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Org scoping
// ---------------------------------------------------------------------------

describe("createQuote — org scoping", () => {
  it("always sets organizationId from auth context, not from input", async () => {
    setupAuth();
    setupQuoteCreation();

    const mockCreate = vi.fn().mockResolvedValue({ id: "q-org" });
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        quote: { create: mockCreate },
        quotePart: { createMany: vi.fn() },
        quoteLabor: { createMany: vi.fn() },
      })
    );

    await createQuote({
      title: "Test",
      status: "draft",
      subtotal: 0,
      taxRate: 0,
      taxAmount: 0,
      discountValue: 0,
      discountAmount: 0,
      totalAmount: 0,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: ORG }),
      })
    );
  });
});
