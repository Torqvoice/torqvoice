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

export const DATE_RANGES = [
  "last1d",
  "last7d",
  "last14d",
  "last30d",
  "last60d",
  "last90d",
  "last6m",
  "last12m",
  "ytd",
  "allTime",
] as const;

export type DateRangeKey = (typeof DATE_RANGES)[number];

export const createReportScheduleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  frequency: z.enum(["daily", "weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannually", "yearly"]),
  dateRange: z.enum(DATE_RANGES).optional(),
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
