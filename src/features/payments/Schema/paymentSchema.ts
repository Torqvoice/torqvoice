import { z } from "zod";

export const createPaymentSchema = z.object({
  serviceRecordId: z.string(),
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  date: z.string().default(() => new Date().toISOString()),
  method: z.enum(["cash", "card", "transfer", "other"]).default("other"),
  note: z.string().optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
