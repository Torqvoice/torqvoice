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
}

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
  },
  pro: {
    maxOrganizations: 3,
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
    return cloudPlan(planName)
  }

  // Self-hosted mode — all features unlocked, license only controls branding.
  //
  // The gate trusts one thing: a token signed by torqvoice.com, bound to this
  // organization, refreshed within the last two weeks. The operator owns this
  // database, so `license.valid` and friends are display cache only; editing
  // them changes nothing here. See src/lib/license/token.ts.
  const settings = await db.appSetting.findMany({
    where: {
      organizationId,
      key: { in: ['license.token', 'license.key'] },
    },
  })

  const map = new Map(settings.map((s) => [s.key, s.value]))
  const verification = verifyLicenseToken(map.get('license.token'), organizationId)
  const hasLicense = verification.status === 'valid'

  // A key with no usable token is an install that has not talked to
  // torqvoice.com recently, or one that upgraded from the release that stored
  // plain booleans. Refresh in the background; the cron would get there within
  // a day anyway, this just makes the upgrade invisible.
  const key = map.get('license.key')
  if (key && !hasLicense) {
    scheduleLicenseSelfHeal(organizationId, key)
  }

  return {
    ...PLAN_FEATURES['white-label'],
    brandingRemoved: hasLicense,
    customPlatformName: hasLicense,
    // One workshop per install without a licence. A self-hosting workshop
    // needs one; running many is what the white-label licence is for.
    maxOrganizations: hasLicense ? PLAN_FEATURES['white-label'].maxOrganizations : 1,
  }
})

/**
 * Whether any organization on this install holds a valid licence token.
 * The licence is what turns a single-workshop install into a multi-workshop
 * one, so it is checked across the install, not per person.
 */
export async function installHasLicense(): Promise<boolean> {
  const tokens = await db.appSetting.findMany({
    where: { key: 'license.token', organizationId: { not: null } },
    select: { organizationId: true, value: true },
  })
  return tokens.some(
    (row) =>
      row.organizationId !== null &&
      verifyLicenseToken(row.value, row.organizationId).status === 'valid'
  )
}

/**
 * Returns the max organizations a user is allowed based on their best plan
 * across all orgs they own. In self-hosted mode the limit is one for the
 * whole install, lifted by a valid white-label licence.
 */
export async function getMaxOrganizations(userId: string): Promise<number> {
  if (!isCloudMode()) {
    return (await installHasLicense()) ? PLAN_FEATURES['white-label'].maxOrganizations : 1
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
