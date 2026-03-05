import { z } from "zod";

export const createVehicleSchema = z.object({
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.coerce
    .number()
    .min(1900, "Year must be after 1900")
    .max(new Date().getFullYear() + 2, "Year is too far in the future"),
  vin: z.string().nullish(),
  licensePlate: z.string().nullish(),
  color: z.string().nullish(),
  mileage: z.coerce.number().min(0).default(0),
  fuelType: z.string().nullish(),
  transmission: z.string().nullish(),
  engineSize: z.string().nullish(),
  purchaseDate: z.string().nullish(),
  purchasePrice: z.preprocess(
    (v) => (v === null || v === undefined || v === "" ? undefined : v),
    z.coerce.number().optional(),
  ),
  imageUrl: z.string().nullish(),
  customerId: z.string().nullish(),
});

export const updateVehicleSchema = createVehicleSchema.partial().extend({
  id: z.string(),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
