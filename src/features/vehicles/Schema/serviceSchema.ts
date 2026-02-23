import { z } from "zod";

export const servicePartSchema = z.object({
  partNumber: z.string().optional(),
  name: z.string().min(1, "Part name is required"),
  quantity: z.coerce.number().min(0).default(1),
  unitPrice: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0).default(0),
  inventoryPartId: z.string().optional(),
});

export const serviceLaborSchema = z.object({
  description: z.string().min(1, "Description is required"),
  hours: z.coerce.number().min(0).default(0),
  rate: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0).default(0),
});

export const serviceAttachmentSchema = z.object({
  fileName: z.string(),
  fileUrl: z.string(),
  fileType: z.string(),
  fileSize: z.number(),
  category: z.enum(["image", "diagnostic", "document", "video"]).default("diagnostic"),
  description: z.string().optional(),
  includeInInvoice: z.boolean().default(true),
});

export const createServiceSchema = z.object({
  vehicleId: z.string(),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  type: z.enum(["maintenance", "repair", "upgrade", "inspection"]).default("maintenance"),
  status: z.enum(["pending", "in-progress", "waiting-parts", "completed"]).default("pending"),
  cost: z.coerce.number().min(0).default(0),
  mileage: z.coerce.number().optional(),
  serviceDate: z.string().default(() => new Date().toISOString()),
  shopName: z.string().optional(),
  techName: z.string().optional(),
  parts: z.string().optional(),
  laborHours: z.coerce.number().optional(),
  diagnosticNotes: z.string().optional(),
  invoiceNotes: z.string().optional(),
  partItems: z.array(servicePartSchema).optional(),
  laborItems: z.array(serviceLaborSchema).optional(),
  attachments: z.array(serviceAttachmentSchema).optional(),
  subtotal: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).default(0),
  taxAmount: z.coerce.number().min(0).default(0),
  totalAmount: z.coerce.number().min(0).default(0),
  discountType: z.enum(["none", "percentage", "fixed"]).optional(),
  discountValue: z.coerce.number().min(0).default(0),
  discountAmount: z.coerce.number().min(0).default(0),
  invoiceNumber: z.string().optional(),
});

export const updateServiceSchema = createServiceSchema.partial().extend({
  id: z.string(),
});

export type ServiceAttachmentInput = z.infer<typeof serviceAttachmentSchema>;
export type ServicePartInput = z.infer<typeof servicePartSchema>;
export type ServiceLaborInput = z.infer<typeof serviceLaborSchema>;
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
