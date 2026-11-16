import { z } from 'zod'

export const shareKindSchema = z.enum(['invoice', 'quote', 'inspection'])

/** The document a link belongs to. */
export const shareLinkRefSchema = z.object({
  kind: shareKindSchema,
  id: z.string().min(1),
})

/**
 * What the workshop says about one document's link: follow the workshop's
 * rule, never expire, or expire at the end of a day (YYYY-MM-DD, a day on
 * the workshop's calendar).
 */
export const setShareLinkExpirySchema = shareLinkRefSchema.extend({
  choice: z.enum(['workshop', 'never', 'date']),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

/** When a link expires, as the server worked it out. Dates travel as ISO strings. */
export const shareExpiryViewSchema = z.object({
  kind: z.enum(['never', 'untilPaid', 'date']),
  source: z.enum(['document', 'workshop']),
  at: z.string().nullable(),
  expired: z.boolean(),
  /** What the workshop's rule alone would say, for the "workshop setting" choice. */
  rule: z.object({
    mode: z.enum(['never', 'afterSharing', 'afterPayment']),
    days: z.number(),
  }),
  /** The date field's starting value, a day on the workshop's calendar. */
  dateInput: z.string(),
})

export type ShareExpiryView = z.infer<typeof shareExpiryViewSchema>
export type SetShareLinkExpiryInput = z.infer<typeof setShareLinkExpirySchema>
