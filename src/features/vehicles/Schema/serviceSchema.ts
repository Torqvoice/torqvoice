import { z } from 'zod'

export const servicePartSchema = z.object({
  partNumber: z.string().optional(),
  name: z.string().min(1, 'Part name is required'),
  quantity: z.coerce.number().min(0).default(1),
  /** Unit of measure snapshotted from the picked inventory part. */
  unit: z.string().nullish(),
  unitPrice: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0).default(0),
  unitCost: z.coerce.number().min(0).default(0),
  /**
   * Selling below cost is a real decision (a goodwill line, matching a price),
   * and the markup has to be able to say so. Floored at -100, which is giving
   * the part away: anything lower would imply a negative price, which
   * unitPrice already refuses.
   */
  markupPercent: z.coerce.number().min(-100).default(0),
  inventoryPartId: z.string().optional(),
})

export const serviceLaborSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  hours: z.coerce.number().min(0).default(0),
  rate: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0).default(0),
  pricingType: z.enum(['hourly', 'service']).default('hourly'),
})

export const serviceAttachmentSchema = z.object({
  fileName: z.string(),
  fileUrl: z.string(),
  fileType: z.string(),
  fileSize: z.number(),
  category: z.enum(['image', 'diagnostic', 'document', 'video']).default('diagnostic'),
  description: z.string().optional(),
  includeInInvoice: z.boolean().default(true),
})

/**
 * One thing the customer asked about.
 *
 * The id is what separates this from the parts and labour arrays beside it.
 * Those are replaced wholesale on every save, which is fine because nothing
 * points at them. Findings point at concerns, so a concern that survives an
 * edit has to keep its id or the link from its diagnosis is quietly cut.
 */
export const serviceConcernSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1, 'Concern is required'),
  sortOrder: z.coerce.number().int().min(0).default(0),
})

export const createServiceSchema = z.object({
  // null = parts-only / counter sale (no vehicle); customerId is required then
  vehicleId: z.string().nullable(),
  customerId: z.string().nullable().optional(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  type: z.enum(['maintenance', 'repair', 'upgrade', 'inspection']).default('maintenance'),
  status: z.enum(['pending', 'in-progress', 'waiting-parts', 'completed']).default('pending'),
  cost: z.coerce.number().min(0).default(0),
  mileage: z.coerce.number().optional(),
  serviceDate: z.string().default(() => new Date().toISOString()),
  shopName: z.string().optional(),
  techName: z.string().optional(),
  parts: z.string().optional(),
  laborHours: z.coerce.number().optional(),
  diagnosticNotes: z.string().optional(),
  invoiceNotes: z.string().optional(),
  concerns: z.array(serviceConcernSchema).optional(),
  partItems: z.array(servicePartSchema).optional(),
  laborItems: z.array(serviceLaborSchema).optional(),
  attachments: z.array(serviceAttachmentSchema).optional(),
  subtotal: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).default(0),
  taxAmount: z.coerce.number().min(0).default(0),
  taxInclusive: z.boolean().default(false),
  totalAmount: z.coerce.number().min(0).default(0),
  discountType: z.enum(['none', 'percentage', 'fixed']).optional(),
  discountValue: z.coerce.number().min(0).default(0),
  discountAmount: z.coerce.number().min(0).default(0),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().optional(),
  invoiceDueDate: z.string().optional(),
  warrantyMonths: z.coerce.number().int().min(0).optional(),
  warrantyMileage: z.coerce.number().int().min(0).optional(),
  warrantyNotes: z.string().optional(),
})

export const updateServiceSchema = createServiceSchema.partial().extend({
  id: z.string(),
})

export type ServiceAttachmentInput = z.infer<typeof serviceAttachmentSchema>
export type ServiceConcernInput = z.infer<typeof serviceConcernSchema>
/**
 * The editor also tracks whether the price was typed over the cost-and-markup
 * formula, so a later edit to the cost restates the margin instead of
 * overwriting what was entered. It describes how the row was edited rather
 * than anything about the part, so it is client-only: the schema above has no
 * such field and strips it on save.
 */
export type ServicePartInput = z.infer<typeof servicePartSchema> & {
  priceOverridden?: boolean
}
export type ServiceLaborInput = z.infer<typeof serviceLaborSchema>
export type CreateServiceInput = z.infer<typeof createServiceSchema>
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>
