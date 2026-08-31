/**
 * Tests for every money figure derived from a stocked part.
 *
 * This exists because the rules were duplicated. The inventory picker had the
 * full fallback chain; the inline name suggestion used `sellPrice` directly,
 * so any part whose sell price had never been filled in was added to the line
 * at zero. Nothing errored, the customer was simply not charged. The
 * cost-plus-markup formula was then hand-written in four more places, each
 * free to drift.
 *
 * Expected values here are the arithmetic a workshop would do on paper, not a
 * transcription of what the code returns. Where the two disagree the code is
 * wrong.
 */

import { describe, it, expect } from 'vitest'
import {
  lineTotal,
  markupFromCostAndPrice,
  isPriceOverridden,
  parseQuantity,
  repricePartRow,
  priceFromCostAndMarkup,
  priceFromCostAndMultiplier,
  readPartsPricingSettings,
  resolvePartPrice,
  roundMoney,
} from '@/features/inventory/Lib/partPricing'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

/** How the settings map actually arrives: keys to strings, everything optional. */
const settingsMap = (defaultMarkupPercent?: string, markupAppliesToInventory?: string) => ({
  [SETTING_KEYS.PARTS_DEFAULT_MARKUP_PERCENT]: defaultMarkupPercent,
  [SETTING_KEYS.PARTS_MARKUP_APPLIES_TO_INVENTORY]: markupAppliesToInventory,
})

const readSettings = (settings: Record<string, string | undefined>) =>
  readPartsPricingSettings(settings, {
    defaultMarkupPercent: SETTING_KEYS.PARTS_DEFAULT_MARKUP_PERCENT,
    markupAppliesToInventory: SETTING_KEYS.PARTS_MARKUP_APPLIES_TO_INVENTORY,
  })

/** True when a figure is exact to the cent, with no sub-cent tail. */
const isExactToTheCent = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9

describe('roundMoney', () => {
  it('rounds to the cent', () => {
    expect(roundMoney(10.004)).toBe(10)
    expect(roundMoney(10.005)).toBe(10.01)
    expect(roundMoney(10.006)).toBe(10.01)
  })

  it('rounds a decimal half up even when binary float lands just under it', () => {
    // 2.5 * 19.99 is held as 49.974999999999994, so rounding the binary value
    // bills 49.97. The decimal answer is 49.975 and a customer invoice rounds
    // it up. Getting this wrong is a silent one-cent underbill per line.
    expect(roundMoney(2.5 * 19.99)).toBe(49.98)
    // The textbook case: naive rounding returns 1 here.
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(1234567.005)).toBe(1234567.01)
  })

  it('clears the float tail from an otherwise exact product', () => {
    expect(roundMoney(3 * 0.1)).toBe(0.3)
    expect(roundMoney(7 * 1.15)).toBe(8.05)
  })

  it('rounds a credit by the same magnitude as the charge it reverses', () => {
    expect(roundMoney(-(2.5 * 19.99))).toBe(-49.98)
    expect(roundMoney(-1.005)).toBe(-1.01)
    expect(roundMoney(-10.004)).toBe(-10)
  })

  it('never returns NaN, whatever it is handed', () => {
    expect(roundMoney('')).toBe(0)
    expect(roundMoney('abc')).toBe(0)
    expect(roundMoney(undefined)).toBe(0)
    expect(roundMoney(null)).toBe(0)
    expect(roundMoney(Number.POSITIVE_INFINITY)).toBe(0)
    expect(roundMoney(Number.NaN)).toBe(0)
  })
})

