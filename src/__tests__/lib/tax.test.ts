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
