/**
 * AppSetting keys that carry the first-run state of an organization.
 *
 * All onboarding state lives in per-org AppSetting rows rather than schema
 * columns, so it can ship without a migration and disappears with the org.
 */

/** JSON object with the ids of every entity the sample-data seed created,
 *  keyed by model ({ customers, vehicles, serviceRecords, quotes,
 *  inspections }). Removal deletes exactly these ids and nothing else. */
export const SAMPLE_DATA_IDS_KEY = "onboarding.sampleDataIds";

/**
 * "false" while the getting-started checklist should show, "true" once the
 * user hid it. The row is written at org creation, so its mere presence marks
 * an org that went through the new onboarding: orgs without it (created
 * before this feature) only see the checklist while steps remain open.
 */
export const CHECKLIST_DISMISSED_KEY = "onboarding.checklistDismissed";

/** "true" once a non-sample invoice PDF was downloaded. Downloading leaves no
 *  other trace in the data, so the route records this one-time marker. */
export const INVOICE_ISSUED_KEY = "onboarding.invoiceIssued";

export interface SampleDataIds {
  customers: string[];
  vehicles: string[];
  serviceRecords: string[];
  quotes: string[];
  inspections: string[];
}

export const EMPTY_SAMPLE_IDS: SampleDataIds = {
  customers: [],
  vehicles: [],
  serviceRecords: [],
  quotes: [],
  inspections: [],
};

export function parseSampleDataIds(value: string | null | undefined): SampleDataIds {
  if (!value) return { ...EMPTY_SAMPLE_IDS };
  try {
    const parsed = JSON.parse(value) as Partial<Record<keyof SampleDataIds, unknown>>;
    const list = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    return {
      customers: list(parsed.customers),
      vehicles: list(parsed.vehicles),
      serviceRecords: list(parsed.serviceRecords),
      quotes: list(parsed.quotes),
      inspections: list(parsed.inspections),
    };
  } catch {
    return { ...EMPTY_SAMPLE_IDS };
  }
}

export function hasAnySampleIds(ids: SampleDataIds): boolean {
  return (
    ids.customers.length > 0 ||
    ids.vehicles.length > 0 ||
    ids.serviceRecords.length > 0 ||
    ids.quotes.length > 0 ||
    ids.inspections.length > 0
  );
}
