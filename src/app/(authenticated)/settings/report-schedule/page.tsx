import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures, isCloudMode } from "@/lib/features";
import { redirect } from "next/navigation";
import { FeatureLockedMessage } from "../feature-locked-message";
import {
  getReportSchedules,
  getOrgMembers,
} from "@/features/report-schedule/Actions/reportScheduleActions";
import { ReportScheduleSettings } from "./report-schedule-settings";

export default async function ReportSchedulePage() {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  const features = await getFeatures(data.organizationId);

  if (!features.reports) {
    return (
      <FeatureLockedMessage
        feature="Report Schedule"
        description="Automatically generate and email report PDFs on a recurring schedule."
        isCloud={isCloudMode()}
      />
    );
  }

  const [schedulesResult, membersResult] = await Promise.all([
    getReportSchedules(),
    getOrgMembers(),
  ]);

  const schedules =
    schedulesResult.success && schedulesResult.data
      ? schedulesResult.data
      : [];
  const members =
    membersResult.success && membersResult.data ? membersResult.data : [];

  return (
    <ReportScheduleSettings
      schedules={schedules}
      members={members}
    />
  );
}
