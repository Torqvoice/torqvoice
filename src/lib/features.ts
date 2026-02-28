import { cache } from 'react'
import { db } from './db'

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
  payments: boolean
  customFields: boolean
  sms: boolean
  brandingRemoved: boolean
  customPlatformName: boolean
  maxImagesPerService: number
  maxDiagnosticsPerService: number
  maxDocumentsPerService: number
  customerPortal: boolean
}

export const PLAN_FEATURES: Record<Plan, PlanFeatures> = {
  free: {
    maxOrganizations: 1,
    maxCustomers: 5,
    maxUsers: 1,
    templates: 2,
    customTemplates: false,
    reports: true,
    smtp: false,
    api: false,
    payments: false,
    customFields: false,
    sms: false,
    brandingRemoved: false,
    customPlatformName: false,
    maxImagesPerService: 5,
    maxDiagnosticsPerService: 5,
    maxDocumentsPerService: 5,
    customerPortal: false,
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
    payments: true,
    customFields: true,
    sms: true,
    brandingRemoved: true,
    customPlatformName: true,
    maxImagesPerService: 30,
    maxDiagnosticsPerService: 30,
    maxDocumentsPerService: 30,
    customerPortal: true,
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
    payments: true,
    customFields: true,
    sms: true,
    brandingRemoved: true,
    customPlatformName: true,
    maxImagesPerService: 100,
    maxDiagnosticsPerService: 100,
    maxDocumentsPerService: 100,
    customerPortal: true,
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
    payments: true,
    customFields: true,
    sms: true,
    brandingRemoved: true,
    customPlatformName: true,
    maxImagesPerService: 999999,
    maxDiagnosticsPerService: 999999,
    maxDocumentsPerService: 999999,
    customerPortal: true,
  },
}

export function isCloudMode(): boolean {
  return process.env.TORQVOICE_MODE === 'cloud'
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
      return PLAN_FEATURES.free
    }

    // Only active and trialing subscriptions grant premium features
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return PLAN_FEATURES.free
    }

    // Defense-in-depth: if the billing period has ended and grace has elapsed,
    // treat as expired even if status hasn't been updated yet (missed webhook).
    if (subscription.currentPeriodEnd) {
      const graceDeadline = new Date(subscription.currentPeriodEnd.getTime() + SUBSCRIPTION_GRACE_MS)
      if (new Date() > graceDeadline) {
        return PLAN_FEATURES.free
      }
    }

    const name = subscription.plan.name.toLowerCase()
    const planName: Plan = name.includes('enterprise') ? 'enterprise' : name.includes('pro') ? 'pro' : 'free'
    return PLAN_FEATURES[planName]
  }

  // Self-hosted mode — all features unlocked, license only controls branding
  const settings = await db.appSetting.findMany({
    where: {
      organizationId,
      key: { in: ['license.valid', 'license.expiresAt'] },
    },
  })

  const map = new Map(settings.map((s) => [s.key, s.value]))
  const isValid = map.get('license.valid') === 'true'
  const expiresAt = map.get('license.expiresAt')
  const hasLicense = isValid && (!expiresAt || new Date(expiresAt) > new Date())

  return {
    ...PLAN_FEATURES['white-label'],
    brandingRemoved: hasLicense,
    customPlatformName: hasLicense,
  }
})

/**
 * Returns the max organizations a user is allowed based on their best plan
 * across all orgs they own. In self-hosted mode, returns unlimited.
 */
export async function getMaxOrganizations(userId: string): Promise<number> {
  if (!isCloudMode()) return 999999

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

export class FeatureGatedError extends Error {
  feature: string

  constructor(feature: string, message?: string) {
    super(message ?? `This feature requires an upgraded plan: ${feature}`)
    this.name = 'FeatureGatedError'
    this.feature = feature
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
