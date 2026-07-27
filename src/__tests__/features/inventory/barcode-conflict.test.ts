/**
 * Tests for duplicate-barcode detection and the message the user actually sees.
 *
 * This exists because the detection broke silently once. The original check
 * read `meta.target`, which is populated by classic Prisma but left undefined
 * by Prisma 7 with the pg driver adapter — so a duplicate barcode fell through
 * and surfaced a raw "Unique constraint failed on the fields: (...)" instead of
 * a usable message. Nothing failed loudly; the error was simply worse.
 *
 * The error shapes below are captured verbatim from real Prisma failures, so a
 * future client upgrade that moves the field again fails here rather than in
 * front of a user.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { inventoryPart: { findFirst: vi.fn() } },
}));

import { db } from "@/lib/db";
import {
  normalizeBarcode,
  uniqueViolationFields,
  withBarcodeConflictMessage,
} from "@/features/inventory/Lib/barcode";

const ORG = "org-1";

/** Prisma 7 + @prisma/adapter-pg. `meta.target` is absent here. */
const driverAdapterError = {
  name: "PrismaClientKnownRequestError",
  code: "P2002",
  meta: {
    modelName: "InventoryPart",
    driverAdapterError: {
      name: "DriverAdapterError",
      cause: {
        originalCode: "23505",
        originalMessage:
          'duplicate key value violates unique constraint "inventory_parts_organizationId_barcode_key"',
        kind: "UniqueConstraintViolation",
        constraint: { fields: ['"organizationId"', "barcode"] },
      },
    },
  },
};

/** Classic Prisma shape, still supported. */
const classicError = {
  name: "PrismaClientKnownRequestError",
  code: "P2002",
  meta: { target: ["organizationId", "barcode"] },
};

describe("normalizeBarcode", () => {
  it("trims and upper-cases so scans and typed input agree", () => {
    expect(normalizeBarcode("  abc-1 ")).toBe("ABC-1");
    expect(normalizeBarcode("AbC-1")).toBe("ABC-1");
  });

  it("treats blank input as no barcode", () => {
    expect(normalizeBarcode("")).toBeNull();
    expect(normalizeBarcode("   ")).toBeNull();
    expect(normalizeBarcode(null)).toBeNull();
    expect(normalizeBarcode(undefined)).toBeNull();
  });
});

describe("uniqueViolationFields", () => {
  it("finds the columns in the driver-adapter shape", () => {
    expect(uniqueViolationFields(driverAdapterError)).toContain("barcode");
  });

  it("finds the columns in the classic shape", () => {
    expect(uniqueViolationFields(classicError)).toContain("barcode");
  });

  it("ignores errors that are not unique violations", () => {
    expect(uniqueViolationFields({ code: "P2025", meta: {} })).toBe("");
  });

  it("ignores non-errors", () => {
    expect(uniqueViolationFields(null)).toBe("");
    expect(uniqueViolationFields("boom")).toBe("");
  });

  it("does not claim a violation on an unrelated unique constraint", () => {
    const other = {
      code: "P2002",
      meta: { target: ["organizationId", "key"] },
    };
    expect(uniqueViolationFields(other)).not.toContain("barcode");
  });
});

describe("withBarcodeConflictMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the result through when nothing conflicts", async () => {
    const result = await withBarcodeConflictMessage(ORG, "ABC-1", async () => "created");
    expect(result).toBe("created");
    expect(db.inventoryPart.findFirst).not.toHaveBeenCalled();
  });

  it("names the conflicting part (driver-adapter shape)", async () => {
    vi.mocked(db.inventoryPart.findFirst).mockResolvedValue({
      name: "Brake pad",
      partNumber: "BP-1",
    } as never);

    await expect(
      withBarcodeConflictMessage(ORG, "ABC-1", async () => {
        throw driverAdapterError;
      }),
    ).rejects.toThrow("Barcode ABC-1 is already used by Brake pad (BP-1).");
  });

  it("names the conflicting part (classic shape)", async () => {
    vi.mocked(db.inventoryPart.findFirst).mockResolvedValue({
      name: "Brake pad",
      partNumber: null,
    } as never);

    await expect(
      withBarcodeConflictMessage(ORG, "ABC-1", async () => {
        throw classicError;
      }),
    ).rejects.toThrow("Barcode ABC-1 is already used by Brake pad.");
  });

  it("still explains the collision when the other part cannot be found", async () => {
    vi.mocked(db.inventoryPart.findFirst).mockResolvedValue(null as never);

    await expect(
      withBarcodeConflictMessage(ORG, "ABC-1", async () => {
        throw driverAdapterError;
      }),
    ).rejects.toThrow("Barcode ABC-1 is already used by another part.");
  });

  it("never swallows an unrelated error", async () => {
    const other = new Error("connection reset");
    await expect(
      withBarcodeConflictMessage(ORG, "ABC-1", async () => {
        throw other;
      }),
    ).rejects.toThrow("connection reset");
  });

  it("does not rewrite a unique violation on a different column", async () => {
    await expect(
      withBarcodeConflictMessage(ORG, "ABC-1", async () => {
        throw { code: "P2002", meta: { target: ["organizationId", "key"] } };
      }),
    ).rejects.not.toThrow(/Barcode/);
  });
});
