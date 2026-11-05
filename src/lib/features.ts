import { cache } from 'react'
import { isCloudInstance } from './cloud-instance'
import { db } from './db'
import { verifyLicenseToken } from './license/token'
import { scheduleLicenseSelfHeal } from './license/revalidate'

export type Plan = 'free' | 'pro' | 'enterprise' | 'white-label'

export type PlanFeatures = {
  maxOrganizations: number
  maxCustomers: number
  maxUsers: number
  templates: number
  customTemplates: boolean
  reports: boolean
  smtp: boolean
  api: boolean
  integrations: boolean
  payments: boolean
  customFields: boolean
  sms: boolean
  telegram: boolean
  whatsapp: boolean
  brandingRemoved: boolean
  customPlatformName: boolean
  maxImagesPerService: number
  maxDiagnosticsPerService: number
  maxDocumentsPerService: number
  customerPortal: boolean
  ai: boolean
  tireHotel: boolean
  /** Scheduled backups to the workshop's own storage. */
  backups: boolean
  /**
   * Backups Torqvoice runs for the workshop on the cloud instance, with
   * restore points the owner can go back to. Off on self-hosted by the
   * missing configuration, whatever this says.
   */
  platformBackups: boolean
  /**
   * Fault code meanings from Torqvoice Codes, the code service Torqvoice runs.
   * Its own flag rather than `integrations`, so the free cloud plan can have
   * it: free workshops reading codes is what makes the service worth having.
   * Only checked on the cloud; the connector does not exist on a self-hosted
   * install.
   */
  faultCodes: boolean
}

// The admin on torqvoice.com shows the Pro and Enterprise limits a workshop
// starts from (its src/lib/app-billing/workshop-limits.ts, PLAN_LIMITS):
// change a number here and change it there.
export const PLAN_FEATURES: Record<Plan, PlanFeatures> = {
  free: {
    maxOrganizations: 1,
    // Enough to run real work for a few weeks before the plan is felt. Five
    // was reached in the first afternoon, often on the third customer once
    // the seeded samples were counted, and people left instead of upgrading.
    maxCustomers: 20,
    maxUsers: 1,
    templates: 2,
    customTemplates: false,
    reports: true,
    smtp: false,
    api: false,
    integrations: false,
    payments: false,
    customFields: false,
    sms: false,
    telegram: false,
    whatsapp: false,
    brandingRemoved: false,
    customPlatformName: false,
    maxImagesPerService: 5,
    maxDiagnosticsPerService: 5,
    maxDocumentsPerService: 5,
    customerPortal: false,
    ai: true,
    tireHotel: false,
    backups: false,
    platformBackups: false,
    faultCodes: true,
  },
  pro: {
    // One shop and a small team. A bigger team or several locations is what
    // Enterprise sells. Lowered from 3 workshops on 4 Oct 2026; every paid
    // owner had exactly one at the time, so nobody lost one. Seats went to 10
    // that day and back to 5 on 10 Oct 2026, when no Pro workshop had more.
    maxOrganizations: 1,
    maxCustomers: 999999,
    maxUsers: 5,
    templates: 999999,
    customTemplates: true,
    reports: true,
    smtp: true,
    api: true,
    integrations: true,
    payments: true,
    customFields: true,
    sms: true,
    telegram: true,
    whatsapp: true,
    brandingRemoved: true,
    customPlatformName: true,
    maxImagesPerService: 30,
    maxDiagnosticsPerService: 30,
    maxDocumentsPerService: 30,
    customerPortal: true,
    ai: true,
    tireHotel: true,
    backups: true,
    platformBackups: true,
    faultCodes: true,
  },
  enterprise: {
    maxOrganizations: 10,
    maxCustomers: 999999,
    maxUsers: 50,
    templates: 999999,
    customTemplates: true,
    reports: true,
    smtp: true,
    api: true,
    integrations: true,
    payments: true,
    customFields: true,
    sms: true,
    telegram: true,
    whatsapp: true,
    brandingRemoved: true,
    customPlatformName: true,
    maxImagesPerService: 100,
    maxDiagnosticsPerService: 100,
    maxDocumentsPerService: 100,
    customerPortal: true,
    ai: true,
    tireHotel: true,
    backups: true,
    platformBackups: true,
    faultCodes: true,
  },
  'white-label': {
    maxOrganizations: 999999,
    maxCustomers: 999999,
    maxUsers: 999999,
    templates: 999999,
    customTemplates: true,
    reports: true,
    smtp: true,
    api: true,
    integrations: true,
    payments: true,
    customFields: true,
    sms: true,
    telegram: true,
    whatsapp: true,
    brandingRemoved: true,
    customPlatformName: true,
    maxImagesPerService: 999999,
    maxDiagnosticsPerService: 999999,
    maxDocumentsPerService: 999999,
    customerPortal: true,
    ai: true,
    tireHotel: true,
    backups: true,
    platformBackups: true,
    faultCodes: true,
  },
}

