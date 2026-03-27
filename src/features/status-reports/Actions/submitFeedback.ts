"use server";

import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { submitFeedbackSchema } from "../Schema/statusReportSchema";

export async function submitStatusReportFeedback(input: unknown) {
  const data = submitFeedbackSchema.parse(input);

  const report = await db.statusReport.findUnique({
    where: { publicToken: data.token },
    include: {
      serviceRecord: {
        select: {
          id: true,
          title: true,
          vehicleId: true,
          vehicle: {
            select: {
              year: true,
              make: true,
              model: true,
              customer: { select: { name: true } },
            },
          },
        },
      },
    },
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

  // Notify the organization about the feedback
  const vehicle = report.serviceRecord.vehicle;
  const vehicleName = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
  const customerName = vehicle.customer?.name ?? "Customer";

  await notify({
    organizationId: report.organizationId,
    type: "status_report_feedback",
    title: "New Status Report Feedback",
    message: `${customerName} responded to the status report for ${vehicleName}: "${data.feedback.length > 100 ? data.feedback.slice(0, 100) + "..." : data.feedback}"`,
    entityType: "ServiceRecord",
    entityId: report.serviceRecord.id,
    entityUrl: `/vehicles/${report.serviceRecord.vehicleId}/service/${report.serviceRecord.id}`,
  });

  return { success: true };
}
