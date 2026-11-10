import { z } from 'zod'
import { imageUrlSchema } from '@/lib/upload-url'
import { MAX_PART_TAGS, MAX_TAG_LENGTH } from '../Lib/partTags'
import { supplierUrlSchema } from '../Lib/supplierUrl'

export const createInventoryPartSchema = z.object({
  name: z.string().min(1, 'Part name is required'),
  partNumber: z.string().optional(),
  barcode: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  quantity: z.coerce.number().min(0, 'Quantity must be 0 or more').default(0),
  minQuantity: z.coerce.number().min(0, 'Min quantity must be 0 or more').default(0),
  unit: z.string().max(20).optional(),
  unitCost: z.coerce.number().min(0, 'Unit cost must be 0 or more').default(0),
  sellPrice: z.coerce.number().min(0, 'Sell price must be 0 or more').default(0),
  supplier: z.string().optional(),
  supplierPhone: z.string().optional(),
  supplierEmail: z.string().optional(),
  supplierUrl: supplierUrlSchema.optional().or(z.literal('')),
  gallery: z
    .array(
      z.object({
        id: z.string().optional(),
        url: imageUrlSchema,
        fileName: z.string().optional(),
        description: z.string().optional(),
        sortOrder: z.number().int().default(0),
      })
    )
    .optional()
    .default([]),
  location: z.string().optional(),
  // No default: on an update, leaving tags out keeps the part's own, and a
  // page opened before tags existed sends none.
  tags: z
    .array(
      z.string().trim().max(MAX_TAG_LENGTH, `A tag can be at most ${MAX_TAG_LENGTH} characters`)
    )
    .max(MAX_PART_TAGS, `A part can have at most ${MAX_PART_TAGS} tags`)
    .optional(),
})

export const updateInventoryPartSchema = createInventoryPartSchema.partial().extend({
  id: z.string(),
})

export const adjustStockSchema = z.object({
  id: z.string(),
  adjustment: z.number(),
})

export type CreateInventoryPartInput = z.infer<typeof createInventoryPartSchema>
export type UpdateInventoryPartInput = z.infer<typeof updateInventoryPartSchema>
