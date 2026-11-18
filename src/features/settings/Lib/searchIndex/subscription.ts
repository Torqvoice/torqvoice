import type { SettingsEntry } from './types'

/**
 * Subscription. Which cards show depends on the plan: the upgrade card for a
 * free or demo workshop, the manage card for a paid one, and an Enterprise
 * upgrade card for Pro. Buttons that come and go land on their card.
 */
export const subscriptionEntries: SettingsEntry[] = [
  {
    id: 'subscription.plan',
    page: 'subscription',
    title: 'subscription.title',
    description: 'subscription.description',
    anchor: 'subscription-plan',
    keywords: ['subscription', 'plan', 'current plan', 'billing', 'renewal', 'pricing'],
  },
  {
    id: 'subscription.upgrade',
    page: 'subscription',
    title: 'subscription.upgradeTitle',
    description: 'subscription.upgradeToProDescription',
    anchor: 'subscription-upgrade',
    keywords: ['upgrade', 'change plan', 'buy', 'pro', 'purchase', 'checkout'],
  },
  {
    id: 'subscription.billingInterval',
    page: 'subscription',
    title: 'subscription.billingInterval',
    anchor: 'subscription-billing-interval',
    keywords: ['monthly', 'annual', 'yearly', 'billing interval', 'billing period'],
  },
  {
    id: 'subscription.upgradeToEnterprise',
    page: 'subscription',
    title: 'subscription.upgradeToEnterprise',
    description: 'subscription.upgradeToEnterpriseDescription',
    anchor: 'subscription-upgrade-enterprise',
    keywords: ['enterprise', 'upgrade to enterprise', 'multiple workshops', 'more users'],
  },
  {
    id: 'subscription.features',
    page: 'subscription',
    title: 'subscription.featuresTitle',
    description: 'subscription.featuresDescription',
    anchor: 'subscription-features',
    keywords: ['plan features', 'limits', 'usage', 'customer limit', 'member limit', 'included'],
  },
  {
    id: 'subscription.manage',
    page: 'subscription',
    title: 'subscription.manageTitle',
    anchor: 'subscription-manage',
    keywords: ['manage subscription', 'billing', 'receipts', 'invoices from torqvoice'],
  },
  {
    id: 'subscription.manageBilling',
    page: 'subscription',
    title: 'subscription.manageBilling',
    description: 'subscription.manageBillingDescription',
    anchor: 'subscription-manage',
    keywords: ['payment method', 'credit card', 'billing portal', 'update card', 'stripe'],
  },
  {
    id: 'subscription.cancel',
    page: 'subscription',
    title: 'subscription.cancelSubscription',
    anchor: 'subscription-manage',
    keywords: ['cancel subscription', 'cancel plan', 'downgrade', 'unsubscribe', 'stop paying'],
  },
  {
    id: 'subscription.resume',
    page: 'subscription',
    title: 'subscription.resumeSubscription',
    anchor: 'subscription-manage',
    keywords: ['resume subscription', 'reactivate', 'undo cancel'],
  },
]
