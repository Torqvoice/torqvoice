import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { StatusReportView } from "./status-report-view";
import { resolvePortalOrg } from "@/lib/portal-slug";
import { getFeatures } from "@/lib/features";
import type { Metadata } from "next";

function toPublicFileUrl(fileUrl: string, token: string): string {
  const match = fileUrl.match(/^\/api\/protected\/files\/[^/]+\/(.+)$/);
  if (match) return `/api/public/files/${token}/${match[1]}`;
  return fileUrl;
}

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true },
};

export default async function PublicStatusReportPage({
  params,
}: {
  params: Promise<{ orgId: string; token: string }>;
}) {
  const { orgId: orgParam, token } = await params;
  const resolvedOrg = await resolvePortalOrg(orgParam);
  const orgId = resolvedOrg?.id ?? orgParam;

  const report = await db.statusReport.findUnique({
    where: { publicToken: token },
    include: {
      serviceRecord: {
        select: {
          title: true,
          description: true,
          status: true,
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

  if (!report || report.organizationId !== orgId) {
    notFound();
  }

  // Check if expired
  if (report.expiresAt && report.expiresAt < new Date()) {
    notFound();
  }

  // Get vehicle info through service record
  const serviceWithVehicle = await db.serviceRecord.findUnique({
    where: { id: report.serviceRecordId },
    select: {
      vehicle: {
        select: {
          make: true,
          model: true,
          year: true,
          licensePlate: true,
        },
      },
    },
  });

  if (!serviceWithVehicle) notFound();

  // Mark as viewed on first visit
  if (!report.viewedAt) {
    await db.statusReport.update({
      where: { id: report.id },
      data: { viewedAt: new Date(), status: "viewed" },
    });
  }

  // Fetch workshop settings
  const [settings, features] = await Promise.all([
    db.appSetting.findMany({
      where: {
        organizationId: orgId,
        key: {
          in: [
            "workshop.address",
            "workshop.phone",
            "workshop.email",
            "workshop.logo",
            "invoice.primaryColor",
            "workshop.serviceType",
          ],
        },
      },
    }),
    getFeatures(orgId),
  ]);

  const settingsMap: Record<string, string> = {};
  for (const s of settings) settingsMap[s.key] = s.value;

  // Rewrite video URL if needed
  const videoUrl = report.videoUrl
    ? toPublicFileUrl(report.videoUrl, token)
    : null;

  return (
    <StatusReportView
      report={{
        id: report.id,
        title: report.title,
        message: report.message,
        videoUrl,
        videoFileName: report.videoFileName,
        status: report.status,
        createdAt: report.createdAt.toISOString(),
        customerFeedback: report.customerFeedback,
        feedbackAt: report.feedbackAt?.toISOString() || null,
      }}
      vehicle={serviceWithVehicle.vehicle}
      serviceTitle={report.serviceRecord.title}
      technicianName={report.technician?.name || null}
      workshopName={report.organization.name}
      workshopPhone={settingsMap["workshop.phone"] || ""}
      primaryColor={settingsMap["invoice.primaryColor"] || "#3b82f6"}
      token={token}
      showBranding={!features.brandingRemoved}
    />
  );
}
