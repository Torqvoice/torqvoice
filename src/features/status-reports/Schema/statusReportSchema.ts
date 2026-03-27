import { z } from "zod";

export const createStatusReportSchema = z.object({
  serviceRecordId: z.string(),
  title: z.string().optional(),
  message: z.string().optional(),
  videoUrl: z.string().optional(),
  videoFileName: z.string().optional(),
  expiresAt: z.string().optional(),
});

export const sendStatusReportSchema = z.object({
  statusReportId: z.string(),
  channels: z.object({
    sms: z.boolean(),
    email: z.boolean(),
    telegram: z.boolean(),
  }),
  customMessage: z.string().optional(),
});

export const submitFeedbackSchema = z.object({
  token: z.string(),
  feedback: z.string().min(1).max(2000),
});

export type CreateStatusReportInput = z.infer<typeof createStatusReportSchema>;
export type SendStatusReportInput = z.infer<typeof sendStatusReportSchema>;
export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;
