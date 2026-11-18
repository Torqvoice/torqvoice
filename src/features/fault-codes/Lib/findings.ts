/**
 * The fault code fields a finding's webhook events carry, when the finding
 * is a code. A finding without one carries none, so existing receivers see
 * the payload they always did.
 */
export function findingWebhookFields(finding: {
  faultCode?: string | null
  faultStatus?: string | null
  faultModule?: string | null
  faultMeaning?: string | null
  faultMeaningSource?: string | null
}): Record<string, string | null> {
  if (!finding.faultCode) return {}
  return {
    faultCode: finding.faultCode,
    faultStatus: finding.faultStatus ?? null,
    faultModule: finding.faultModule ?? null,
    faultMeaning: finding.faultMeaning ?? null,
    faultMeaningSource: finding.faultMeaningSource ?? null,
  }
}
