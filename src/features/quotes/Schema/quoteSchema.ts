import { z } from 'zod'

export const quotePartSchema = z.object({
  partNumber: z.string().optional(),
  name: z.string().min(1, 'Part name is required'),
  quantity: z.coerce.number().min(0).default(1),
  /** Unit of measure snapshotted from the picked inventory part. */
  unit: z.string().nullish(),
  unitCost: z.coerce.number().min(0).default(0),
  /**
   * Selling below cost is a real decision (a goodwill line, matching a price),
   * and the markup has to be able to say so. Floored at -100, which is giving
   * the part away: anything lower would imply a negative price, which
   * unitPrice already refuses.
   */
  markupPercent: z.coerce.number().min(-100).default(0),
  unitPrice: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0).default(0),
  excluded: z.boolean().optional().default(false),
  /**
   * Set when the line was picked from stock. Carried through to ServicePart on
   * conversion so the resulting job deducts this exact inventory item.
   */
  inventoryPartId: z.string().nullish(),
})

export const quoteLaborSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  hours: z.coerce.number().min(0).default(0),
  rate: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0).default(0),
  pricingType: z.enum(['hourly', 'service']).default('hourly'),
  excluded: z.boolean().optional().default(false),
})

export const quoteAttachmentSchema = z.object({
  fileName: z.string(),
  fileUrl: z.string(),
  fileType: z.string(),
  fileSize: z.number(),
  category: z.enum(['image', 'document']).default('image'),
  description: z.string().optional(),
  includeInInvoice: z.boolean().default(true),
})

export const createQuoteSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  status: z
    .enum(['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted', 'changes_requested'])
    .default('draft'),
  validUntil: z.string().optional(),
  customerId: z.string().optional(),
  vehicleId: z.string().optional(),
  partItems: z.array(quotePartSchema).optional(),
  laborItems: z.array(quoteLaborSchema).optional(),
  subtotal: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).default(0),
  taxAmount: z.coerce.number().min(0).default(0),
  taxInclusive: z.boolean().default(false),
  discountType: z.enum(['none', 'percentage', 'fixed']).optional(),
  discountValue: z.coerce.number().min(0).default(0),
  discountAmount: z.coerce.number().min(0).default(0),
  totalAmount: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
  inspectionId: z.string().optional(),
})

export const updateQuoteSchema = createQuoteSchema.partial().extend({
  id: z.string(),
})

export type QuoteAttachmentInput = z.infer<typeof quoteAttachmentSchema>
/**
 * The editor also tracks whether the price was typed over the cost-and-markup
 * formula, so a later edit to the cost restates the margin instead of
 * overwriting what was entered. It describes how the row was edited rather
 * than anything about the part, so it is client-only: the schema above has no
 * such field and strips it on save.
 */
export type QuotePartInput = z.infer<typeof quotePartSchema> & {
  priceOverridden?: boolean
}
export type QuoteLaborInput = z.infer<typeof quoteLaborSchema>
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>
