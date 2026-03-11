import { DataSettings } from "./data-settings";
import { getContentCounts } from "@/features/settings/Actions/deleteContent";

export default async function DataSettingsPage() {
  const countsResult = await getContentCounts();
  const contentCounts = countsResult.success && countsResult.data
    ? countsResult.data
    : {
        vehicles: 0, customers: 0, quotes: 0, inventory: 0,
        inspections: 0, technicians: 0, inspectionTemplates: 0,
        notifications: 0, smsMessages: 0, customFields: 0,
      };

  return <DataSettings contentCounts={contentCounts} />;
}
