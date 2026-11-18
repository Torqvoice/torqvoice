/**
 * Tax charged on some of a document's lines and not on others.
 *
 * The worked examples pin the rule in figures a person can check by hand.
 * The randomised section then throws a few thousand documents at the same
 * code and asks only for what must always hold: the sheet adds up, a fully
 * taxed document is untouched by any of this, and the tax never exceeds
 * what taxing everything would have charged.
 */

import { describe, expect, it } from 'vitest'
import { roundMoney } from '@/lib/money'
import {
  calculateTotals,
  earnedLineTotal,
  netLineTotal,
  netMixedTotal,
  storedTaxableSubtotal,
  taxableBaseFor,
  taxDisplay,
  taxedNetAmountOf,
} from '@/lib/tax'
import {
  hasUntaxedLines,
  laborLineKind,
  laborTaxable,
  partTaxable,
  resolveTaxable,
  TAX_APPLIES_TO_ALL,
  type TaxApplies,
  taxableLaborTotal,
  taxablePartsTotal,
  taxableSubtotalOf,
  withTaxableLabor,
  withTaxableParts,
} from '@/lib/taxable-lines'
import { taxModeConversion } from '@/lib/tax-mode-conversion'

const PARTS_ONLY: TaxApplies = { parts: true, labor: false, shopFee: false }

describe('a workshop that taxes parts and not labor', () => {
  // The support question this was built for: 200 of parts, 300 of labor, 8%.
  const parts = [{ total: 200 }]
  const labor = [{ total: 300, pricingType: 'hourly' }]

  it('charges the tax on the parts alone', () => {
    const taxableSubtotal = taxableSubtotalOf(parts, labor, PARTS_ONLY)
    expect(taxableSubtotal).toBe(200)
    const totals = calculateTotals({
      subtotal: 500,
      discountAmount: 0,
      taxRate: 8,
      taxInclusive: false,
      taxableSubtotal,
    })
    expect(totals.taxAmount).toBe(16)
    expect(totals.totalAmount).toBe(516)
    expect(totals.taxableAmount).toBe(200)
  })

  it('shares a discount over the taxed and the untaxed lines in proportion', () => {
    // 10% off 500 is 50: 20 of it off the parts, 30 off the labor.
    const totals = calculateTotals({
      subtotal: 500,
      discountAmount: 50,
      taxRate: 8,
      taxInclusive: false,
      taxableSubtotal: 200,
    })
    expect(totals.taxableAmount).toBe(180)
    expect(totals.taxAmount).toBe(14.4)
    expect(totals.totalAmount).toBe(464.4)
  })

  it('shares a fixed discount the same way', () => {
    // 100 off 500 leaves 400, of which the parts are two fifths: 160.
    const totals = calculateTotals({
      subtotal: 500,
      discountAmount: 100,
      taxRate: 8,
      taxInclusive: false,
      taxableSubtotal: 200,
    })
    expect(totals.taxableAmount).toBe(160)
    expect(totals.taxAmount).toBe(12.8)
    expect(totals.totalAmount).toBe(412.8)
  })

  it('charges nothing when every line is left out', () => {
    const totals = calculateTotals({
      subtotal: 500,
      discountAmount: 0,
      taxRate: 8,
      taxInclusive: false,
      taxableSubtotal: 0,
    })
    expect(totals).toEqual({
      taxAmount: 0,
      totalAmount: 500,
      components: null,
      taxableAmount: 0,
    })
  })

  it('backs the tax out of the taxable lines only when prices include it', () => {
    // Parts entered at 216 with 8% in them, labor at 300 with none.
    const totals = calculateTotals({
      subtotal: 516,
      discountAmount: 0,
      taxRate: 8,
      taxInclusive: true,
      taxableSubtotal: 216,
    })
    expect(totals.taxAmount).toBe(16)
    expect(totals.totalAmount).toBe(516)
    expect(totals.taxableAmount).toBe(200)
  })

  it('splits the tax into its components on the taxable part alone', () => {
    const components = [
      { name: 'GST', rate: 5 },
      { name: 'QST', rate: 9.975 },
    ]
    const totals = calculateTotals({
      subtotal: 500,
      discountAmount: 0,
      taxRate: 14.975,
      taxInclusive: false,
      components,
      taxableSubtotal: 200,
    })
    expect(totals.components).toEqual([
      { name: 'GST', rate: 5, amount: 10 },
      { name: 'QST', rate: 9.975, amount: 19.95 },
    ])
    expect(totals.taxAmount).toBe(29.95)
    expect(totals.totalAmount).toBe(529.95)
  })

  it('splits an inclusive tax so the components add up to it', () => {
    const totals = calculateTotals({
      subtotal: 529.95,
      discountAmount: 0,
      taxRate: 14.975,
      taxInclusive: true,
      components: [
        { name: 'GST', rate: 5 },
        { name: 'QST', rate: 9.975 },
      ],
      taxableSubtotal: 229.95,
    })
    const sum = roundMoney((totals.components ?? []).reduce((s, c) => s + c.amount, 0))
    expect(sum).toBe(totals.taxAmount)
    expect(totals.taxAmount).toBe(29.95)
    expect(totals.totalAmount).toBe(529.95)
  })
})

