import { z } from "zod";

export const quotePartSchema = z.object({
  partNumber: z.string().nullish(),
  name: z.string().min(1, "Part name is required"),
  quantity: z.coerce.number().min(0).default(1),
  unitPrice: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0).default(0),
  excluded: z.boolean().optional().default(false),
});

export const quoteLaborSchema = z.object({
  description: z.string().min(1, "Description is required"),
  hours: z.coerce.number().min(0).default(0),
  rate: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0).default(0),
  excluded: z.boolean().optional().default(false),
});

export const quoteAttachmentSchema = z.object({
  fileName: z.string(),
  fileUrl: z.string(),
  fileType: z.string(),
  fileSize: z.number(),
  category: z.enum(["image", "document"]).default("image"),
  description: z.string().nullish(),
  includeInInvoice: z.boolean().default(true),
});

export const createQuoteSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().nullish(),
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired", "converted", "changes_requested"]).default("draft"),
  validUntil: z.string().nullish(),
  customerId: z.string().nullish(),
  vehicleId: z.string().nullish(),
  partItems: z.array(quotePartSchema).nullish(),
  laborItems: z.array(quoteLaborSchema).nullish(),
  subtotal: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).default(0),
  taxAmount: z.coerce.number().min(0).default(0),
  discountType: z.enum(["none", "percentage", "fixed"]).nullish(),
  discountValue: z.coerce.number().min(0).default(0),
  discountAmount: z.coerce.number().min(0).default(0),
  totalAmount: z.coerce.number().min(0).default(0),
  notes: z.string().nullish(),
  inspectionId: z.string().nullish(),
});

export const updateQuoteSchema = createQuoteSchema.partial().extend({
  id: z.string(),
});

export type QuoteAttachmentInput = z.infer<typeof quoteAttachmentSchema>;
export type QuotePartInput = z.infer<typeof quotePartSchema>;
export type QuoteLaborInput = z.infer<typeof quoteLaborSchema>;
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
