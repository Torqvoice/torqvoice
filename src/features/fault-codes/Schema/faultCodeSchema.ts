import { z } from 'zod'
import { FAULT_STATUSES, normalizeFaultCode } from '../Lib/codes'

/** A code as typed or pasted, normalised to P0420; anything that is not a code is refused. */
export const faultCodeField = z
  .string()
  .max(16)
  .transform((value, ctx) => {
    const code = normalizeFaultCode(value)
    if (!code) {
      ctx.addIssue({ code: 'custom', message: 'Not a fault code' })
      return z.NEVER
    }
    return code
  })

export const faultStatusField = z.enum(FAULT_STATUSES)

const id = z.string().min(1).max(64)

export const lookupFaultCodesSchema = z.object({
  codes: z.array(z.string().max(16)).max(50),
  vehicleId: id.nullish(),
  /**
   * The language to answer in: the screen's for reading, the workshop's for
   * a meaning that will be saved on a finding and printed.
   */
  language: z.enum(['screen', 'document']).default('screen'),
})

export const faultCodeDetailSchema = z.object({
  code: faultCodeField,
  vehicleId: id.nullish(),
  /** The code's own page lists shared fixes; the sheet beside a job does not. */
  fixes: z.boolean().optional(),
})

export const addFaultCodeFindingsSchema = z.object({
  serviceRecordId: id,
  codes: z
    .array(
      z.object({
        code: faultCodeField,
        status: faultStatusField.nullish(),
        module: z.string().trim().max(80).nullish(),
      })
    )
    .min(1)
    .max(50),
  concernId: id.nullish(),
  severity: z.enum(['monitor', 'needs_work', 'urgent']).default('needs_work'),
})

export const takeFindingMeaningSchema = z.object({ findingId: id })

export const checkFindingMeaningsSchema = z.object({ serviceRecordId: id })

export const REPORT_REASONS = [
  'wrong_for_vehicle',
  'text_mismatch',
  'wrong_position',
  'bad_translation',
  'other',
] as const

export const reportFaultCodeSchema = z.object({
  code: faultCodeField,
  version: z.number().int().min(0),
  lang: z.string().min(2).max(8),
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(500).optional(),
  vehicleId: id.nullish(),
})

export const faultCodeReportsSchema = z.object({
  codes: z.array(faultCodeField).max(50),
})

/** At most this many photos on a shared fix, as the code service takes them. */
export const MAX_FIX_PHOTOS = 4
/** Per photo as sent, the service's limit; photos are compressed in the browser first. */
export const MAX_FIX_PHOTO_BYTES = 15 * 1024 * 1024
export const FIX_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_FIX_TEXT = 2000

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined)

/**
 * The text fields of "Share your fix", as the upload route reads them from
 * the form. The vehicle comes from the job's vehicle when the page was
 * opened from one, else from what was typed; never a plate or VIN.
 */
/** A draft's id: a UUID the share dialog makes, naming where a phone's photos wait. */
export const fixDraftId = z.string().uuid()

export const fixPhoneLinkSchema = z.object({ code: faultCodeField, draftId: fixDraftId })
export const fixDraftSchema = z.object({ draftId: fixDraftId })
export const fixDraftPhotoSchema = z.object({
  draftId: fixDraftId,
  photoId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/),
})

export const shareFixSchema = z.object({
  code: faultCodeField,
  text: z.string().trim().min(1).max(MAX_FIX_TEXT),
  vehicleId: id.optional(),
  draftId: fixDraftId.optional(),
  make: optionalText(60),
  model: optionalText(60),
  year: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .pipe(z.number().int().min(1900).max(2100).optional()),
})

export const withdrawFixSchema = z.object({
  code: faultCodeField,
  id: z.string().uuid(),
})

export const faultCodeJobsSchema = z.object({
  code: faultCodeField,
})