describe('which lines are taxed', () => {
  it('lets the line say, and falls back to the workshop rule for its kind', () => {
    expect(resolveTaxable(true, 'labor', PARTS_ONLY)).toBe(true)
    expect(resolveTaxable(false, 'parts', PARTS_ONLY)).toBe(false)
    expect(resolveTaxable(undefined, 'labor', PARTS_ONLY)).toBe(false)
    expect(resolveTaxable(null, 'parts', PARTS_ONLY)).toBe(true)
    // No rule given: everything is taxed, as before the setting existed.
    expect(resolveTaxable(undefined, 'labor')).toBe(true)
    expect(resolveTaxable(undefined, 'shopFee')).toBe(true)
  })

  it('tells a shop fee from labor by how the line is priced', () => {
    expect(laborLineKind({ pricingType: 'shopFee' })).toBe('shopFee')
    expect(laborLineKind({ pricingType: 'hourly' })).toBe('labor')
    expect(laborLineKind({ pricingType: 'service' })).toBe('labor')
    expect(laborLineKind({})).toBe('labor')
    const feeOnly: TaxApplies = { parts: false, labor: false, shopFee: true }
    expect(laborTaxable({ pricingType: 'shopFee' }, feeOnly)).toBe(true)
    expect(laborTaxable({ pricingType: 'hourly' }, feeOnly)).toBe(false)
    expect(partTaxable({}, feeOnly)).toBe(false)
  })

  it('adds up only the taxable lines', () => {
    const parts = [{ total: 100 }, { total: 40, taxable: false }, { total: 60, taxable: true }]
    const labor = [
      { total: 300, pricingType: 'hourly' },
      { total: 25, pricingType: 'shopFee' },
      { total: 80, pricingType: 'service', taxable: true },
    ]
    expect(taxablePartsTotal(parts, PARTS_ONLY)).toBe(160)
    expect(taxableLaborTotal(labor, PARTS_ONLY)).toBe(80)
    expect(taxableSubtotalOf(parts, labor, PARTS_ONLY)).toBe(240)
    expect(taxableSubtotalOf(parts, labor)).toBe(565)
    expect(hasUntaxedLines(parts, labor)).toBe(true)
    expect(hasUntaxedLines([{ total: 1 }], [{ total: 2 }])).toBe(false)
    expect(hasUntaxedLines([{ total: 1 }], [{ total: 2 }], PARTS_ONLY)).toBe(true)
  })

  it('treats a missing or broken total as nothing rather than as NaN', () => {
    expect(taxableSubtotalOf([{ total: null }, {}], [{ total: Number.NaN }])).toBe(0)
  })

  it('settles the flag on every line before it is stored', () => {
    expect(withTaxableParts([{ name: 'a' }, { name: 'b', taxable: false }], PARTS_ONLY)).toEqual([
      { name: 'a', taxable: true },
      { name: 'b', taxable: false },
    ])
    expect(
      withTaxableLabor(
        [
          { d: 1, pricingType: 'hourly' },
          { d: 2, pricingType: 'shopFee' },
          { d: 3, pricingType: 'hourly', taxable: true },
          { d: 4, pricingType: 'hourly', taxable: null },
        ],
        { parts: true, labor: false, shopFee: true }
      ).map((line) => line.taxable)
    ).toEqual([false, true, true, false])
  })
})