/** TORQVOICE_MODE=cloud with a token torqvoice.com signed for this URL. See lib/cloud-instance. */
export function isCloudMode(): boolean {
  return isCloudInstance()
}

/**
 * Torqvoice branding on invoices, quotes, inspections and share pages is a
 * self-hosted matter: the free install carries the mark, the white-label
 * licence removes it. On the cloud instance nobody gets the mark, whatever
 * the plan. A new workshop downloading its first invoice from our own
 * service should see its own name on it, not ours all over it.
 */
function cloudPlan(plan: Plan): PlanFeatures {
  return { ...PLAN_FEATURES[plan], brandingRemoved: true }
}

// Grace period (in ms) after currentPeriodEnd before we cut off features.
// Gives Stripe time to process renewals and deliver webhooks, and the daily
// cron time to sync. 3 days covers Stripe's initial retry window.
const SUBSCRIPTION_GRACE_MS = 3 * 24 * 60 * 60 * 1000

/**
 * The limits that can be raised for one workshop by hand, from the admin on
 * torqvoice.com (its src/lib/app-billing/workshop-limits.ts writes the same
 * keys; keep the two lists in step).
 */
const OVERRIDABLE_LIMITS = [
  'maxUsers',
  'maxOrganizations',
  'maxImagesPerService',
  'maxDiagnosticsPerService',
  'maxDocumentsPerService',
] as const satisfies readonly (keyof PlanFeatures)[]

/**
 * A paid plan with whatever was agreed with this workshop on top. A limit
 * set by hand only ever raises the plan's own; anything else is ignored.
 */
async function withLimitOverrides(
  organizationId: string,
  features: PlanFeatures
): Promise<PlanFeatures> {
  const rows = await db.systemSetting.findMany({
    where: { key: { in: OVERRIDABLE_LIMITS.map((limit) => `limits.${limit}.${organizationId}`) } },
    select: { key: true, value: true },
  })
  if (rows.length === 0) return features

  const raised = { ...features }
  for (const limit of OVERRIDABLE_LIMITS) {
    const row = rows.find((candidate) => candidate.key === `limits.${limit}.${organizationId}`)
    const value = Number.parseInt(row?.value ?? '', 10)
    if (Number.isFinite(value) && value > raised[limit]) raised[limit] = value
  }
  return raised
}

export const getFeatures = cache(async (organizationId: string): Promise<PlanFeatures> => {
  if (isCloudMode()) {
    const subscription = await db.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    })

    if (!subscription) {
      return cloudPlan('free')
    }

    // Only active and trialing subscriptions grant premium features
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return cloudPlan('free')
    }

    // Defense-in-depth: if the billing period has ended and grace has elapsed,
    // treat as expired even if status hasn't been updated yet (missed webhook).
    if (subscription.currentPeriodEnd) {
      const graceDeadline = new Date(
        subscription.currentPeriodEnd.getTime() + SUBSCRIPTION_GRACE_MS
      )
      if (new Date() > graceDeadline) {
        return cloudPlan('free')
      }
    }

    const name = subscription.plan.name.toLowerCase()
    const planName: Plan = name.includes('enterprise')
      ? 'enterprise'
      : name.includes('pro')
        ? 'pro'
        : 'free'
    const features = cloudPlan(planName)
    return planName === 'free' ? features : withLimitOverrides(organizationId, features)
  }

  // Self-hosted mode — all features unlocked, license only controls branding.
  //
  // The gate trusts one thing: a token signed by torqvoice.com, bound to this
  // organization. A subscription token must have been refreshed within the
  // last two weeks; a perpetual one must name the registration number this
  // workshop prints on its invoices, so `invoice.orgNumber` is read alongside
  // it. The operator owns this database, so `license.valid` and friends are
  // display cache only; editing them changes nothing here. See
  // src/lib/license/token.ts.
  const settings = await db.appSetting.findMany({
    where: {
      organizationId,
      key: { in: ['license.token', 'license.key', 'invoice.orgNumber'] },
    },
  })

  const map = new Map(settings.map((s) => [s.key, s.value]))
  const verification = verifyLicenseToken(map.get('license.token'), organizationId, {
    registrationNumber: map.get('invoice.orgNumber'),
  })
  const hasLicense = verification.status === 'valid'

  // A key with no usable token is an install that has not talked to
  // torqvoice.com recently, or one that upgraded from the release that stored
  // plain booleans. Refresh in the background; the cron would get there within
  // a day anyway, this just makes the upgrade invisible. A perpetual token is
  // never refreshed: torqvoice.com has nothing newer to say about it, and a
  // mismatch is fixed in Company settings, not over the network.
  const key = map.get('license.key')
  if (key && !hasLicense && verification.kind !== 'perpetual') {
    scheduleLicenseSelfHeal(organizationId, key)
  }

  return {
    ...PLAN_FEATURES['white-label'],
    brandingRemoved: hasLicense,
    customPlatformName: hasLicense,
    // One workshop per install without a licence. A self-hosting workshop
    // needs one; running many is what the white-label licence is for. A
    // perpetual licence says how many it covers.
    maxOrganizations: hasLicense
      ? (verification.maxOrganizations ?? PLAN_FEATURES['white-label'].maxOrganizations)
      : 1,
  }
})

