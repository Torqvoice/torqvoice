import { getSettings } from "@/features/settings/Actions/settingsActions";
import { getTaxBackfillCounts } from "@/features/settings/Actions/applyTaxRateToExisting";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { TaxSettings } from "./tax-settings";

export default async function TaxSettingsPage() {
  const [result, backfillResult] = await Promise.all([
    getSettings([
      SETTING_KEYS.TAX_ENABLED,
      SETTING_KEYS.DEFAULT_TAX_RATE,
      SETTING_KEYS.TAX_INCLUSIVE,
      SETTING_KEYS.TAX_LABEL,
    ]),
    getTaxBackfillCounts(),
  ]);
  const settings = result.success && result.data ? result.data : {};
  const taxBackfillCounts =
    backfillResult.success && backfillResult.data
      ? backfillResult.data
      : { serviceRecords: 0, quotes: 0 };

  return (
    <TaxSettings settings={settings} taxBackfillCounts={taxBackfillCounts} />
  );
}
