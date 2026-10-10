import { z } from 'zod'
import { discountAmountFor } from '@/lib/tax'
import { parseTaxComponents } from '@/lib/tax-components'
import { normalizeWarranty, type WarrantyFields } from '@/lib/warranty'

/**
 * Where a quote and the open work order it is being added to disagree.
 *
 * The lines come across either way. What cannot be decided for the user is
 * which of two standing answers the job should carry afterwards: its own, or
 * the quote's, which is what the customer accepted. Each disagreement is
 * named here, the dialog asks, and the action refuses to go ahead until
 * every one it finds has an answer.
 */

export const discountResolutions = ['keepJob', 'combine'] as const
export const taxResolutions = ['keepJob', 'useQuote'] as const
export const warrantyResolutions = ['keepJob', 'useQuote'] as const

export const resolutionsSchema = z
  .object({
    discount: z.enum(discountResolutions).optional(),
    tax: z.enum(taxResolutions).optional(),
    warranty: z.enum(warrantyResolutions).optional(),
  })
  .strict()

export type ConversionResolutions = z.infer<typeof resolutionsSchema>

/** How a document is taxed: the rate, whether lines include it, and any split. */
export interface TaxBasis {
  rate: number
  inclusive: boolean
  components: { name: string; rate: number }[] | null
}

export type ConversionConflict =
  | {
      kind: 'discount'
      /** The job's percentage, and what it comes to on the job as it stands. */
      job: { percent: number; amount: number }
      quote: { amount: number }
    }
  | { kind: 'tax'; job: TaxBasis; quote: TaxBasis }
  | { kind: 'warranty'; job: WarrantyFields; quote: WarrantyFields }

export type ConflictKind = ConversionConflict['kind']

export interface QuoteForConflicts {
  discountAmount: number
  taxRate: number
  taxInclusive: boolean
  taxComponents: unknown
  warrantyStatus: string | null
  warrantyMonths: number | null
  warrantyMileage: number | null
  warrantyNotes: string | null
}

export interface JobForConflicts {
  subtotal: number
  discountType: string | null
  discountValue: number
  taxRate: number
  taxInclusive: boolean
  taxComponents: unknown
  warrantyStatus: string | null
  warrantyMonths: number | null
  warrantyMileage: number | null
  warrantyNotes: string | null
}

export function taxBasisOf(doc: {
  taxRate: number
  taxInclusive: boolean
  taxComponents: unknown
}): TaxBasis {
  const components = parseTaxComponents(doc.taxComponents)
  return {
    rate: doc.taxRate,
    inclusive: doc.taxInclusive,
    components: components
      ? components.map((component) => ({ name: component.name, rate: component.rate }))
      : null,
  }
}

function sameTax(a: TaxBasis, b: TaxBasis): boolean {
  if (Math.abs(a.rate - b.rate) > 0.0001 || a.inclusive !== b.inclusive) return false
  const left = a.components ?? []
  const right = b.components ?? []
  if (left.length !== right.length) return false
  return left.every(
    (component, i) =>
      component.name === right[i].name && Math.abs(component.rate - right[i].rate) <= 0.0001
  )
}

function sameWarranty(a: WarrantyFields, b: WarrantyFields): boolean {
  return (
    a.warrantyStatus === b.warrantyStatus &&
    a.warrantyMonths === b.warrantyMonths &&
    a.warrantyMileage === b.warrantyMileage &&
    a.warrantyNotes === b.warrantyNotes
  )
}

/**
 * Every disagreement between the quote and the job, in the order the dialog
 * lists them.
 *
 * A discount is only a question when the job's is a percentage and the quote
 * has one: a fixed one, or none, takes the quote's amount on top without
 * asking. Tax is a question whenever the two are priced differently. A
 * warranty is a question only when the quote states one: a quote that said
 * nothing leaves the job's standing answer alone.
 */
export function conversionConflicts(
  quote: QuoteForConflicts,
  job: JobForConflicts
): ConversionConflict[] {
  const conflicts: ConversionConflict[] = []

  if (job.discountType === 'percentage' && job.discountValue > 0 && quote.discountAmount > 0) {
    conflicts.push({
      kind: 'discount',
      job: {
        percent: job.discountValue,
        amount: discountAmountFor(job.subtotal, 'percentage', job.discountValue),
      },
      quote: { amount: quote.discountAmount },
    })
  }

  const jobTax = taxBasisOf(job)
  const quoteTax = taxBasisOf(quote)
  if (!sameTax(jobTax, quoteTax)) conflicts.push({ kind: 'tax', job: jobTax, quote: quoteTax })

  const quoteWarranty = normalizeWarranty(quote)
  const jobWarranty = normalizeWarranty(job)
  if (quoteWarranty.warrantyStatus && !sameWarranty(quoteWarranty, jobWarranty)) {
    conflicts.push({ kind: 'warranty', job: jobWarranty, quote: quoteWarranty })
  }

  return conflicts
}

/** The conflicts the given answers leave unanswered. */
export function unresolvedConflicts(
  conflicts: ConversionConflict[],
  resolutions: ConversionResolutions | null | undefined
): ConflictKind[] {
  return conflicts.map((c) => c.kind).filter((kind) => !resolutions?.[kind])
}
