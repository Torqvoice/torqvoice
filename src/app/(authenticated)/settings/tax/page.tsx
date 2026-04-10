import { getSettings } from "@/features/settings/Actions/settingsActions";
import {
  getTaxBackfillCounts,
  getInclusiveBackfillCounts,
  getExclusiveBackfillCounts,
} from "@/features/settings/Actions/applyTaxRateToExisting";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { TaxSettings } from "./tax-settings";

export default async function TaxSettingsPage() {
  const [result, backfillResult, inclusiveBackfillResult, exclusiveBackfillResult] = await Promise.all([
    getSettings([
      SETTING_KEYS.TAX_ENABLED,
      SETTING_KEYS.DEFAULT_TAX_RATE,
      SETTING_KEYS.TAX_INCLUSIVE,
      SETTING_KEYS.TAX_LABEL,
    ]),
    getTaxBackfillCounts(),
    getInclusiveBackfillCounts(),
    getExclusiveBackfillCounts(),
  ]);
  const settings = result.success && result.data ? result.data : {};
  const taxBackfillCounts =
    backfillResult.success && backfillResult.data
      ? backfillResult.data
      : { serviceRecords: 0, quotes: 0 };
  const inclusiveBackfillCounts =
    inclusiveBackfillResult.success && inclusiveBackfillResult.data
      ? inclusiveBackfillResult.data
      : { serviceRecords: 0, quotes: 0 };
  const exclusiveBackfillCounts =
    exclusiveBackfillResult.success && exclusiveBackfillResult.data
      ? exclusiveBackfillResult.data
      : { serviceRecords: 0, quotes: 0 };

  return (
    <TaxSettings
      settings={settings}
      taxBackfillCounts={taxBackfillCounts}
      inclusiveBackfillCounts={inclusiveBackfillCounts}
      exclusiveBackfillCounts={exclusiveBackfillCounts}
    />
  );
}
