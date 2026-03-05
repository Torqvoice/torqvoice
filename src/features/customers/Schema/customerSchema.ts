import { z } from "zod";

export const createCustomerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").nullish().or(z.literal("")),
  phone: z.string().nullish(),
  address: z.string().nullish(),
  company: z.string().nullish(),
  notes: z.string().nullish(),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  id: z.string(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
