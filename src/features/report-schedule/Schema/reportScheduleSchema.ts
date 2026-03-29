import { z } from "zod";

export const REPORT_SECTIONS = [
  "revenue",
  "tax",
  "pastDue",
  "services",
  "customers",
  "technicians",
  "parts",
  "jobAnalytics",
  "retention",
  "inventory",
] as const;

export type ReportSection = (typeof REPORT_SECTIONS)[number];

export const createReportScheduleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  sections: z
    .array(z.enum(REPORT_SECTIONS))
    .min(1, "Select at least one section"),
  recipients: z.array(z.string()).min(1, "Select at least one recipient"),
  endDate: z.string().nullable().optional(),
});

export const updateReportScheduleSchema = createReportScheduleSchema.extend({
  id: z.string(),
  isActive: z.boolean().optional(),
});
