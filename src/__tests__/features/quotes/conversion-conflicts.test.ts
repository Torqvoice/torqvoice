/**
 * Where a quote and the open work order it is being added to disagree.
 *
 * The lines come across either way. A percentage discount, a different tax
 * basis and a warranty the customer accepted are standing answers the job
 * cannot hold twice, so each is named for the dialog to ask about, and the
 * action refuses to go ahead while one is unanswered.
 */

import { describe, it, expect } from 'vitest'
import {
  conversionConflicts,
  unresolvedConflicts,
  resolutionsSchema,
} from '@/features/quotes/Lib/conversionConflicts'

const quote = {
  discountAmount: 0,
  taxRate: 25,
  taxInclusive: false,
  taxComponents: null,
  warrantyStatus: null,
  warrantyMonths: null,
  warrantyMileage: null,
  warrantyNotes: null,
}

const job = {
  subtotal: 400,
  discountType: null as string | null,
  discountValue: 0,
  taxRate: 25,
  taxInclusive: false,
  taxComponents: null,
  warrantyStatus: null,
  warrantyMonths: null,
  warrantyMileage: null,
  warrantyNotes: null,
}

describe('conversionConflicts', () => {
  it('finds none when the two agree', () => {
    expect(conversionConflicts(quote, job)).toEqual([])
  })

  describe('discount', () => {
    it("is a question only when the job's is a percentage and the quote has one", () => {
      const pct = { ...job, discountType: 'percentage', discountValue: 10 }
      expect(conversionConflicts({ ...quote, discountAmount: 20 }, pct)).toEqual([
        { kind: 'discount', job: { percent: 10, amount: 40 }, quote: { amount: 20 } },
      ])
      // A fixed one, or none, takes the quote's amount on top without asking.
      expect(
        conversionConflicts(
          { ...quote, discountAmount: 20 },
          { ...job, discountType: 'fixed', discountValue: 5 }
        )
      ).toEqual([])
      expect(conversionConflicts({ ...quote, discountAmount: 20 }, job)).toEqual([])
      // A quote with no discount leaves a percentage job alone.
      expect(conversionConflicts(quote, pct)).toEqual([])
    })
  })

  describe('tax', () => {
    it('is a question when the rate differs', () => {
      expect(conversionConflicts({ ...quote, taxRate: 0 }, job)).toEqual([
        {
          kind: 'tax',
          job: { rate: 25, inclusive: false, components: null },
          quote: { rate: 0, inclusive: false, components: null },
        },
      ])
    })

    it('is a question when one includes tax in the lines and the other adds it', () => {
      const [conflict] = conversionConflicts({ ...quote, taxInclusive: true }, job)
      expect(conflict).toMatchObject({ kind: 'tax', quote: { inclusive: true } })
    })

    it('is a question when the split differs, and not when it is the same split', () => {
      const split = [
        { name: 'GST', rate: 5, amount: 0 },
        { name: 'QST', rate: 9.975, amount: 0 },
      ]
      const splitJob = { ...job, taxRate: 14.975, taxComponents: split }
      expect(
        conversionConflicts({ ...quote, taxRate: 14.975, taxComponents: split }, splitJob)
      ).toEqual([])
      const [conflict] = conversionConflicts({ ...quote, taxRate: 14.975 }, splitJob)
      expect(conflict).toMatchObject({
        kind: 'tax',
        job: {
          components: [
            { name: 'GST', rate: 5 },
            { name: 'QST', rate: 9.975 },
          ],
        },
        quote: { components: null },
      })
    })
  })

  describe('warranty', () => {
    it('is a question when the quote states one the job does not carry', () => {
      const offered = { ...quote, warrantyStatus: 'included', warrantyMonths: 12 }
      expect(conversionConflicts(offered, job)).toEqual([
        {
          kind: 'warranty',
          job: {
            warrantyStatus: null,
            warrantyMonths: null,
            warrantyMileage: null,
            warrantyNotes: null,
          },
          quote: {
            warrantyStatus: 'included',
            warrantyMonths: 12,
            warrantyMileage: null,
            warrantyNotes: null,
          },
        },
      ])
      // "Not included" is a statement too, and differs from saying nothing.
      expect(conversionConflicts({ ...quote, warrantyStatus: 'not_included' }, job)).toHaveLength(1)
    })

    it('is no question when the quote says nothing, or says the same', () => {
      const withWarranty = { ...job, warrantyStatus: 'included', warrantyMonths: 12 }
      expect(conversionConflicts(quote, withWarranty)).toEqual([])
      expect(
        conversionConflicts(
          { ...quote, warrantyStatus: 'included', warrantyMonths: 12 },
          withWarranty
        )
      ).toEqual([])
    })
  })

  it('lists every disagreement, discount first', () => {
    const kinds = conversionConflicts(
      { ...quote, discountAmount: 20, taxRate: 0, warrantyStatus: 'not_included' },
      { ...job, discountType: 'percentage', discountValue: 10 }
    ).map((c) => c.kind)
    expect(kinds).toEqual(['discount', 'tax', 'warranty'])
  })
})

describe('unresolvedConflicts', () => {
  it('names the conflicts the answers leave out', () => {
    const conflicts = conversionConflicts(
      { ...quote, discountAmount: 20, taxRate: 0 },
      { ...job, discountType: 'percentage', discountValue: 10 }
    )
    expect(unresolvedConflicts(conflicts, undefined)).toEqual(['discount', 'tax'])
    expect(unresolvedConflicts(conflicts, { discount: 'combine' })).toEqual(['tax'])
    expect(unresolvedConflicts(conflicts, { discount: 'keepJob', tax: 'useQuote' })).toEqual([])
  })
})

describe('resolutionsSchema', () => {
  it('accepts the known answers and refuses made-up ones', () => {
    expect(resolutionsSchema.safeParse({}).success).toBe(true)
    expect(resolutionsSchema.safeParse({ discount: 'combine', tax: 'keepJob' }).success).toBe(true)
    expect(resolutionsSchema.safeParse({ discount: 'drop' }).success).toBe(false)
    expect(resolutionsSchema.safeParse({ title: 'useQuote' }).success).toBe(false)
  })
})
