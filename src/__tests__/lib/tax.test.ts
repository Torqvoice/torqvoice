import { describe, it, expect } from "vitest";
import { calculateTotals, netLineTotal } from "@/lib/tax";

describe("calculateTotals", () => {
  describe("exclusive mode", () => {
    it("adds tax on top of subtotal", () => {
      const r = calculateTotals({
        subtotal: 100,
        discountAmount: 0,
        taxRate: 10,
        taxInclusive: false,
      });
      expect(r.taxAmount).toBeCloseTo(10);
      expect(r.totalAmount).toBeCloseTo(110);
    });

    it("applies discount before tax", () => {
      const r = calculateTotals({
        subtotal: 100,
        discountAmount: 20,
        taxRate: 10,
        taxInclusive: false,
      });
      // base = 80, tax = 8, total = 88
      expect(r.taxAmount).toBeCloseTo(8);
      expect(r.totalAmount).toBeCloseTo(88);
    });

    it("returns zero tax when rate is zero", () => {
      const r = calculateTotals({
        subtotal: 100,
        discountAmount: 0,
        taxRate: 0,
        taxInclusive: false,
      });
      expect(r.taxAmount).toBe(0);
      expect(r.totalAmount).toBe(100);
    });
  });

  describe("inclusive mode", () => {
    it("reverse-calculates the net from a gross subtotal", () => {
      const r = calculateTotals({
        subtotal: 110,
        discountAmount: 0,
        taxRate: 10,
        taxInclusive: true,
      });
      // gross = 110, net = 100, tax = 10
      expect(r.taxAmount).toBeCloseTo(10);
      expect(r.totalAmount).toBeCloseTo(110);
    });

    it("totalAmount equals gross subtotal minus discount in inclusive mode", () => {
      const r = calculateTotals({
        subtotal: 110,
        discountAmount: 11,
        taxRate: 10,
        taxInclusive: true,
      });
      // base (gross after discount) = 99, net = 90, tax = 9, total = 99
      expect(r.taxAmount).toBeCloseTo(9);
      expect(r.totalAmount).toBeCloseTo(99);
    });

    it("returns zero tax when rate is zero (inclusive)", () => {
      const r = calculateTotals({
        subtotal: 100,
        discountAmount: 0,
        taxRate: 0,
        taxInclusive: true,
      });
      expect(r.taxAmount).toBe(0);
      expect(r.totalAmount).toBe(100);
    });

    it("handles 25% VAT correctly (Norwegian rate)", () => {
      // 125 gross with 25% VAT → 100 net + 25 tax
      const r = calculateTotals({
        subtotal: 125,
        discountAmount: 0,
        taxRate: 25,
        taxInclusive: true,
      });
      expect(r.taxAmount).toBeCloseTo(25);
      expect(r.totalAmount).toBeCloseTo(125);
    });
  });

  describe("edge cases", () => {
    it("clamps base at zero when discount exceeds subtotal", () => {
      const r = calculateTotals({
        subtotal: 50,
        discountAmount: 100,
        taxRate: 10,
        taxInclusive: false,
      });
      expect(r.taxAmount).toBe(0);
      expect(r.totalAmount).toBe(0);
    });

    it("inclusive mode with discount: total equals gross-after-discount", () => {
      // 2 line items at $50 gross each, $10 gross discount, 10% tax
      const r = calculateTotals({
        subtotal: 100,
        discountAmount: 10,
        taxRate: 10,
        taxInclusive: true,
      });
      // base (gross after discount) = 90, net = 81.82, tax = 8.18, total = 90
      expect(r.totalAmount).toBeCloseTo(90);
      expect(r.taxAmount).toBeCloseTo(8.1818, 3);
    });

    it("net base equals totalAmount - taxAmount in both modes", () => {
      const exclusive = calculateTotals({
        subtotal: 200,
        discountAmount: 20,
        taxRate: 25,
        taxInclusive: false,
      });
      const inclusive = calculateTotals({
        subtotal: 225,
        discountAmount: 25,
        taxRate: 25,
        taxInclusive: true,
      });
      // The "taxable base" formula used by the tax report:
      const exclusiveBase = exclusive.totalAmount - exclusive.taxAmount;
      const inclusiveBase = inclusive.totalAmount - inclusive.taxAmount;
      expect(exclusiveBase).toBeCloseTo(180); // 200 - 20
      expect(inclusiveBase).toBeCloseTo(160); // (225 - 25) / 1.25
    });
  });
});

