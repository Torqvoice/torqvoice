import { z } from "zod";

export const createInventoryPartSchema = z.object({
  name: z.string().min(1, "Part name is required"),
  partNumber: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  quantity: z.coerce.number().int().min(0, "Quantity must be 0 or more").default(0),
  minQuantity: z.coerce.number().int().min(0, "Min quantity must be 0 or more").default(0),
  unitCost: z.coerce.number().min(0, "Unit cost must be 0 or more").default(0),
  supplier: z.string().optional(),
  supplierPhone: z.string().optional(),
  supplierEmail: z.string().optional(),
  supplierUrl: z.string().url().optional().or(z.literal("")),
  imageUrl: z.string().url().optional().or(z.literal("")),
  location: z.string().optional(),
});

export const updateInventoryPartSchema = createInventoryPartSchema.partial().extend({
  id: z.string(),
});

export const adjustStockSchema = z.object({
  id: z.string(),
  adjustment: z.number().int(),
});

export type CreateInventoryPartInput = z.infer<typeof createInventoryPartSchema>;
export type UpdateInventoryPartInput = z.infer<typeof updateInventoryPartSchema>;