/**
 * The workshops each valid licence token on this install allows, one entry
 * per token that verifies. A perpetual token is checked against its own
 * workshop's registration number, so both are loaded together.
 */
async function validInstallLicenseLimits(): Promise<number[]> {
  const rows = await db.appSetting.findMany({
    where: { key: { in: ['license.token', 'invoice.orgNumber'] }, organizationId: { not: null } },
    select: { organizationId: true, key: true, value: true },
  })
  const orgNumbers = new Map<string, string>()
  for (const row of rows) {
    if (row.key === 'invoice.orgNumber' && row.organizationId) {
      orgNumbers.set(row.organizationId, row.value)
    }
  }

  const limits: number[] = []
  for (const row of rows) {
    if (row.key !== 'license.token' || !row.organizationId) continue
    const verification = verifyLicenseToken(row.value, row.organizationId, {
      registrationNumber: orgNumbers.get(row.organizationId),
    })
    if (verification.status !== 'valid') continue
    limits.push(verification.maxOrganizations ?? PLAN_FEATURES['white-label'].maxOrganizations)
  }
  return limits
}

/**
 * Whether any organization on this install holds a valid licence token.
 * The licence is what turns a single-workshop install into a multi-workshop
 * one, so it is checked across the install, not per person.
 */
export async function installHasLicense(): Promise<boolean> {
  return (await validInstallLicenseLimits()).length > 0
}

/**
 * How many workshops this install may run: the most any valid licence on it
 * allows. A subscription licence brings the white-label plan's number, a
 * perpetual one the number it was sold with. One without any.
 */
export async function installLicenseMaxOrganizations(): Promise<number> {
  return Math.max(1, ...(await validInstallLicenseLimits()))
}

/**
 * Returns the max organizations a user is allowed based on their best plan
 * across all orgs they own. In self-hosted mode the limit is one for the
 * whole install, lifted by a valid white-label licence.
 */
export async function getMaxOrganizations(userId: string): Promise<number> {
  if (!isCloudMode()) {
    return installLicenseMaxOrganizations()
  }

  const ownedOrgs = await db.organizationMember.findMany({
    where: { userId, role: 'owner' },
    select: { organizationId: true },
  })

  let best = PLAN_FEATURES.free.maxOrganizations

  for (const membership of ownedOrgs) {
    const features = await getFeatures(membership.organizationId)
    if (features.maxOrganizations > best) {
      best = features.maxOrganizations
    }
  }

  return best
}

export type OrganizationAllowance = {
  allowed: boolean
  /** what counts against the limit: organizations owned (cloud) or on the install (self-hosted) */
  current: number
  max: number
}

/**
 * Whether one more organization may be created. On the cloud the limit is
 * the plan's and counts what this person owns; on a self-hosted install it
 * counts every organization there is, so a second sign-up cannot open a
 * second workshop on an install licensed for one.
 */
export async function organizationAllowance(userId: string): Promise<OrganizationAllowance> {
  const max = await getMaxOrganizations(userId)
  const current = isCloudMode()
    ? await db.organizationMember.count({ where: { userId, role: 'owner' } })
    : await db.organization.count()
  return { allowed: current < max, current, max }
}

/** The refusal an install licensed for one workshop gives, worded for a self-hoster. */
export const SINGLE_WORKSHOP_MESSAGE =
  'This installation runs one workshop. A white-label licence from torqvoice.com allows more; see Settings, then License.'

/**
 * Thrown when the plan refuses an action. `withAuth` turns it into a typed
 * `gated` field on the result, so the client can show an upgrade prompt with
 * the actual number instead of a red error box. The message is only a
 * fallback for callers that do not look at `gated`.
 */
export class FeatureGatedError extends Error {
  feature: string
  limit?: number

  constructor(feature: string, message?: string, limit?: number) {
    super(message ?? `This feature requires an upgraded plan: ${feature}`)
    this.name = 'FeatureGatedError'
    this.feature = feature
    this.limit = limit
  }
}

export async function requireFeature(
  organizationId: string,
  feature: keyof PlanFeatures
): Promise<void> {
  const features = await getFeatures(organizationId)
  if (!features[feature]) {
    throw new FeatureGatedError(feature)
  }
}