describe("convert exclusive → inclusive (round-trip)", () => {
  // The convertRecordsToInclusive backfill scales line items by (1 + rate/100).
  // After scaling, calculateTotals in inclusive mode must produce the SAME
  // taxAmount and totalAmount that the original exclusive calculation produced
  // — i.e. the customer-facing total is preserved.

  it("preserves totals for an exclusive record with no discount", () => {
    const taxRate = 25;
    const exclusive = calculateTotals({
      subtotal: 100,
      discountAmount: 0,
      taxRate,
      taxInclusive: false,
    });
    // Apply the conversion: scale subtotal by (1 + rate/100)
    const factor = 1 + taxRate / 100;
    const inclusive = calculateTotals({
      subtotal: 100 * factor,
      discountAmount: 0,
      taxRate,
      taxInclusive: true,
    });
    expect(inclusive.taxAmount).toBeCloseTo(exclusive.taxAmount);
    expect(inclusive.totalAmount).toBeCloseTo(exclusive.totalAmount);
  });

  it("preserves totals when converting a record with a fixed discount", () => {
    const taxRate = 10;
    const exclusive = calculateTotals({
      subtotal: 100,
      discountAmount: 20,
      taxRate,
      taxInclusive: false,
    });
    // Both subtotal AND fixed discountAmount must scale to preserve the math
    const factor = 1 + taxRate / 100;
    const inclusive = calculateTotals({
      subtotal: 100 * factor,
      discountAmount: 20 * factor,
      taxRate,
      taxInclusive: true,
    });
    expect(inclusive.taxAmount).toBeCloseTo(exclusive.taxAmount);
    expect(inclusive.totalAmount).toBeCloseTo(exclusive.totalAmount);
  });

  it("preserves totals for a percentage-discount record", () => {
    const taxRate = 25;
    // 10% discount: discountAmount = subtotal * 0.10
    const exclusive = calculateTotals({
      subtotal: 200,
      discountAmount: 20,
      taxRate,
      taxInclusive: false,
    });
    // Both scale by the same factor; percentage stays the same so the
    // resulting discountAmount = (200 * factor) * 0.10 = 20 * factor.
    const factor = 1 + taxRate / 100;
    const inclusive = calculateTotals({
      subtotal: 200 * factor,
      discountAmount: 20 * factor,
      taxRate,
      taxInclusive: true,
    });
    expect(inclusive.taxAmount).toBeCloseTo(exclusive.taxAmount);
    expect(inclusive.totalAmount).toBeCloseTo(exclusive.totalAmount);
  });

  it("handles taxRate=0 (factor=1, no scaling needed)", () => {
    const exclusive = calculateTotals({
      subtotal: 100,
      discountAmount: 0,
      taxRate: 0,
      taxInclusive: false,
    });
    const inclusive = calculateTotals({
      subtotal: 100, // factor = 1
      discountAmount: 0,
      taxRate: 0,
      taxInclusive: true,
    });
    expect(inclusive.taxAmount).toBe(exclusive.taxAmount);
    expect(inclusive.totalAmount).toBe(exclusive.totalAmount);
  });
});

describe("convert inclusive → exclusive (round-trip)", () => {
  // The convertRecordsToExclusive backfill divides line items by (1 + rate/100).
  // After scaling, calculateTotals in exclusive mode must produce the SAME
  // taxAmount and totalAmount the original inclusive record had.

  it("preserves totals for an inclusive record with no discount", () => {
    const taxRate = 25;
    const inclusive = calculateTotals({
      subtotal: 125,
      discountAmount: 0,
      taxRate,
      taxInclusive: true,
    });
    const factor = 1 + taxRate / 100;
    const exclusive = calculateTotals({
      subtotal: 125 / factor,
      discountAmount: 0,
      taxRate,
      taxInclusive: false,
    });
    expect(exclusive.taxAmount).toBeCloseTo(inclusive.taxAmount);
    expect(exclusive.totalAmount).toBeCloseTo(inclusive.totalAmount);
  });

  it("preserves totals when converting an inclusive record with a fixed discount back to exclusive", () => {
    const taxRate = 10;
    const inclusive = calculateTotals({
      subtotal: 110,
      discountAmount: 22,
      taxRate,
      taxInclusive: true,
    });
    const factor = 1 + taxRate / 100;
    const exclusive = calculateTotals({
      subtotal: 110 / factor,
      discountAmount: 22 / factor,
      taxRate,
      taxInclusive: false,
    });
    expect(exclusive.taxAmount).toBeCloseTo(inclusive.taxAmount);
    expect(exclusive.totalAmount).toBeCloseTo(inclusive.totalAmount);
  });

  it("preserves totals for an inclusive record with a percentage discount", () => {
    const taxRate = 25;
    // Inclusive 10% discount on 200 gross subtotal
    const inclusive = calculateTotals({
      subtotal: 200,
      discountAmount: 20,
      taxRate,
      taxInclusive: true,
    });
    const factor = 1 + taxRate / 100;
    const exclusive = calculateTotals({
      subtotal: 200 / factor,
      discountAmount: 20 / factor,
      taxRate,
      taxInclusive: false,
    });
    expect(exclusive.taxAmount).toBeCloseTo(inclusive.taxAmount);
    expect(exclusive.totalAmount).toBeCloseTo(inclusive.totalAmount);
  });
});

