/**
 * Tests for how a stocked part is priced onto a job or quote line.
 *
 * This exists because the rule was duplicated. The inventory picker had the
 * full fallback chain; the inline name suggestion used `sellPrice` directly,
 * so any part whose sell price had never been filled in was added to the line
 * at zero. Nothing errored, the customer was simply not charged.
 */

import { describe, it, expect } from "vitest";
import { resolvePartPrice } from "@/features/inventory/Lib/partPricing";

describe("resolvePartPrice", () => {
  it("uses the part's own sell price when it has one", () => {
    expect(resolvePartPrice({ unitCost: 10, sellPrice: 25 })).toEqual({
      unitPrice: 25,
      markupPercent: 0,
    });
  });

  it("falls back to cost rather than billing at zero", () => {
    // The regression: a part with no sell price must not land on the line free.
    expect(resolvePartPrice({ unitCost: 10, sellPrice: 0 })).toEqual({
      unitPrice: 10,
      markupPercent: 0,
    });
  });

  it("prices from cost plus markup when the workshop marks up inventory", () => {
    expect(
      resolvePartPrice(
        { unitCost: 10, sellPrice: 25 },
        { markupAppliesToInventory: true, defaultMarkupPercent: 40 },
      ),
    ).toEqual({ unitPrice: 14, markupPercent: 40 });
  });

  it("keeps markupPercent in step with the price it produced", () => {
    const { unitPrice, markupPercent } = resolvePartPrice(
      { unitCost: 20, sellPrice: 0 },
      { markupAppliesToInventory: true, defaultMarkupPercent: 50 },
    );
    expect(unitPrice).toBe(30);
    expect(markupPercent).toBe(50);
  });

  it("ignores the markup setting when the percentage is zero", () => {
    expect(
      resolvePartPrice(
        { unitCost: 10, sellPrice: 25 },
        { markupAppliesToInventory: true, defaultMarkupPercent: 0 },
      ),
    ).toEqual({ unitPrice: 25, markupPercent: 0 });
  });

  it("ignores the markup percentage when the setting is off", () => {
    expect(
      resolvePartPrice(
        { unitCost: 10, sellPrice: 25 },
        { markupAppliesToInventory: false, defaultMarkupPercent: 40 },
      ),
    ).toEqual({ unitPrice: 25, markupPercent: 0 });
  });

  it("rounds a marked-up price to whole cents", () => {
    expect(
      resolvePartPrice(
        { unitCost: 9.99, sellPrice: 0 },
        { markupAppliesToInventory: true, defaultMarkupPercent: 33 },
      ).unitPrice,
    ).toBe(13.29);
  });

  it("yields zero only when the part genuinely has no cost or price", () => {
    expect(resolvePartPrice({ unitCost: 0, sellPrice: 0 }).unitPrice).toBe(0);
  });
});
