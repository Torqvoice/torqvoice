import { z } from 'zod'

export const createStatusReportSchema = z
  .object({
    /** The work order the report is about, or... */
    serviceRecordId: z.string().min(1).optional(),
    /** ...the inspection. One of the two, never both. */
    inspectionId: z.string().min(1).optional(),
    title: z.string().optional(),
    message: z.string().optional(),
    videoUrl: z.string().optional(),
    videoFileName: z.string().optional(),
    expiresAt: z.string().optional(),
  })
  .refine((data) => !!data.serviceRecordId !== !!data.inspectionId, {
    message: 'A status report is about a work order or an inspection',
    path: ['serviceRecordId'],
  })

export const sendStatusReportSchema = z.object({
  statusReportId: z.string(),
  channels: z.object({
    sms: z.boolean(),
    email: z.boolean(),
    telegram: z.boolean(),
  }),
  customMessage: z.string().optional(),
})

export const submitFeedbackSchema = z.object({
  token: z.string(),
  feedback: z.string().min(1).max(2000),
})

export type CreateStatusReportInput = z.infer<typeof createStatusReportSchema>
export type SendStatusReportInput = z.infer<typeof sendStatusReportSchema>
export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>