describe('parseQuantity', () => {
  it('reads a quantity the number input already stored as a string', () => {
    expect(parseQuantity('2')).toBe(2)
    expect(parseQuantity('0.5')).toBe(0.5)
  })

  it('keeps a deliberate zero rather than rounding it up to one', () => {
    expect(parseQuantity(0)).toBe(0)
    expect(parseQuantity('0')).toBe(0)
  })

  it('treats a cleared field as zero, matching how totals are recomputed', () => {
    expect(parseQuantity('')).toBe(0)
  })

  it('never yields NaN, so a total can never become NaN', () => {
    expect(parseQuantity('abc')).toBe(0)
    expect(parseQuantity(undefined)).toBe(0)
    expect(parseQuantity(null)).toBe(0)
    expect(parseQuantity(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('priceFromCostAndMarkup', () => {
  it('adds the markup percentage to cost', () => {
    expect(priceFromCostAndMarkup(100, 50)).toBe(150)
    expect(priceFromCostAndMarkup(200, 25)).toBe(250)
    expect(priceFromCostAndMarkup(44.99, 100)).toBe(89.98)
  })

  it('sells at cost when the markup is zero, with no hidden floor', () => {
    expect(priceFromCostAndMarkup(80, 0)).toBe(80)
    expect(priceFromCostAndMarkup(0, 50)).toBe(0)
  })

  it('handles fractional markups and costs to the cent', () => {
    expect(priceFromCostAndMarkup(10, 12.5)).toBe(11.25)
    expect(priceFromCostAndMarkup(9.99, 33)).toBe(13.29)
    expect(priceFromCostAndMarkup(19.99, 60)).toBe(31.98)
    expect(priceFromCostAndMarkup(29.99, 50)).toBe(44.99)
    expect(priceFromCostAndMarkup(0.01, 50)).toBe(0.02)
  })

  it('never produces a sub-cent price', () => {
    for (let cost = 0.01; cost < 200; cost += 3.37) {
      for (const markup of [0, 7.5, 12.5, 33, 50, 66.6, 100, 150]) {
        expect(isExactToTheCent(priceFromCostAndMarkup(cost, markup))).toBe(true)
      }
    }
  })

  it('reads cost and markup that arrived as strings from an input', () => {
    expect(priceFromCostAndMarkup('100', '50')).toBe(150)
    expect(priceFromCostAndMarkup('', '50')).toBe(0)
    expect(priceFromCostAndMarkup('100', '')).toBe(100)
  })
})

describe('priceFromCostAndMultiplier', () => {
  it("multiplies cost by the inventory form's multiplier", () => {
    expect(priceFromCostAndMultiplier(100, 1.5)).toBe(150)
    expect(priceFromCostAndMultiplier(9.99, 2)).toBe(19.98)
  })

  it('agrees with the percentage form, since 1.5x is a 50 percent markup', () => {
    // The two settings use different units. They must not disagree on price,
    // or the same part is worth different money in the catalog and on the job.
    for (const cost of [0.01, 9.99, 44.99, 100, 137.5]) {
      expect(priceFromCostAndMultiplier(cost, 1.5)).toBe(priceFromCostAndMarkup(cost, 50))
      expect(priceFromCostAndMultiplier(cost, 1)).toBe(priceFromCostAndMarkup(cost, 0))
      expect(priceFromCostAndMultiplier(cost, 2.25)).toBe(priceFromCostAndMarkup(cost, 125))
    }
  })
})

describe('markupFromCostAndPrice', () => {
  it('derives the markup a price implies over a cost', () => {
    expect(markupFromCostAndPrice(100, 150)).toBe(50)
    expect(markupFromCostAndPrice(100, 100)).toBe(0)
    expect(markupFromCostAndPrice(10, 11.25)).toBe(12.5)
  })

  it('reports a negative markup when a part is sold below cost', () => {
    expect(markupFromCostAndPrice(100, 50)).toBe(-50)
  })

  it('treats a price with no cost behind it as a free override, not infinite margin', () => {
    expect(markupFromCostAndPrice(0, 50)).toBe(0)
    expect(markupFromCostAndPrice('', 50)).toBe(0)
    expect(markupFromCostAndPrice(-5, 50)).toBe(0)
  })

  it('recovers the markup exactly when the price lands on a whole cent', () => {
    // Editing the price and editing the markup are two ways to set the same
    // number. Where no rounding intervenes they must agree exactly, or the
    // margin shown to the workshop is a lie.
    for (const [cost, markup] of [
      [100, 50],
      [100, 12.5],
      [10, 12.5],
      [44.99, 100],
      [37.5, 17.5],
      [9.99, 33],
      [250, 0],
    ] as const) {
      expect(markupFromCostAndPrice(cost, priceFromCostAndMarkup(cost, markup))).toBe(markup)
    }
  })

  it('drifts only by what cent-rounding forces, never more', () => {
    // A price must land on a whole cent, so the markup it implies cannot
    // always be the one that produced it. 9.99 + 50% is 14.985, which bills as
    // 14.99, and 14.99 over 9.99 really is 50.1%. The recoverable bound is
    // half a cent spread over cost, plus half the markup field's own 0.1
    // resolution. Anything beyond that is an arithmetic fault, not rounding.
    for (const cost of [0.5, 9.99, 10, 37.5, 44.99, 100, 249.95]) {
      for (const markup of [0, 12.5, 17.5, 33, 50, 100]) {
        const price = priceFromCostAndMarkup(cost, markup)
        const recovered = markupFromCostAndPrice(cost, price)
        const bound = (0.005 / cost) * 100 + 0.05 + 1e-9
        expect(Math.abs(recovered - markup)).toBeLessThanOrEqual(bound)
      }
    }
  })

  it('pins the known cent-rounding case so a change of formula is visible', () => {
    expect(priceFromCostAndMarkup(9.99, 50)).toBe(14.99)
    expect(markupFromCostAndPrice(9.99, 14.99)).toBe(50.1)
  })
})

describe('lineTotal', () => {
  it('multiplies quantity by unit price', () => {
    expect(lineTotal(2, 615)).toBe(1230)
    expect(lineTotal(1, 44.99)).toBe(44.99)
    expect(lineTotal(3, 19.99)).toBe(59.97)
  })

  it('reads a quantity still held as a string', () => {
    expect(lineTotal('2', 615)).toBe(1230)
  })

  it('is zero when the quantity is zero or the field was cleared', () => {
    expect(lineTotal(0, 615)).toBe(0)
    expect(lineTotal('', 615)).toBe(0)
  })

  it('rounds a fractional quantity to the cent', () => {
    expect(lineTotal(2.5, 19.99)).toBe(49.98)
    expect(lineTotal(1.5, 10.05)).toBe(15.08)
  })

  it('never yields NaN or a sub-cent total', () => {
    for (const quantity of ['2', '', '0', 0, 3, 2.5, undefined, 'abc', null]) {
      for (const price of [0, 0.01, 19.99, 615, 1234.56]) {
        const total = lineTotal(quantity, price)
        expect(Number.isNaN(total)).toBe(false)
        expect(isExactToTheCent(total)).toBe(true)
      }
    }
  })
})

describe('readPartsPricingSettings', () => {
  it('reads the markup the user typed into settings', () => {
    expect(readSettings(settingsMap('50', 'true'))).toEqual({
      defaultMarkupPercent: 50,
      markupAppliesToInventory: true,
    })
  })

  it('reads a fractional markup', () => {
    expect(readSettings(settingsMap('12.5', 'false')).defaultMarkupPercent).toBe(12.5)
  })

  it("treats anything other than the string 'true' as off", () => {
    // The toggle is persisted as a string, so a stale or absent value must not
    // silently switch inventory parts onto markup pricing.
    expect(readSettings(settingsMap('50', 'false')).markupAppliesToInventory).toBe(false)
    expect(readSettings(settingsMap('50', undefined)).markupAppliesToInventory).toBe(false)
    expect(readSettings(settingsMap('50', 'TRUE')).markupAppliesToInventory).toBe(false)
    expect(readSettings(settingsMap('50', '1')).markupAppliesToInventory).toBe(false)
  })

  it('falls back to no markup when the setting is missing or unusable', () => {
    expect(readSettings(settingsMap(undefined, 'true')).defaultMarkupPercent).toBe(0)
    expect(readSettings(settingsMap('', 'true')).defaultMarkupPercent).toBe(0)
    expect(readSettings(settingsMap('abc', 'true')).defaultMarkupPercent).toBe(0)
    expect(readSettings({}).defaultMarkupPercent).toBe(0)
  })
})

describe('resolvePartPrice', () => {
  it("uses the part's own sell price when it has one", () => {
    expect(resolvePartPrice({ unitCost: 10, sellPrice: 25 })).toEqual({
      unitPrice: 25,
      markupPercent: 0,
    })
  })

  it('falls back to cost rather than billing at zero', () => {
    // This is the bug the module was extracted to kill: a part whose sell
    // price was never filled in was added to the line for free.
    expect(resolvePartPrice({ unitCost: 10, sellPrice: 0 })).toEqual({
      unitPrice: 10,
      markupPercent: 0,
    })
  })

  it('yields zero only when the part genuinely has no cost or price', () => {
    expect(resolvePartPrice({ unitCost: 0, sellPrice: 0 }).unitPrice).toBe(0)
  })

  it('ignores the org markup unless it is switched on for inventory', () => {
    expect(
      resolvePartPrice(
        { unitCost: 10, sellPrice: 25 },
        { markupAppliesToInventory: false, defaultMarkupPercent: 40 }
      )
    ).toEqual({ unitPrice: 25, markupPercent: 0 })
  })

  it('prices from cost plus markup when the setting is on', () => {
    expect(
      resolvePartPrice(
        { unitCost: 10, sellPrice: 25 },
        { markupAppliesToInventory: true, defaultMarkupPercent: 40 }
      )
    ).toEqual({ unitPrice: 14, markupPercent: 40 })
  })

  it('rounds a marked-up price to whole cents', () => {
    expect(
      resolvePartPrice(
        { unitCost: 9.99, sellPrice: 0 },
        { markupAppliesToInventory: true, defaultMarkupPercent: 33 }
      ).unitPrice
    ).toBe(13.29)
  })

  it('reports the markup it actually applied, so the displayed margin is real', () => {
    const withMarkup = resolvePartPrice(
      { unitCost: 20, sellPrice: 0 },
      { markupAppliesToInventory: true, defaultMarkupPercent: 25 }
    )
    expect(withMarkup.unitPrice).toBe(25)
    expect(markupFromCostAndPrice(20, withMarkup.unitPrice)).toBe(withMarkup.markupPercent)
  })

  it('falls back to sell price when the markup is zero or negative', () => {
    // A markup of 0 through this branch would price every part at cost and
    // quietly discard its sell price.
    for (const defaultMarkupPercent of [0, -20]) {
      expect(
        resolvePartPrice(
          { unitCost: 10, sellPrice: 25 },
          { markupAppliesToInventory: true, defaultMarkupPercent }
        )
      ).toEqual({ unitPrice: 25, markupPercent: 0 })
    }
  })
})

/**
 * A part can reach a line four ways: the picker dialog, the inline name
 * suggestion, a barcode scan, and apply-markup-to-all. They disagreed once
 * already. These pin the whole chain from the saved setting to the stored
 * total.
 */
describe('settings to line total, end to end', () => {
  const part = { unitCost: 40, sellPrice: 90, quantity: 3 }

  it("bills the part's sell price when markup is off", () => {
    const pricing = readSettings(settingsMap('50', 'false'))
    const { unitPrice, markupPercent } = resolvePartPrice(part, pricing)
    expect(unitPrice).toBe(90)
    expect(markupPercent).toBe(0)
    expect(lineTotal(part.quantity, unitPrice)).toBe(270)
  })

  it('bills cost plus the configured markup when it is on', () => {
    const pricing = readSettings(settingsMap('50', 'true'))
    const { unitPrice, markupPercent } = resolvePartPrice(part, pricing)
    expect(unitPrice).toBe(60)
    expect(markupPercent).toBe(50)
    expect(lineTotal(part.quantity, unitPrice)).toBe(180)
  })

  it('holds total === quantity * unitPrice for every quantity a row can hold', () => {
    const pricing = readSettings(settingsMap('33', 'true'))
    const { unitPrice } = resolvePartPrice({ unitCost: 9.99, sellPrice: 0 }, pricing)
    expect(unitPrice).toBe(13.29)
    for (const [quantity, expected] of [
      [0, 0],
      ['', 0],
      [1, 13.29],
      ['2', 26.58],
      [3, 39.87],
      [2.5, 33.23], // 33.225 rounded up
    ] as const) {
      expect(lineTotal(quantity, unitPrice)).toBe(expected)
    }
  })

  it('prices a part identically however it reaches the line', () => {
    const pricing = readSettings(settingsMap('50', 'true'))
    const stocked = { unitCost: 29.99, sellPrice: 80 }

    // Picker and suggestion and barcode scan all call resolvePartPrice.
    const resolved = resolvePartPrice(stocked, pricing).unitPrice
    // Apply-markup-to-all recomputes from cost and the same setting.
    const applied = priceFromCostAndMarkup(stocked.unitCost, pricing.defaultMarkupPercent)
    // The catalog form derives a sell price from the equivalent multiplier.
    const catalog = priceFromCostAndMultiplier(stocked.unitCost, 1.5)

    expect(resolved).toBe(44.99)
    expect(applied).toBe(resolved)
    expect(catalog).toBe(resolved)
  })
})

/**
 * These drive the reducer the way the editor does: the number inputs fire on
 * every keystroke, so entering "1500" is four separate edits carrying "1",
 * "15", "150" and "1500". Testing whole values in one step hides anything that
 * only goes wrong on the way there, which is exactly how a version of this
 * shipped that multiplied a price of 1000 up to 1500000.
 */
type Row = {
  unitCost: string | number
  markupPercent: string | number
  unitPrice: string | number
  priceOverridden?: boolean
}

/** Applies one keystroke, as the editor's updatePart does. */
function edit(row: Row, field: 'unitCost' | 'markupPercent' | 'unitPrice', value: string): Row {
  const next = { ...row, [field]: value }
  return { ...next, ...repricePartRow(next, field) }
}

/** Leaves the field, as the editor's onBlur does. */
function commit(row: Row, field: 'unitCost' | 'markupPercent' | 'unitPrice'): Row {
  return { ...row, ...repricePartRow(row, field, { commit: true }) }
}

/**
 * Types a value one character at a time, reducing on each keystroke, and
 * returns every state the row passes through.
 *
 * The intermediate states are the point. Asserting only the settled row is
 * what let a markup of 99900% ship: it was on screen for three keystrokes and
 * the final value was correct, so a test of the end state saw nothing wrong.
 */
function keystrokes(
  row: Row,
  field: 'unitCost' | 'markupPercent' | 'unitPrice',
  text: string
): Row[] {
  const states: Row[] = []
  let current = row
  for (let i = 1; i <= text.length; i++) {
    current = edit(current, field, text.slice(0, i))
    states.push(current)
  }
  return states
}

/** The row as it settles, once the field is left. */
function type(row: Row, field: 'unitCost' | 'markupPercent' | 'unitPrice', text: string): Row {
  const states = keystrokes(row, field, text)
  return commit(states[states.length - 1] ?? row, field)
}

const freshRow: Row = { unitCost: 0, markupPercent: 0, unitPrice: 0 }

describe('repricePartRow, typed one keystroke at a time', () => {
  it('keeps the price when the cost is entered after it', () => {
    // The reported bug: 1000 entered as the price, then 1500 as the cost.
    const row = type(type(freshRow, 'unitPrice', '1000'), 'unitCost', '1500')
    expect(row.unitPrice).toBe(1000)
    // 1000 sold on a cost of 1500 is a third under cost, not a 99900% margin.
    expect(row.markupPercent).toBe(-33.3)
  })

  it('is not disturbed by an intermediate cost that happens to explain the price', () => {
    // Passing through a cost of 1 makes 1000 exactly what 99900% implies. A
    // rule that re-reads the numbers each keystroke takes the bait here.
    const afterFirstDigit = edit(type(freshRow, 'unitPrice', '1000'), 'unitCost', '1')
    expect(afterFirstDigit.priceOverridden).toBe(true)
    expect(edit(afterFirstDigit, 'unitCost', '15').unitPrice).toBe(1000)
  })

  it('reaches the same row whichever of price and cost is entered first', () => {
    const priceFirst = type(type(freshRow, 'unitPrice', '1000'), 'unitCost', '1500')
    const costFirst = type(type(freshRow, 'unitCost', '1500'), 'unitPrice', '1000')
    expect(priceFirst.unitPrice).toBe(costFirst.unitPrice)
    expect(priceFirst.markupPercent).toBe(costFirst.markupPercent)
  })

  it('prices from cost while nothing has been typed over it', () => {
    const row = type(freshRow, 'unitCost', '1500')
    expect(row.unitPrice).toBe(1500)
    expect(row.markupPercent).toBe(0)
  })

  it('follows the cost on a line that is sold at cost', () => {
    const atCost = type(freshRow, 'unitCost', '50')
    expect(type(atCost, 'unitCost', '60').unitPrice).toBe(60)
  })

  it('follows the cost on a line priced by markup', () => {
    const row = type(type(freshRow, 'unitCost', '50'), 'markupPercent', '100')
    expect(row.unitPrice).toBe(100)
    expect(type(row, 'unitCost', '60').unitPrice).toBe(120)
  })

  it('hands pricing back to the formula when a markup is typed over an override', () => {
    // Entering a markup says "price this from cost", which supersedes a price
    // that was typed earlier.
    const overridden = type(type(freshRow, 'unitPrice', '1000'), 'unitCost', '1500')
    const remarked = type(overridden, 'markupPercent', '50')
    expect(remarked.unitPrice).toBe(2250)
    expect(remarked.priceOverridden).toBe(false)
    expect(type(remarked, 'unitCost', '2000').unitPrice).toBe(3000)
  })

  it('survives a cleared field mid-edit', () => {
    // Selecting the cost and retyping it empties the box first.
    const row = type(type(freshRow, 'unitPrice', '1000'), 'unitCost', '1500')
    const cleared = edit(row, 'unitCost', '')
    expect(cleared.unitPrice).toBe(1000)
    expect(type(cleared, 'unitCost', '2000').unitPrice).toBe(1000)
  })
})

describe('isPriceOverridden', () => {
  it('recognises a price that its cost and markup explain', () => {
    expect(isPriceOverridden({ unitCost: 50, markupPercent: 100, unitPrice: 100 })).toBe(false)
    expect(isPriceOverridden({ unitCost: 50, markupPercent: 0, unitPrice: 50 })).toBe(false)
    expect(isPriceOverridden({ unitCost: 0, markupPercent: 0, unitPrice: 0 })).toBe(false)
  })

  it('recognises a price that they do not', () => {
    expect(isPriceOverridden({ unitCost: 1500, markupPercent: 0, unitPrice: 1000 })).toBe(true)
    expect(isPriceOverridden({ unitCost: 0, markupPercent: 0, unitPrice: 1000 })).toBe(true)
  })

  it('reloads a hand-priced line as still hand-priced', () => {
    const saved = { unitCost: 1500, markupPercent: -33.3, unitPrice: 1000 }
    const row: Row = { ...saved, priceOverridden: isPriceOverridden(saved) }
    expect(type(row, 'unitCost', '2000').unitPrice).toBe(1000)
  })
})

describe('a line priced below its cost', () => {
  it('is saveable, because the markup schemas accept a negative margin', async () => {
    // Guards the fix above: entering a price under the cost now yields a
    // negative markup, and a schema flooring markup at 0 would reject the row
    // on save rather than at the point it was typed.
    const { quotePartSchema } = await import('@/features/quotes/Schema/quoteSchema')
    const { servicePartSchema } = await import('@/features/vehicles/Schema/serviceSchema')
    const row = {
      name: 'Brake pads',
      quantity: 1,
      unitCost: 1500,
      markupPercent: -33.3,
      unitPrice: 1000,
      total: 1000,
    }
    expect(quotePartSchema.parse(row).markupPercent).toBe(-33.3)
    expect(servicePartSchema.parse(row).markupPercent).toBe(-33.3)
  })

  it('drops the client-only override flag rather than sending it on', async () => {
    // It describes how the row was edited, and Prisma would reject the column.
    const { quotePartSchema } = await import('@/features/quotes/Schema/quoteSchema')
    const parsed = quotePartSchema.parse({
      name: 'Brake pads',
      unitPrice: 1000,
      priceOverridden: true,
    })
    expect(parsed).not.toHaveProperty('priceOverridden')
  })
})

describe('what the markup field shows while a cost is being typed', () => {
  const withPrice = type(freshRow, 'unitPrice', '1000')

  it('never shows a margin invented from a half-typed cost', () => {
    // Typing 1500 passes through 1, 15 and 150. Deriving a margin from those
    // put 99900% on screen, then 6566.7%, then 566.7%.
    const shown = keystrokes(withPrice, 'unitCost', '1500').map((r) => r.markupPercent)
    expect(shown).toEqual([0, 0, 0, 0])
  })

  it('states the real margin once the field is left', () => {
    expect(type(withPrice, 'unitCost', '1500').markupPercent).toBe(-33.3)
  })

  it('holds the price throughout', () => {
    const shown = keystrokes(withPrice, 'unitCost', '1500').map((r) => r.unitPrice)
    expect(shown).toEqual([1000, 1000, 1000, 1000])
  })

  it('still tracks the cost live when the price is following it', () => {
    // Nothing typed over the price, so it should mirror the cost as it is
    // entered rather than sitting still.
    const shown = keystrokes(freshRow, 'unitCost', '1500').map((r) => r.unitPrice)
    expect(shown).toEqual([1, 15, 150, 1500])
  })
})