describe('the stored taxable subtotal', () => {
  it('is null for a document whose every line is taxed', () => {
    expect(storedTaxableSubtotal(500, null)).toBeNull()
    expect(storedTaxableSubtotal(500, undefined)).toBeNull()
    expect(storedTaxableSubtotal(500, 500)).toBeNull()
    // Float noise and a figure a hair over are still "all of it".
    expect(storedTaxableSubtotal(0.3, 0.1 + 0.2)).toBeNull()
    expect(storedTaxableSubtotal(500, 500.004)).toBeNull()
    expect(storedTaxableSubtotal(500, 600)).toBeNull()
  })

  it('is the figure itself when some lines are not', () => {
    expect(storedTaxableSubtotal(500, 200)).toBe(200)
    expect(storedTaxableSubtotal(500, 0)).toBe(0)
    expect(storedTaxableSubtotal(500, 499.99)).toBe(499.99)
    expect(storedTaxableSubtotal(500, -5)).toBe(0)
  })

  it('gives the base itself when everything is taxed, never a recomputed figure', () => {
    expect(taxableBaseFor(449.99, 500, null)).toBe(449.99)
    expect(taxableBaseFor(449.99, 500, 500)).toBe(449.99)
    expect(taxableBaseFor(449.99, 500, 0)).toBe(0)
    expect(taxableBaseFor(0, 0, 0)).toBe(0)
    expect(taxableBaseFor(400, 500, 200)).toBe(160)
  })
})

describe('figures shown above the tax line', () => {
  it('reads an untaxed line the same in every mode', () => {
    for (const taxInclusive of [true, false]) {
      for (const withTax of [true, false]) {
        const display = taxDisplay({ taxRate: 25, taxInclusive, withTax })
        expect(display.line(300, false)).toBe(300)
      }
    }
    expect(netLineTotal(300, 25, true, false)).toBe(300)
    expect(netLineTotal(125, 25, true, true)).toBe(100)
    expect(netLineTotal(125, 25, true)).toBe(100)
  })

  it('converts a taxed line by the rate, in the direction the sheet asks for', () => {
    expect(taxDisplay({ taxRate: 25, taxInclusive: true }).line(125)).toBe(100)
    expect(taxDisplay({ taxRate: 25, taxInclusive: false }).line(100)).toBe(100)
    expect(taxDisplay({ taxRate: 25, taxInclusive: false, withTax: true }).line(100)).toBe(125)
    expect(taxDisplay({ taxRate: 25, taxInclusive: true, withTax: true }).line(125)).toBe(125)
    expect(taxDisplay({ taxRate: 0, taxInclusive: true }).line(125)).toBe(125)
  })

  it('converts a sum in its taxable part only', () => {
    const net = taxDisplay({ taxRate: 25, taxInclusive: true })
    // 125 of taxed parts and 300 of untaxed labor, entered with tax in the parts.
    expect(net.mixed(425, 125)).toBe(400)
    expect(net.mixed(425, null)).toBe(340)
    expect(net.mixed(425, undefined)).toBe(340)
    expect(netMixedTotal(425, 125, 25, true)).toBe(400)
    expect(netMixedTotal(425, null, 25, true)).toBe(340)
    expect(netMixedTotal(425, 125, 25, false)).toBe(425)
    const gross = taxDisplay({ taxRate: 25, taxInclusive: false, withTax: true })
    expect(gross.mixed(400, 100)).toBe(425)
  })

  it('keeps the discount the same share of the subtotal it shows', () => {
    const net = taxDisplay({ taxRate: 25, taxInclusive: true })
    // 10% of 425 is 42.50; the shown subtotal is 400, so the shown discount is 40.
    expect(net.discount(42.5, 425, 125)).toBeCloseTo(40, 10)
    // Every line taxed: the discount converts like any other figure.
    expect(net.discount(42.5, 425, null)).toBeCloseTo(34, 10)
    expect(taxDisplay({ taxRate: 25, taxInclusive: false }).discount(40, 400, 100)).toBe(40)
  })
})

