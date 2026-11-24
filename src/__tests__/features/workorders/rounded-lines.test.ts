/**
 * Line totals are stored to the cent. Everything that compares or adds up
 * lines has to see them the same way, or the page and the server disagree:
 *
 * - The page tells "a line somebody else added" from "a line I just saved"
 *   by content, total included. A save that held a reading back recorded the
 *   page's unrounded total; the refresh brought the server's rounded one; the
 *   line looked new and was saved again (and its stock taken twice).
 * - The subtotal a save stores is what the stored lines add up to.
 */
import { describe, expect, it } from 'vitest'
import { addedLaborLines, savedLaborShape } from '@/features/vehicles/Lib/laborLines'
import { addedPartLines, savedPartShape } from '@/features/vehicles/Lib/partLines'
import { restatedSubtotal, subtotalFromLines } from '@/features/vehicles/Lib/subtotalFromLines'
import type { ServiceLaborInput, ServicePartInput } from '@/features/vehicles/Schema/serviceSchema'
import { createLaborPresetSchema } from '@/features/labor-presets/Schema/laborPresetSchema'
import { servicePartSchema } from '@/features/vehicles/Schema/serviceSchema'
import { fieldErrorsFromZod } from '@/lib/field-errors'

const labor = (total: number): ServiceLaborInput =>
  ({
    description: 'Fit pads',
    hours: 2.5,
    rate: 19.99,
    total,
    pricingType: 'hourly',
  }) as ServiceLaborInput

const part = (total: number): ServicePartInput =>
  ({ name: 'Bolts', partNumber: '', quantity: 3, unitPrice: 0.1, total }) as ServicePartInput

describe('a line the page saved, as the refresh brings it back', () => {
  it('is the same labour line, rounded or not', () => {
    expect(savedLaborShape(labor(49.975)).total).toBe(49.98)
    // What the page acknowledged (unrounded) against what the server stored.
    expect(addedLaborLines([labor(49.975)], [labor(49.98)])).toEqual([])
  })

  it('is the same part line, rounded or not', () => {
    expect(savedPartShape(part(0.30000000000000004)).total).toBe(0.3)
    expect(addedPartLines([part(0.30000000000000004)], [part(0.3)])).toEqual([])
  })

  it('still tells a second line apart', () => {
    expect(addedLaborLines([labor(49.975)], [labor(49.98), labor(49.98)])).toHaveLength(1)
  })
})

describe('what the lines add up to', () => {
  it('adds each line to the cent first', () => {
    expect(subtotalFromLines([], [{ total: 49.975 }, { total: 49.975 }])).toBe(99.96)
    expect(subtotalFromLines([{ total: 0.30000000000000004 }], [{ total: 10 }])).toBe(10.3)
  })

  it('restates the page’s subtotal and its discount only when they disagree', () => {
    expect(
      restatedSubtotal({
        sentSubtotal: 99.96,
        linesSubtotal: 99.96,
        discountType: 'none',
        discountValue: 0,
      })
    ).toBeNull()
    expect(
      restatedSubtotal({
        sentSubtotal: 99.95,
        linesSubtotal: 99.96,
        discountType: 'percentage',
        discountValue: 10,
      })
    ).toEqual({ subtotal: 99.96, discountAmount: 10 })
    expect(
      restatedSubtotal({
        sentSubtotal: 99.95,
        linesSubtotal: 99.96,
        discountType: undefined,
        discountValue: undefined,
      })
    ).toEqual({ subtotal: 99.96, discountAmount: undefined })
  })
})

describe('a line past what any line comes to', () => {
  it('is refused on a work order whatever total was sent', () => {
    const result = servicePartSchema.safeParse({
      name: 'Bolts',
      quantity: 100_000,
      unitPrice: 10_001,
      total: 1,
    })
    expect(result.success).toBe(false)
    expect(fieldErrorsFromZod(result.error!)).toEqual([
      { field: 'total', issue: 'tooLarge', limit: 1_000_000_000 },
    ])
  })

  it('says a priced part needs a quantity above zero, under the quantity', () => {
    const result = servicePartSchema.safeParse({ name: 'Bolts', quantity: 0, unitPrice: 5 })
    expect(fieldErrorsFromZod(result.error!)).toEqual([{ field: 'quantity', issue: 'positive' }])
  })

  it('is refused on a labour preset, for an item and for a part', () => {
    const item = { description: 'Fit', hours: 100_000, rate: 10_001 }
    expect(createLaborPresetSchema.safeParse({ items: [item] }).success).toBe(false)
    expect(
      createLaborPresetSchema.safeParse({
        items: [{ description: 'Fit', hours: 1, rate: 100 }],
        parts: [{ name: 'Bolts', quantity: 100_000, unitPrice: 10_001 }],
      }).success
    ).toBe(false)
    expect(
      createLaborPresetSchema.safeParse({
        items: [{ description: 'Fit', hours: 1000, rate: 1000 }],
        parts: [{ name: 'Bolts', quantity: 1000, unitPrice: 1000 }],
      }).success
    ).toBe(true)
  })
})
