import { z } from 'zod'
import { EMAIL_KINDS } from '../Lib/emailKinds'
import { richDocSchema } from '../Lib/richText'
import {
  BLOCK_ALIGNS,
  DEFAULT_EMAIL_THEME,
  EMAIL_BLOCK_TYPES,
  EMAIL_IMAGE_MAX_WIDTH,
  EMAIL_IMAGE_MIN_WIDTH,
  EMAIL_LOGO_MAX_WIDTH,
  EMAIL_LOGO_MIN_WIDTH,
  isEmailImageUrl,
  isEmailLogoUrl,
  EMAIL_FONT_IDS,
  type EmailFontId,
  type EmailTemplate,
  type SavedEmailTemplate,
  SUMMARY_ROWS,
} from '../Lib/emailTemplate'

/**
 * What a stored template has to look like.
 *
 * Rows are read leniently, the way the issued-invoice snapshot is: a template
 * saved today must still render on the code of several releases from now,
 * which will have block types this one never heard of. An unknown block is
 * dropped rather than throwing, so one bad row cannot stop a mail going out.
 *
 * Colours are hex and fonts are ids, because both end up inside a style
 * attribute in the rendered mail and nothing else may.
 */

const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Not a colour')

export const emailBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(EMAIL_BLOCK_TYPES),
  visible: z.boolean().optional(),
  text: z.string().max(4000).optional(),
  content: richDocSchema.optional(),
  label: z.string().max(120).optional(),
  href: z.string().max(500).optional(),
  align: z.enum(BLOCK_ALIGNS).optional(),
  src: z
    .string()
    .max(300)
    .refine((value) => value === '' || isEmailImageUrl(value), 'Not an email image')
    .optional(),
  alt: z.string().max(200).optional(),
  width: z.number().int().min(EMAIL_IMAGE_MIN_WIDTH).max(EMAIL_IMAGE_MAX_WIDTH).optional(),
  height: z.number().int().min(0).max(120).optional(),
  rows: z.array(z.enum(SUMMARY_ROWS)).max(SUMMARY_ROWS.length).optional(),
})

export const emailThemeSchema = z.object({
  primaryColor: hexColor,
  textColor: hexColor,
  mutedColor: hexColor,
  backgroundColor: hexColor,
  panelColor: hexColor,
  fontFamily: z.enum(EMAIL_FONT_IDS as [EmailFontId, ...EmailFontId[]]),
  showLogo: z.boolean(),
  logoUrl: z
    .string()
    .max(300)
    .refine((value) => value === '' || isEmailLogoUrl(value), 'Not an email logo'),
  logoWidth: z.number().int().min(EMAIL_LOGO_MIN_WIDTH).max(EMAIL_LOGO_MAX_WIDTH),
  buttonRadius: z.number().int().min(0).max(32),
})

export const emailKindSchema = z.enum(EMAIL_KINDS)

export const emailTemplateSchema = z.object({
  kind: emailKindSchema,
  name: z.string().trim().min(1).max(60),
  subject: z.string().trim().min(1).max(200),
  blocks: z.array(emailBlockSchema).min(1).max(40),
  theme: emailThemeSchema,
})

export const saveEmailTemplateSchema = emailTemplateSchema.extend({
  id: z.string().optional(),
})

export type SaveEmailTemplateInput = z.infer<typeof saveEmailTemplateSchema>

/**
 * A stored row read back as a template, filling in whatever it lacks. Returns
 * null only when there is nothing usable at all, which is the caller's cue to
 * fall back to the preset.
 */
export function readStoredTemplate(row: {
  kind: string
  name: string
  subject: string
  blocks: unknown
  theme: unknown
}): EmailTemplate | null {
  const kind = emailKindSchema.safeParse(row.kind)
  if (!kind.success) return null

  const blocks = Array.isArray(row.blocks)
    ? row.blocks.flatMap((block) => {
        const parsed = emailBlockSchema.safeParse(block)
        return parsed.success ? [parsed.data] : []
      })
    : []
  if (blocks.length === 0) return null

  // Theme fields one at a time, so a bad colour costs that colour and not
  // the whole look.
  const theme: Record<string, unknown> = { ...DEFAULT_EMAIL_THEME }
  if (row.theme && typeof row.theme === 'object') {
    const stored = row.theme as Record<string, unknown>
    for (const [key, schema] of Object.entries(emailThemeSchema.shape)) {
      const parsed = schema.safeParse(stored[key])
      if (parsed.success) theme[key] = parsed.data
    }
  }

  return {
    kind: kind.data,
    name: row.name,
    subject: row.subject,
    blocks,
    theme: theme as unknown as EmailTemplate['theme'],
  }
}

export function savedTemplateFromRow(row: {
  id: string
  kind: string
  name: string
  subject: string
  blocks: unknown
  theme: unknown
  updatedAt: Date
}): SavedEmailTemplate | null {
  const template = readStoredTemplate(row)
  return template ? { id: row.id, updatedAt: row.updatedAt.toISOString(), ...template } : null
}