describe('reports on a document with untaxed lines', () => {
  it('counts an untaxed line as earned in full on an inclusive document', () => {
    const record = { taxRate: 25, taxInclusive: true, subtotal: 425, discountAmount: 0 }
    expect(earnedLineTotal(300, record, false)).toBe(300)
    expect(earnedLineTotal(125, record, true)).toBe(100)
    expect(earnedLineTotal(125, record)).toBe(100)
  })

  it('still takes the discount share off an untaxed line', () => {
    const record = { taxRate: 25, taxInclusive: false, subtotal: 500, discountAmount: 50 }
    expect(earnedLineTotal(300, record, false)).toBe(270)
  })

  it('reports the amount the tax was actually charged on', () => {
    // Exclusive: 500 less 50 discount, two fifths taxed at 8%.
    expect(
      taxedNetAmountOf({
        totalAmount: 464.4,
        taxAmount: 14.4,
        taxInclusive: false,
        subtotal: 500,
        taxableSubtotal: 200,
      })
    ).toBeCloseTo(180, 10)
    // Inclusive: 216 of taxed parts inside a 516 total.
    expect(
      taxedNetAmountOf({
        totalAmount: 516,
        taxAmount: 16,
        taxInclusive: true,
        subtotal: 516,
        taxableSubtotal: 216,
      })
    ).toBeCloseTo(200, 10)
    // Every line taxed: the total less the tax, as it always was.
    expect(
      taxedNetAmountOf({ totalAmount: 540, taxAmount: 40, taxInclusive: false, subtotal: 500 })
    ).toBe(500)
    expect(
      taxedNetAmountOf({
        totalAmount: 540,
        taxAmount: 40,
        taxInclusive: true,
        subtotal: 540,
        taxableSubtotal: null,
      })
    ).toBe(500)
  })
})

describe('moving a document between exclusive and inclusive prices', () => {
  const doc = {
    subtotal: 500,
    taxableSubtotal: 200,
    discountType: 'fixed',
    discountValue: 100,
    discountAmount: 100,
    taxRate: 8,
  }
  const totalOf = (
    d: { subtotal: number; discountAmount: number; taxableSubtotal: number | null },
    taxInclusive: boolean
  ) =>
    calculateTotals({
      subtotal: d.subtotal,
      discountAmount: d.discountAmount,
      taxRate: 8,
      taxInclusive,
      taxableSubtotal: d.taxableSubtotal,
    })

  it('re-prices only the taxable part and leaves the customer total where it was', () => {
    const before = totalOf(doc, false)
    const moved = taxModeConversion(doc, 'inclusive')
    expect(moved.subtotal).toBeCloseTo(516, 10)
    expect(moved.taxableSubtotal).toBeCloseTo(216, 10)
    expect(moved.scaleLine(200)).toBeCloseTo(216, 10)
    const after = totalOf(moved, true)
    expect(after.totalAmount).toBe(before.totalAmount)
    expect(after.taxAmount).toBe(before.taxAmount)
  })

  it('comes back to where it started', () => {
    const there = taxModeConversion(doc, 'inclusive')
    const back = taxModeConversion({ ...doc, ...there }, 'exclusive')
    expect(back.subtotal).toBeCloseTo(500, 8)
    expect(back.taxableSubtotal).toBeCloseTo(200, 8)
    expect(back.discountAmount).toBeCloseTo(100, 8)
    expect(back.discountValue).toBeCloseTo(100, 8)
  })

  it('scales everything by the tax factor when every line is taxed, as it always did', () => {
    const all = { ...doc, taxableSubtotal: null }
    const moved = taxModeConversion(all, 'inclusive')
    expect(moved).toMatchObject({
      subtotal: 500 * 1.08,
      taxableSubtotal: null,
      discountAmount: 100 * 1.08,
      discountValue: 100 * 1.08,
    })
    const down = taxModeConversion(all, 'exclusive')
    expect(down.subtotal).toBe(500 / 1.08)
    expect(down.discountAmount).toBe(100 / 1.08)
  })

  it('leaves a percentage discount as the percentage it is', () => {
    const moved = taxModeConversion(
      { ...doc, discountType: 'percentage', discountValue: 20 },
      'inclusive'
    )
    expect(moved.discountValue).toBe(20)
  })
})

/* -------------------------------------------------------------------------- */
/* Randomised documents                                                        */
/* -------------------------------------------------------------------------- */

/** A small seeded generator, so a failure names a document that can be replayed. */
function prng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const RATES = [0, 5, 7.25, 8, 8.875, 9.975, 14.975, 19, 20, 21, 25]

