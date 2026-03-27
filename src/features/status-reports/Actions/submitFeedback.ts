"use server";

import { db } from "@/lib/db";
import { submitFeedbackSchema } from "../Schema/statusReportSchema";

export async function submitStatusReportFeedback(input: unknown) {
  const data = submitFeedbackSchema.parse(input);

  const report = await db.statusReport.findUnique({
    where: { publicToken: data.token },
  });

  if (!report) throw new Error("Status report not found");
  if (report.expiresAt && report.expiresAt < new Date()) throw new Error("This status report has expired");

  await db.statusReport.update({
    where: { id: report.id },
    data: {
      customerFeedback: data.feedback,
      feedbackAt: new Date(),
    },
  });

  return { success: true };
}
