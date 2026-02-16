import { z } from "zod";

const recurringPartSchema = z.object({
  name: z.string().min(1),
  partNumber: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().min(0).default(0),
});

const recurringLaborSchema = z.object({
  description: z.string().min(1),
  hours: z.number().min(0).default(0),
  rate: z.number().min(0).default(0),
});

export const createRecurringInvoiceSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "yearly"]),
  nextRunDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  vehicleId: z.string().min(1, "Vehicle is required"),
  type: z.string().default("maintenance"),
  cost: z.number().min(0).default(0),
  taxRate: z.number().min(0).max(100).default(0),
  invoiceNotes: z.string().optional(),
  templateParts: z.array(recurringPartSchema).default([]),
  templateLabor: z.array(recurringLaborSchema).default([]),
});

export const updateRecurringInvoiceSchema = createRecurringInvoiceSchema.partial().extend({
  id: z.string().min(1),
});

export type CreateRecurringInvoiceInput = z.infer<typeof createRecurringInvoiceSchema>;
export type UpdateRecurringInvoiceInput = z.infer<typeof updateRecurringInvoiceSchema>;
