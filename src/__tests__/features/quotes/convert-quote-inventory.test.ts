/**
 * Tests for convertQuoteToServiceRecord — the point at which a quote's parts
 * become real consumption.
 *
 * A quote is only an estimate, so it never moves stock. Converting it to a job
 * is the moment the parts leave the shelf, so the conversion must:
 *   - carry each line's `inventoryPartId` onto the resulting ServicePart, and
 *   - deduct stock exactly once, inside the same transaction.
 *
 * Before this was wired up, converting a quote created the job but left
 * inventory untouched, so stock silently never went down for any workshop that
 * quoted first.
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
    vehicle: { findFirst: vi.fn() },
    organization: { findUnique: vi.fn() },
    serviceRecord: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";
import { convertQuoteToServiceRecord } from "@/features/quotes/Actions/quoteActions";

const ORG = "org-1";
const USER_ID = "user-1";
const VEHICLE_ID = "veh-1";
const QUOTE_ID = "quote-1";

function setupAuth() {
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: USER_ID, email: "user@example.com" },
  } as any);
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: "owner",
    roleId: null,
    customRole: null,
  } as any);
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any);
}

/** Wire up a quote with the given part lines and capture what conversion does. */
function setupConversion(partItems: any[]) {
  vi.mocked(db.quote.findFirst).mockResolvedValue({
    id: QUOTE_ID,
    quoteNumber: "Q-1",
    title: "Brake job",
    description: null,
    subtotal: 100,
    taxRate: 0,
    taxAmount: 0,
    taxInclusive: false,
    totalAmount: 100,
    discountType: null,
    discountValue: 0,
    discountAmount: 0,
    partItems,
    laborItems: [],
    attachments: [],
  } as any);
  vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: VEHICLE_ID } as any);
  vi.mocked(db.appSetting.findMany).mockResolvedValue([] as any);
  vi.mocked(db.organization.findUnique).mockResolvedValue({ name: "Shop" } as any);
  vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null as any);

  const servicePartCreateMany = vi.fn().mockResolvedValue({ count: partItems.length });
  const stockMovementCreateMany = vi.fn().mockResolvedValue({ count: 1 });
  const queryRaw = vi.fn().mockResolvedValue([{ quantity: 7 }]);

  vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
    fn({
      serviceRecord: {
        create: vi.fn().mockResolvedValue({
          id: "sr-1",
          title: "Brake job",
          invoiceNumber: "1001",
          vehicleId: VEHICLE_ID,
        }),
      },
      servicePart: { createMany: servicePartCreateMany },
      serviceLabor: { createMany: vi.fn() },
      serviceAttachment: { createMany: vi.fn() },
      quote: { update: vi.fn() },
      stockMovement: { createMany: stockMovementCreateMany },
      $queryRaw: queryRaw,
    }),
  );

  return { servicePartCreateMany, stockMovementCreateMany, queryRaw };
}

describe("convertQuoteToServiceRecord — inventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth();
  });

  it("deducts stock for quote lines linked to inventory", async () => {
    const { queryRaw } = setupConversion([
      {
        name: "Brake pad",
        partNumber: "BP-1",
        quantity: 2,
        unitPrice: 50,
        total: 100,
        excluded: false,
        inventoryPartId: "inv-1",
      },
    ]);

    await convertQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [, decrement, partId, orgId] = queryRaw.mock.calls[0];
    expect(decrement).toBe(2);
    expect(partId).toBe("inv-1");
    expect(orgId).toBe(ORG);
  });

  it("carries inventoryPartId onto the created service parts", async () => {
    const { servicePartCreateMany } = setupConversion([
      {
        name: "Brake pad",
        partNumber: "BP-1",
        quantity: 2,
        unitPrice: 50,
        total: 100,
        excluded: false,
        inventoryPartId: "inv-1",
      },
    ]);

    await convertQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID);

    expect(servicePartCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ inventoryPartId: "inv-1", serviceRecordId: "sr-1" })],
    });
  });

  it("records the movement against the new job in the ledger", async () => {
    const { stockMovementCreateMany } = setupConversion([
      {
        name: "Brake pad",
        quantity: 2,
        unitPrice: 50,
        total: 100,
        excluded: false,
        inventoryPartId: "inv-1",
      },
    ]);

    await convertQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID);

    expect(stockMovementCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          inventoryPartId: "inv-1",
          organizationId: ORG,
          delta: -2,
          quantityAfter: 7,
          reason: "quote_conversion",
          serviceRecordId: "sr-1",
        }),
      ],
    });
  });

  it("leaves stock alone for free-text lines with no inventory link", async () => {
    const { queryRaw, stockMovementCreateMany } = setupConversion([
      {
        name: "Shop supplies",
        quantity: 1,
        unitPrice: 10,
        total: 10,
        excluded: false,
        inventoryPartId: null,
      },
    ]);

    await convertQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID);

    expect(queryRaw).not.toHaveBeenCalled();
    expect(stockMovementCreateMany).not.toHaveBeenCalled();
  });

  it("does not consume stock for lines excluded from the quote total", async () => {
    const { queryRaw } = setupConversion([
      {
        name: "Optional wiper",
        quantity: 3,
        unitPrice: 20,
        total: 60,
        excluded: true,
        inventoryPartId: "inv-9",
      },
    ]);

    await convertQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID);

    expect(queryRaw).not.toHaveBeenCalled();
  });
});
