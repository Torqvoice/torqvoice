import { z } from "zod";

export const quotePartSchema = z.object({
  partNumber: z.string().optional(),
  name: z.string().min(1, "Part name is required"),
  quantity: z.coerce.number().min(0).default(1),
  unitPrice: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0).default(0),
});

export const quoteLaborSchema = z.object({
  description: z.string().min(1, "Description is required"),
  hours: z.coerce.number().min(0).default(0),
  rate: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0).default(0),
});

export const quoteAttachmentSchema = z.object({
  fileName: z.string(),
  fileUrl: z.string(),
  fileType: z.string(),
  fileSize: z.number(),
  category: z.enum(["image", "document"]).default("image"),
  description: z.string().optional(),
  includeInInvoice: z.boolean().default(true),
});

export const createQuoteSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired", "converted", "changes_requested"]).default("draft"),
  validUntil: z.string().optional(),
  customerId: z.string().optional(),
  vehicleId: z.string().optional(),
  partItems: z.array(quotePartSchema).optional(),
  laborItems: z.array(quoteLaborSchema).optional(),
  subtotal: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).default(0),
  taxAmount: z.coerce.number().min(0).default(0),
  discountType: z.enum(["none", "percentage", "fixed"]).optional(),
  discountValue: z.coerce.number().min(0).default(0),
  discountAmount: z.coerce.number().min(0).default(0),
  totalAmount: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
  inspectionId: z.string().optional(),
});

export const updateQuoteSchema = createQuoteSchema.partial().extend({
  id: z.string(),
});

export type QuoteAttachmentInput = z.infer<typeof quoteAttachmentSchema>;
export type QuotePartInput = z.infer<typeof quotePartSchema>;
export type QuoteLaborInput = z.infer<typeof quoteLaborSchema>;
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
