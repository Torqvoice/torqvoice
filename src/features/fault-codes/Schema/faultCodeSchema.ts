import { z } from 'zod'
import {
  FAULT_STATUSES,
  normalizeAnyMakeCode,
  normalizeFaultCode,
  normalizeFixCode,
  normalizeOemCode,
} from '../Lib/codes'
import { isMakeKey } from '../Lib/makes'

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

/**
 * An OBD code (P0420) or a manufacturer's own code (BMW's 2A82), normalised.
 * Whether a manufacturer code counts on a car is the action's to decide.
 */
export const anyCodeField = z
  .string()
  .max(16)
  .transform((value, ctx) => {
    const code = normalizeFaultCode(value) ?? normalizeOemCode(value)
    if (!code) {
      ctx.addIssue({ code: 'custom', message: 'Not a fault code' })
      return z.NEVER
    }
    return code
  })

export const faultStatusField = z.enum(FAULT_STATUSES)

/** A manufacturer code's page: the make's data ("bmw"), the code and maybe the job's car. */
export const oemCodeSchema = z.object({
  source: z.string().refine(isMakeKey, 'Not a make'),
  code: z
    .string()
    .max(16)
    .transform((value, ctx) => {
      const code = normalizeAnyMakeCode(value)
      if (!code) {
        ctx.addIssue({ code: 'custom', message: 'Not a manufacturer code' })
        return z.NEVER
      }
      return code
    }),
  vehicleId: z.string().min(1).max(64).nullish(),
  /** The code's own page lists shared fixes; the sheet beside a job does not. */
  fixes: z.boolean().optional(),
})

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
        code: anyCodeField,
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
/** A shared fix's code: an OBD code (P0420) or a make's own with its make (BMW-2A82). */
export const fixCodeField = z.string().transform((value, ctx) => {
  const code = normalizeFixCode(value)
  if (!code) {
    ctx.addIssue({ code: 'custom', message: 'Not a fault code' })
    return z.NEVER
  }
  return code
})

/** A draft's id: a UUID the share dialog makes, naming where a phone's photos wait. */
export const fixDraftId = z.string().uuid()

export const fixPhoneLinkSchema = z.object({
  code: fixCodeField,
  draftId: fixDraftId,
  /** A waveform's phone code asks for one photo of the scope screen. */
  purpose: z.enum(['fix', 'waveform']).optional(),
})

/** A waveform takes one picture of the scope screen. */
export const MAX_WAVEFORM_PHOTOS = 1
export const fixDraftSchema = z.object({ draftId: fixDraftId })
export const fixDraftPhotoSchema = z.object({
  draftId: fixDraftId,
  photoId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/),
})

/** A meaning of a make's code, by its id in the make's files ("einlass-vanos"). */
export const meaningIdField = z
  .string()
  .trim()
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)

export const shareFixSchema = z.object({
  code: fixCodeField,
  /** For a make's own code, the meaning the fix is for. */
  meaning: meaningIdField.optional(),
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

/** Researching a fix: the code (BMW-2A82 for a make's), its meaning for a make's, the job's car. */
export const researchFaultCodeSchema = z.object({
  code: fixCodeField,
  meaning: meaningIdField.optional(),
  vehicleId: id.nullish(),
})

export const rateResearchSchema = z.object({
  id: z.string().uuid(),
  helpful: z.boolean(),
})

/** The limits of a shared waveform's files, as the code service takes them. */
export const MAX_WAVEFORM_RECORDING_BYTES = 10 * 1024 * 1024
export const MAX_WAVEFORM_SETTINGS_BYTES = 1024 * 1024
export const MAX_WAVEFORM_IMAGE_BYTES = 15 * 1024 * 1024
export const WAVEFORM_CONDITIONS = [
  'key_on',
  'cranking',
  'idle',
  'rpm_2500',
  'driving',
  'under_load',
] as const

/** "Share a waveform": what it shows and how the engine ran; the files come as form parts. */
export const shareWaveformSchema = z.object({
  code: fixCodeField,
  meaning: meaningIdField.optional(),
  kind: z.enum(['good', 'faulty']),
  title: z.string().trim().min(1).max(120),
  condition: z.enum(WAVEFORM_CONDITIONS).optional(),
  note: z.string().trim().max(MAX_FIX_TEXT).optional(),
  vehicleId: id.optional(),
  draftId: fixDraftId.optional(),
  make: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => v || undefined),
  model: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => v || undefined),
  year: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .pipe(z.number().int().min(1900).max(2100).optional()),
})

export const withdrawWaveformSchema = z.object({ code: fixCodeField, id: z.string().uuid() })

/** "Help us improve": what the message is about, as a workshop picks it. */
export const IMPROVE_TOPICS = ['makes', 'wrong', 'source', 'idea'] as const
export const MAX_IMPROVE_TEXT = 5000

/** A message to the Torqvoice team about fault codes, with the code on screen if any. */
export const improveFaultCodesSchema = z.object({
  topic: z.enum(IMPROVE_TOPICS).optional(),
  message: z.string().trim().min(1).max(MAX_IMPROVE_TEXT),
  /** The code as people read it ("P0420", "BMW 2A82"), when sent from a code's page. */
  code: z.string().trim().max(40).optional(),
  page: z.string().trim().max(300).optional(),
})

export const withdrawFixSchema = z.object({
  code: fixCodeField,
  id: z.string().uuid(),
})

export const faultCodeJobsSchema = z.object({
  code: anyCodeField,
})
