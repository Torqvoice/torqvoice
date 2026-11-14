import { z } from 'zod'

/**
 * One highlight, as torqvoice.com serves it from `/api/app/whats-new`.
 *
 * The entries are written in the admin on torqvoice.com, so a new one reaches
 * every install without a deploy. Nothing here is trusted beyond its shape:
 * the body is sanitized again before it is drawn, and links are checked.
 */
export const whatsNewEntrySchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(['new', 'improved']).catch('new'),
  title: z.string().min(1).max(200),
  /** HTML from the admin's editor. Sanitized in Lib/sanitizeBody before use. */
  body: z.string().max(20_000),
  imageUrl: z.string().url().nullable().catch(null),
  ctaLabel: z.string().max(80).nullable().catch(null),
  /** A path inside this app. */
  ctaHref: z.string().max(300).nullable().catch(null),
  /** A docs path on torqvoice.com, without a locale. */
  docsHref: z.string().max(300).nullable().catch(null),
  /** The first release that has the feature. Older installs never see the entry. */
  minVersion: z.string().max(32).nullable().catch(null),
  audience: z.enum(['all', 'cloud', 'self-hosted']).catch('all'),
  /** The permission subject the feature sits behind, when it has one. */
  subject: z.string().max(40).nullable().catch(null),
  publishedAt: z.string().datetime({ offset: true }),
})

export const whatsNewFeedSchema = z.object({
  // One malformed entry is dropped rather than taking the whole feed with it.
  entries: z.array(z.unknown()).transform((items) =>
    items.flatMap((item) => {
      const parsed = whatsNewEntrySchema.safeParse(item)
      return parsed.success ? [parsed.data] : []
    })
  ),
})

export type WhatsNewEntry = z.infer<typeof whatsNewEntrySchema>

export const whatsNewFeedbackSchema = z.object({
  entryId: z.string().min(1).max(64),
  vote: z.enum(['up', 'down']),
  comment: z.string().trim().max(2000).optional(),
})

export type WhatsNewFeedbackInput = z.infer<typeof whatsNewFeedbackSchema>
