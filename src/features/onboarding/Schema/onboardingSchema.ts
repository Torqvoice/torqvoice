import { z } from 'zod'

export const onboardingSchema = z.object({
  workshopName: z
    .string()
    .min(2, 'Workshop name must be at least 2 characters')
    .max(100, 'Workshop name must be at most 100 characters')
    .trim(),
  loadSampleData: z.boolean().default(true),
  /** IANA zone the browser reported, stored as the workshop's explicit zone. */
  timeZone: z.string().max(64).optional(),
})

export type OnboardingInput = z.infer<typeof onboardingSchema>