function randomDocument(next: () => number) {
  const money = (max: number) => Math.round(next() * max * 100) / 100
  const lineCount = 1 + Math.floor(next() * 6)
  const lines = Array.from({ length: lineCount }, () => ({
    total: next() < 0.1 ? 0 : money(2000),
    taxable: next() < 0.55,
  }))
  const subtotal = roundMoney(lines.reduce((s, l) => s + l.total, 0))
  const taxableSubtotal = roundMoney(lines.reduce((s, l) => (l.taxable ? s + l.total : s), 0))
  const pick = next()
  const discountAmount =
    pick < 0.4
      ? 0
      : pick < 0.7
        ? roundMoney(subtotal * (Math.floor(next() * 50) / 100))
        : roundMoney(Math.min(money(500), subtotal))
  const taxRate = RATES[Math.floor(next() * RATES.length)]
  const taxInclusive = next() < 0.4
  const split = next() < 0.25 && taxRate > 0
  const components = split
    ? [
        { name: 'A', rate: Math.round((taxRate / 3) * 1000) / 1000 },
        { name: 'B', rate: Math.round(((taxRate * 2) / 3) * 1000) / 1000 },
      ]
    : null
  return { lines, subtotal, taxableSubtotal, discountAmount, taxRate, taxInclusive, components }
}

