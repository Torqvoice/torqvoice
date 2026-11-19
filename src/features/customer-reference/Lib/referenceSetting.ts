import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { referenceMissing } from './reference'

/**
 * Whether the workshop has switched the Reference / PO field on. Off by
 * default, and off means hidden everywhere: a work order keeps what was
 * typed, but no page, print, share link or connector shows or sends it.
 */
export function customerReferenceEnabledIn(
  settings: Record<string, string | undefined>,
  features: { customFields: boolean }
): boolean {
  // A paid field, on the plans that have custom fields. After a downgrade the
  // switch may still read 'true'; the plan is what hides it then.
  return settings[SETTING_KEYS.CUSTOMER_REFERENCE_ENABLED] === 'true' && features.customFields
}

export async function isCustomerReferenceEnabled(organizationId: string): Promise<boolean> {
  const rows = await db.appSetting.findMany({
    where: { organizationId, key: SETTING_KEYS.CUSTOMER_REFERENCE_ENABLED },
    select: { key: true, value: true },
  })
  // The setting first: a workshop that never turned it on costs one indexed
  // read and no look at its plan.
  const row = rows.find((candidate) => candidate.key === SETTING_KEYS.CUSTOMER_REFERENCE_ENABLED)
  if (row?.value !== 'true') return false
  return (await getFeatures(organizationId)).customFields
}

/** The job or quote as a page or print may show it: without the reference while the field is off. */
export function gateCustomerReference<T extends { customerReference?: string | null }>(
  record: T,
  enabled: boolean
): T {
  return enabled ? record : { ...record, customerReference: null }
}

/** The customer as a page may show it: never "PO required" while the field is off. */
export function gatePoRequired<T extends { poRequired?: boolean | null }>(
  customer: T,
  enabled: boolean
): T {
  return enabled ? customer : { ...customer, poRequired: false }
}

/**
 * Whether this job's invoice is held back for want of the customer's
 * reference. Asked by everything that sends an invoice out.
 */
export async function invoiceAwaitsReference(
  organizationId: string,
  serviceRecordId: string
): Promise<boolean> {
  // The switch first: with it off, which is every workshop that has not
  // asked for the field, nothing about the job is read at all.
  if (!(await isCustomerReferenceEnabled(organizationId))) return false
  const record = await db.serviceRecord.findFirst({
    where: { id: serviceRecordId, organizationId },
    select: {
      customerReference: true,
      customer: { select: { poRequired: true } },
      vehicle: { select: { customer: { select: { poRequired: true } } } },
    },
  })
  if (!record) return false
  return referenceMissing(true, record, record.customer ?? record.vehicle?.customer ?? null)
}
