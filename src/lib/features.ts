import { cache } from 'react'
import { db } from './db'

export type Plan = 'free' | 'pro' | 'enterprise' | 'white-label'

export type PlanFeatures = {
  maxCustomers: number
  maxUsers: number
  templates: number
  reports: boolean
  smtp: boolean
  api: boolean
  payments: boolean
  customFields: boolean
  brandingRemoved: boolean
  customPlatformName: boolean
}

export const PLAN_FEATURES: Record<Plan, PlanFeatures> = {
  free: {
    maxCustomers: 5,
    maxUsers: 1,
    templates: 2,
    reports: true,
    smtp: false,
    api: false,
    payments: false,
    customFields: false,
    brandingRemoved: false,
    customPlatformName: false,
  },
  pro: {
    maxCustomers: 999999,
    maxUsers: 5,
    templates: 999999,
    reports: true,
    smtp: true,
    api: true,
    payments: true,
    customFields: true,
    brandingRemoved: true,
    customPlatformName: true,
  },
  enterprise: {
    maxCustomers: 999999,
    maxUsers: 50,
    templates: 999999,
    reports: true,
    smtp: true,
    api: true,
    payments: true,
    customFields: true,
    brandingRemoved: true,
    customPlatformName: true,
  },
  'white-label': {
    maxCustomers: 999999,
    maxUsers: 999999,
    templates: 999999,
    reports: true,
    smtp: true,
    api: true,
    payments: true,
    customFields: true,
    brandingRemoved: true,
    customPlatformName: true,
  },
}

export function isCloudMode(): boolean {
  return process.env.TORQVOICE_MODE === 'cloud'
}

export const getFeatures = cache(async (organizationId: string): Promise<PlanFeatures> => {
  if (isCloudMode()) {
    const subscription = await db.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    })

    if (!subscription || subscription.status !== 'active') {
      return PLAN_FEATURES.free
    }

    const planName = subscription.plan.name.toLowerCase() as Plan
    return PLAN_FEATURES[planName] ?? PLAN_FEATURES.free
  }

  // Self-hosted mode — license is per-org in AppSetting
  const settings = await db.appSetting.findMany({
    where: {
      organizationId,
      key: { in: ['license.valid', 'license.plan'] },
    },
  })

  const map = new Map(settings.map((s) => [s.key, s.value]))
  const isValid = map.get('license.valid') === 'true'

  if (isValid) {
    return PLAN_FEATURES['white-label']
  }

  return PLAN_FEATURES.free
})

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
