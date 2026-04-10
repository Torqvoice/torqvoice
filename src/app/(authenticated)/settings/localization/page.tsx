import { getSettings } from "@/features/settings/Actions/settingsActions";
import { getTaxBackfillCounts } from "@/features/settings/Actions/applyTaxRateToExisting";
import { LocalizationSettings } from "./localization-settings";

export default async function LocalizationSettingsPage() {
  const [result, backfillResult] = await Promise.all([
    getSettings(),
    getTaxBackfillCounts(),
  ]);
  const settings = result.success && result.data ? result.data : {};
  const taxBackfillCounts =
    backfillResult.success && backfillResult.data
      ? backfillResult.data
      : { serviceRecords: 0, quotes: 0 };

  return (
    <LocalizationSettings
      settings={settings}
      taxBackfillCounts={taxBackfillCounts}
    />
  );
}