describe("netLineTotal", () => {
  it("returns the line total unchanged for exclusive mode", () => {
    expect(netLineTotal(100, 10, false)).toBe(100);
    expect(netLineTotal(100, 25, false)).toBe(100);
  });

  it("returns the line total unchanged when tax rate is zero", () => {
    expect(netLineTotal(100, 0, true)).toBe(100);
  });

  it("backs out tax for inclusive mode with positive rate", () => {
    expect(netLineTotal(110, 10, true)).toBeCloseTo(100);
    expect(netLineTotal(125, 25, true)).toBeCloseTo(100);
  });

  it("inclusive net + tax matches the original gross", () => {
    const gross = 125;
    const rate = 25;
    const net = netLineTotal(gross, rate, true);
    const tax = gross - net;
    expect(net + tax).toBeCloseTo(gross);
    expect(net).toBeCloseTo(100);
    expect(tax).toBeCloseTo(25);
  });
});

// ---------------------------------------------------------------------------
// Universal display formula — used by all PDFs/share views/invoice summary.
// The display always shows: net subtotal + net discount + tax + gross total,
// regardless of whether the record was entered in inclusive or exclusive mode.
// These tests prove the same formulas balance for both modes and locked their
// behaviour against future regressions.
// ---------------------------------------------------------------------------
describe("universal invoice display formulas", () => {
  function buildDisplay(args: {
    subtotal: number;
    discountAmount: number;
    taxRate: number;
    taxInclusive: boolean;
  }) {
    const { subtotal, discountAmount, taxRate, taxInclusive } = args;
    const { taxAmount, totalAmount } = calculateTotals(args);
    return {
      // Per-line and category subtotals are netted for display:
      displaySubtotal: netLineTotal(subtotal, taxRate, taxInclusive),
      displayDiscount: netLineTotal(discountAmount, taxRate, taxInclusive),
      // Tax and total come straight from stored values (always correct).
      displayTax: taxAmount,
      displayTotal: totalAmount,
    };
  }

  it("exclusive mode: simple invoice", () => {
    const d = buildDisplay({ subtotal: 100, discountAmount: 0, taxRate: 25, taxInclusive: false });
    expect(d.displaySubtotal).toBeCloseTo(100);
    expect(d.displayDiscount).toBeCloseTo(0);
    expect(d.displayTax).toBeCloseTo(25);
    expect(d.displayTotal).toBeCloseTo(125);
    // The display equation must balance.
    expect(d.displaySubtotal - d.displayDiscount + d.displayTax).toBeCloseTo(d.displayTotal);
  });

  it("inclusive mode: simple invoice — net per-line is back-calculated", () => {
    // User typed 125 (gross), inclusive 25%
    const d = buildDisplay({ subtotal: 125, discountAmount: 0, taxRate: 25, taxInclusive: true });
    expect(d.displaySubtotal).toBeCloseTo(100); // back-calculated net
    expect(d.displayDiscount).toBeCloseTo(0);
    expect(d.displayTax).toBeCloseTo(25);
    expect(d.displayTotal).toBeCloseTo(125);
    expect(d.displaySubtotal - d.displayDiscount + d.displayTax).toBeCloseTo(d.displayTotal);
  });

  it("exclusive mode: with fixed discount", () => {
    const d = buildDisplay({ subtotal: 200, discountAmount: 20, taxRate: 25, taxInclusive: false });
    // base = 180, tax = 45, total = 225
    expect(d.displaySubtotal).toBeCloseTo(200);
    expect(d.displayDiscount).toBeCloseTo(20);
    expect(d.displayTax).toBeCloseTo(45);
    expect(d.displayTotal).toBeCloseTo(225);
    expect(d.displaySubtotal - d.displayDiscount + d.displayTax).toBeCloseTo(d.displayTotal);
  });

  it("inclusive mode: with fixed discount — discount is also back-calculated", () => {
    // User typed 250 gross subtotal, 25 gross discount, inclusive 25%
    // base = 225 gross, net = 180, tax = 45, total = 225
    const d = buildDisplay({ subtotal: 250, discountAmount: 25, taxRate: 25, taxInclusive: true });
    expect(d.displaySubtotal).toBeCloseTo(200); // 250 / 1.25
    expect(d.displayDiscount).toBeCloseTo(20); // 25 / 1.25
    expect(d.displayTax).toBeCloseTo(45);
    expect(d.displayTotal).toBeCloseTo(225);
    expect(d.displaySubtotal - d.displayDiscount + d.displayTax).toBeCloseTo(d.displayTotal);
  });

  it("inclusive mode: 0% tax — display equals stored values", () => {
    const d = buildDisplay({ subtotal: 100, discountAmount: 10, taxRate: 0, taxInclusive: true });
    expect(d.displaySubtotal).toBeCloseTo(100);
    expect(d.displayDiscount).toBeCloseTo(10);
    expect(d.displayTax).toBe(0);
    expect(d.displayTotal).toBeCloseTo(90);
  });

  it("Norwegian VAT (25%) inclusive — exact 180 round-trip", () => {
    // The user's reported case: typed 180 → conversion stored 225 inclusive
    // The universal display should show 180 again on the invoice.
    const d = buildDisplay({ subtotal: 225, discountAmount: 0, taxRate: 25, taxInclusive: true });
    expect(d.displaySubtotal).toBeCloseTo(180);
    expect(d.displayTax).toBeCloseTo(45);
    expect(d.displayTotal).toBeCloseTo(225);
  });

  it("German VAT (19%) inclusive with discount", () => {
    // Subtotal 119 gross, 11.90 gross discount, inclusive 19%
    // base = 107.10, net = 90, tax = 17.10, total = 107.10
    const d = buildDisplay({ subtotal: 119, discountAmount: 11.9, taxRate: 19, taxInclusive: true });
    expect(d.displaySubtotal).toBeCloseTo(100);
    expect(d.displayDiscount).toBeCloseTo(10);
    expect(d.displayTax).toBeCloseTo(17.1);
    expect(d.displayTotal).toBeCloseTo(107.1);
    expect(d.displaySubtotal - d.displayDiscount + d.displayTax).toBeCloseTo(d.displayTotal);
  });

  it("US sales tax (8.25%) exclusive — unchanged behaviour", () => {
    const d = buildDisplay({ subtotal: 1000, discountAmount: 0, taxRate: 8.25, taxInclusive: false });
    expect(d.displaySubtotal).toBeCloseTo(1000);
    expect(d.displayTax).toBeCloseTo(82.5);
    expect(d.displayTotal).toBeCloseTo(1082.5);
  });

  it("the same logical invoice produces identical display in both modes", () => {
    // An exclusive record with subtotal=1000, no discount, 25% tax
    // is logically equivalent to an inclusive record with subtotal=1250.
    // The universal display must produce the same numbers for both.
    const exclusive = buildDisplay({ subtotal: 1000, discountAmount: 0, taxRate: 25, taxInclusive: false });
    const inclusive = buildDisplay({ subtotal: 1250, discountAmount: 0, taxRate: 25, taxInclusive: true });
    expect(exclusive.displaySubtotal).toBeCloseTo(inclusive.displaySubtotal);
    expect(exclusive.displayTax).toBeCloseTo(inclusive.displayTax);
    expect(exclusive.displayTotal).toBeCloseTo(inclusive.displayTotal);
  });

  it("equivalent records with discount produce identical display in both modes", () => {
    // Exclusive: 200 net subtotal, 20 net discount, 25% tax
    // Inclusive equivalent: 250 gross subtotal, 25 gross discount, 25% tax
    const exclusive = buildDisplay({ subtotal: 200, discountAmount: 20, taxRate: 25, taxInclusive: false });
    const inclusive = buildDisplay({ subtotal: 250, discountAmount: 25, taxRate: 25, taxInclusive: true });
    expect(exclusive.displaySubtotal).toBeCloseTo(inclusive.displaySubtotal);
    expect(exclusive.displayDiscount).toBeCloseTo(inclusive.displayDiscount);
    expect(exclusive.displayTax).toBeCloseTo(inclusive.displayTax);
    expect(exclusive.displayTotal).toBeCloseTo(inclusive.displayTotal);
  });
});
