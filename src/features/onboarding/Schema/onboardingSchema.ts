import { z } from 'zod'
import { locales } from '@/i18n/config'
import { isCountryCode } from '@/lib/country-defaults'
import { currencyDefinition } from '@/lib/currencies'
import { SETUP_DATE_FORMATS } from '../Lib/setupDraft'

const metricOrImperial = z.enum(['metric', 'imperial'])

/** What the four setup steps decide; the action writes each into its setting. */
export const setupSchema = z.object({
  country: z.string().refine(isCountryCode, 'Unknown country').optional(),
  serviceType: z.enum(['automotive', 'marine']),
  engineSizeUnit: z.enum(['litres', 'cc']),
  locale: z.enum(locales),
  forceCustomerLocale: z.boolean(),
  currencyCode: z.string().refine((code) => Boolean(currencyDefinition(code)), 'Unknown currency'),
  dateFormat: z.enum(SETUP_DATE_FORMATS),
  timeFormat: z.enum(['12h', '24h']),
  unitSystem: metricOrImperial,
  measureSystem: metricOrImperial,
  /** "+33", or empty when the owner cleared it. */
  dialCode: z.union([z.literal(''), z.string().regex(/^\+\d{1,4}$/, 'Use + and digits, like +44')]),
  tax: z.object({
    enabled: z.boolean(),
    rate: z.number().min(0).max(100),
    label: z.string().trim().max(40),
    inclusive: z.boolean(),
  }),
  address: z.string().trim().max(500),
})

export const onboardingSchema = z.object({
  workshopName: z
    .string()
    .min(2, 'Workshop name must be at least 2 characters')
    .max(100, 'Workshop name must be at most 100 characters')
    .trim(),
  loadSampleData: z.boolean().default(true),
  /** IANA zone the owner confirmed, stored as the workshop's explicit zone. */
  timeZone: z.string().max(64).optional(),
  /** The guided setup. Absent from older clients, which get the defaults as before. */
  setup: setupSchema.optional(),
})

export type OnboardingInput = z.infer<typeof onboardingSchema>
export type SetupInput = z.infer<typeof setupSchema>
