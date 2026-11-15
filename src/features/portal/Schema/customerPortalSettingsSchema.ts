import { z } from 'zod'
import { isStoredUploadUrl } from '@/lib/upload-url'
import { normalizeAccent, PORTAL_THEMES } from '../Lib/theme'

/**
 * What the Customer Portal settings page saves, in one go: whether the portal
 * is on, its address, the text about the workshop, how it looks and which of
 * its optional parts customers get.
 *
 * Pure, so the form checks the same rules the action enforces.
 */

/** A portal address: 3 to 48 lowercase letters, digits, hyphens or underscores. */
const PORTAL_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{1,46}[a-z0-9]$/

/** Words that are, or may become, routes beside a workshop's portal. */
const RESERVED_PORTAL_SLUGS = [
  'auth',
  'api',
  'admin',
  'login',
  'verify',
  'dashboard',
  'settings',
  'portal',
]

/** Why an address was refused. "slugTaken" only the server can know. */
export type PortalSlugProblem = 'slugInvalid' | 'slugReserved' | 'slugTaken'

/**
 * The address as it would be stored (null for "use the default address"), or
 * what is wrong with it.
 */
export function checkPortalSlug(
  raw: string | null | undefined
): { slug: string | null; problem?: undefined } | { slug?: undefined; problem: PortalSlugProblem } {
  const slug = raw?.trim().toLowerCase() ?? ''
  if (!slug) return { slug: null }
  if (!PORTAL_SLUG_PATTERN.test(slug)) return { problem: 'slugInvalid' }
  if (RESERVED_PORTAL_SLUGS.includes(slug)) return { problem: 'slugReserved' }
  return { slug }
}

export const customerPortalSettingsSchema = z.object({
  enabled: z.boolean(),
  /** Empty for the default address. Its rules are `checkPortalSlug`'s. */
  slug: z.string().trim().max(100),
  description: z.string().max(5000),
  theme: z.enum(PORTAL_THEMES),
  /** "#RRGGBB", or empty for the theme's own colour. */
  accent: z
    .string()
    .trim()
    .refine((value) => value === '' || normalizeAccent(value) !== null, 'Not a colour'),
  /** The stored url of the uploaded cover photo, or empty for none. */
  cover: z.string().refine((value) => value === '' || isStoredUploadUrl(value), 'Not an upload'),
  messages: z.boolean(),
  /** Left out by a workshop without the tyre hotel: the setting is not touched. */
  showTires: z.boolean().optional(),
})

export type CustomerPortalSettingsInput = z.infer<typeof customerPortalSettingsSchema>

/** What a save answers: done, or the address it refused. */
export type SaveCustomerPortalSettingsResult =
  | { saved: true; slug: string | null }
  | { saved: false; problem: PortalSlugProblem }
