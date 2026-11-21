import { db } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
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

/**
 * Whether an invoice prints its reference. As everywhere else while the plan
 * has the field. After a downgrade an invoice already issued keeps printing
 * the reference it has, as it keeps its other details: the customer's
 * accounts department needs the same sheet again. A workshop that switched
 * the field off itself prints none.
 */
export function invoiceReferencePrints(
  settings: Record<string, string | undefined>,
  features: { customFields: boolean },
  invoice: { issuedAt: Date | null }
): boolean {
  if (settings[SETTING_KEYS.CUSTOMER_REFERENCE_ENABLED] !== 'true') return false
  return features.customFields || invoice.issuedAt !== null
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

/**
 * The job as the technician API sends it: with no `customerReference` key at
 * all while the field is off, so a workshop that never turned it on gets the
 * payload it always had.
 */
export function apiCustomerReference<T extends { customerReference?: string | null }>(
  record: T,
  enabled: boolean
): T | Omit<T, 'customerReference'> {
  if (enabled) return record
  const { customerReference: _hidden, ...rest } = record
  return rest
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

/**
 * The jobs whose invoice has not gone out and may not yet: never issued, no
 * reference, and billed to a customer whose invoices need one. As a Prisma
 * filter, for the lists that would otherwise show a completed job to its
 * customer as an invoice. The billed customer is the job's own, or its
 * vehicle's when the job names none, the same rule as everywhere else.
 */
const AWAITING_REFERENCE = {
  issuedAt: null,
  AND: [
    { OR: [{ customerReference: null }, { customerReference: '' }] },
    {
      OR: [
        { customer: { poRequired: true } },
        { customerId: null, vehicle: { customer: { poRequired: true } } },
      ],
    },
  ],
} satisfies Prisma.ServiceRecordWhereInput

/**
 * What a customer-facing list of invoices adds to its filter: nothing for a
 * workshop that has the field off, and otherwise everything but the jobs
 * still waiting for their reference. An invoice that was issued some other
 * way (it was paid, say) is the customer's document and is never held.
 */
export async function notAwaitingReference(
  organizationId: string
): Promise<Prisma.ServiceRecordWhereInput> {
  return (await isCustomerReferenceEnabled(organizationId)) ? { NOT: AWAITING_REFERENCE } : {}
}

/** The same question about one job: held back from its customer for now. */
export async function invoiceHeldFromCustomer(
  organizationId: string,
  serviceRecordId: string
): Promise<boolean> {
  if (!(await isCustomerReferenceEnabled(organizationId))) return false
  const held = await db.serviceRecord.findFirst({
    where: { id: serviceRecordId, organizationId, ...AWAITING_REFERENCE },
    select: { id: true },
  })
  return held !== null
}

/**
 * Of these jobs, the ones held back from their customer for now: for a page
 * that lists a customer's jobs and must not offer a held one as an invoice.
 * Empty for a workshop that has the field off, without a look at the jobs.
 */
export async function heldFromCustomerIds(
  organizationId: string,
  serviceRecordIds: string[]
): Promise<Set<string>> {
  if (serviceRecordIds.length === 0) return new Set()
  if (!(await isCustomerReferenceEnabled(organizationId))) return new Set()
  const held = await db.serviceRecord.findMany({
    where: { id: { in: serviceRecordIds }, organizationId, ...AWAITING_REFERENCE },
    select: { id: true },
  })
  return new Set(held.map((record) => record.id))
}
