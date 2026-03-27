"use server";

import { db } from "@/lib/db";

export async function getPublicStatusReport(token: string) {
  const report = await db.statusReport.findUnique({
    where: { publicToken: token },
    include: {
      serviceRecord: {
        select: {
          title: true,
          description: true,
          status: true,
          vehicle: {
            select: {
              make: true,
              model: true,
              year: true,
              licensePlate: true,
              customer: {
                select: { name: true },
              },
            },
          },
        },
      },
      technician: {
        select: { name: true },
      },
      organization: {
        select: { name: true },
      },
    },
  });

  if (!report) throw new Error("Status report not found");

  if (report.expiresAt && report.expiresAt < new Date()) {
    throw new Error("This status report has expired");
  }

  // Update viewedAt on first view
  if (!report.viewedAt) {
    await db.statusReport.update({
      where: { id: report.id },
      data: { viewedAt: new Date() },
    });
  }

  return {
    id: report.id,
    title: report.title,
    message: report.message,
    videoUrl: report.videoUrl,
    videoFileName: report.videoFileName,
    status: report.status,
    createdAt: report.createdAt,
    expiresAt: report.expiresAt,
    customerFeedback: report.customerFeedback,
    feedbackAt: report.feedbackAt,
    serviceRecord: {
      title: report.serviceRecord.title,
      description: report.serviceRecord.description,
      status: report.serviceRecord.status,
    },
    vehicle: {
      make: report.serviceRecord.vehicle.make,
      model: report.serviceRecord.vehicle.model,
      year: report.serviceRecord.vehicle.year,
      licensePlate: report.serviceRecord.vehicle.licensePlate,
    },
    technician: report.technician ? { name: report.technician.name } : null,
    organization: { name: report.organization.name },
  };
}