describe('any document at all', () => {
  const RUNS = 4000

  it('adds up to the cent, whichever lines are taxed', () => {
    const next = prng(20261013)
    for (let run = 0; run < RUNS; run++) {
      const d = randomDocument(next)
      const totals = calculateTotals(d)
      const base = Math.max(0, roundMoney(d.subtotal - d.discountAmount))
      const label = JSON.stringify(d)

      // Every figure is held to the cent.
      expect(roundMoney(totals.taxAmount), label).toBe(totals.taxAmount)
      expect(roundMoney(totals.totalAmount), label).toBe(totals.totalAmount)
      expect(roundMoney(totals.taxableAmount), label).toBe(totals.taxableAmount)

      // The sheet adds up: tax on top when exclusive, inside when inclusive.
      if (d.taxInclusive) expect(totals.totalAmount, label).toBe(base)
      else expect(totals.totalAmount, label).toBe(roundMoney(base + totals.taxAmount))

      // Nothing is negative, and the tax is charged on no more than the base.
      expect(totals.taxAmount, label).toBeGreaterThanOrEqual(0)
      expect(totals.taxableAmount, label).toBeGreaterThanOrEqual(0)
      expect(totals.taxableAmount, label).toBeLessThanOrEqual(base)

      // Never more tax than taxing every line would have charged.
      const full = calculateTotals({ ...d, taxableSubtotal: null })
      expect(totals.taxAmount, label).toBeLessThanOrEqual(full.taxAmount)

      // The printed components are the printed tax.
      if (totals.components) {
        const sum = roundMoney(totals.components.reduce((s, c) => s + c.amount, 0))
        expect(sum, label).toBe(totals.taxAmount)
      }
    }
  })

  it('is not changed in any figure by this feature while every line is taxed', () => {
    const next = prng(4242)
    for (let run = 0; run < RUNS; run++) {
      const d = randomDocument(next)
      const { taxableSubtotal: _ignored, lines: _lines, ...legacy } = d
      const before = calculateTotals(legacy)
      const label = JSON.stringify(d)
      // Said three ways: not said, said as null, said as the whole subtotal.
      expect(calculateTotals({ ...legacy, taxableSubtotal: undefined }), label).toEqual(before)
      expect(calculateTotals({ ...legacy, taxableSubtotal: null }), label).toEqual(before)
      expect(calculateTotals({ ...legacy, taxableSubtotal: d.subtotal }), label).toEqual(before)
      // And the taxable amount of such a document is its whole net base.
      const base = Math.max(0, roundMoney(d.subtotal - d.discountAmount))
      expect(before.taxableAmount, label).toBe(
        d.taxInclusive ? roundMoney(base - before.taxAmount) : base
      )
    }
  })

  it('charges no tax at all when no line is taxed', () => {
    const next = prng(7)
    for (let run = 0; run < 500; run++) {
      const d = randomDocument(next)
      const totals = calculateTotals({ ...d, taxableSubtotal: 0 })
      const base = Math.max(0, roundMoney(d.subtotal - d.discountAmount))
      expect(totals.taxAmount).toBe(0)
      expect(totals.totalAmount).toBe(base)
      expect(totals.taxableAmount).toBe(0)
    }
  })

  it('charges the rate on the taxable amount, to within a cent of rounding', () => {
    const next = prng(99)
    for (let run = 0; run < RUNS; run++) {
      const d = { ...randomDocument(next), components: null }
      const totals = calculateTotals(d)
      const expected = totals.taxableAmount * (d.taxRate / 100)
      expect(Math.abs(totals.taxAmount - expected), JSON.stringify(d)).toBeLessThanOrEqual(0.0101)
    }
  })

  it('shows figures that add back up to the total, net or with tax in them', () => {
    const next = prng(31337)
    for (let run = 0; run < RUNS; run++) {
      const d = randomDocument(next)
      if (d.subtotal <= 0) continue
      const stored = storedTaxableSubtotal(d.subtotal, d.taxableSubtotal)
      const totals = calculateTotals({ ...d, components: null, taxableSubtotal: stored })
      const label = JSON.stringify(d)

      // Net reading: subtotal less discount plus tax is the total.
      const net = taxDisplay({ taxRate: d.taxRate, taxInclusive: d.taxInclusive })
      const netSum =
        net.mixed(d.subtotal, stored) -
        net.discount(d.discountAmount, d.subtotal, stored) +
        totals.taxAmount
      expect(Math.abs(netSum - totals.totalAmount), label).toBeLessThanOrEqual(0.0101)

      // With tax in the lines: subtotal less discount is the total already.
      const gross = taxDisplay({ taxRate: d.taxRate, taxInclusive: d.taxInclusive, withTax: true })
      const grossSum =
        gross.mixed(d.subtotal, stored) - gross.discount(d.discountAmount, d.subtotal, stored)
      expect(Math.abs(grossSum - totals.totalAmount), label).toBeLessThanOrEqual(0.0101)
    }
  })

  it('reports a taxable amount that the rate turns back into the tax collected', () => {
    const next = prng(555)
    for (let run = 0; run < RUNS; run++) {
      const d = randomDocument(next)
      if (d.subtotal <= 0) continue
      const stored = storedTaxableSubtotal(d.subtotal, d.taxableSubtotal)
      const totals = calculateTotals({ ...d, components: null, taxableSubtotal: stored })
      const taxed = taxedNetAmountOf({
        totalAmount: totals.totalAmount,
        taxAmount: totals.taxAmount,
        taxInclusive: d.taxInclusive,
        subtotal: d.subtotal,
        taxableSubtotal: stored,
      })
      expect(taxed, JSON.stringify(d)).toBeGreaterThanOrEqual(0)
      // Within a cent of rounding on each side of the multiplication.
      expect(
        Math.abs(taxed * (d.taxRate / 100) - totals.taxAmount),
        JSON.stringify(d)
      ).toBeLessThanOrEqual(0.021)
    }
  })

  it('keeps the customer total through a change of tax mode, to the cent', () => {
    const next = prng(8080)
    for (let run = 0; run < RUNS; run++) {
      const d = randomDocument(next)
      if (d.taxRate <= 0 || d.subtotal <= 0) continue
      const stored = storedTaxableSubtotal(d.subtotal, d.taxableSubtotal)
      const from = calculateTotals({ ...d, components: null, taxableSubtotal: stored })
      const to = d.taxInclusive ? 'exclusive' : 'inclusive'
      const moved = taxModeConversion(
        {
          subtotal: d.subtotal,
          taxableSubtotal: stored,
          discountType: 'fixed',
          discountValue: d.discountAmount,
          discountAmount: d.discountAmount,
          taxRate: d.taxRate,
        },
        to
      )
      const after = calculateTotals({
        subtotal: moved.subtotal,
        discountAmount: moved.discountAmount,
        taxRate: d.taxRate,
        taxInclusive: !d.taxInclusive,
        taxableSubtotal: moved.taxableSubtotal,
      })
      // Each side rounds its own subtotal and discount, so a cent or two of
      // drift is the most that re-pricing every line can cause.
      expect(Math.abs(after.totalAmount - from.totalAmount), JSON.stringify(d)).toBeLessThanOrEqual(
        0.03
      )
    }
  })
})

describe('the default rule', () => {
  it('taxes every kind', () => {
    expect(TAX_APPLIES_TO_ALL).toEqual({ parts: true, labor: true, shopFee: true })
  })
})
