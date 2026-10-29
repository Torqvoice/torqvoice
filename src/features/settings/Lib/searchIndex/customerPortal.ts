import type { SettingsEntry } from './types'

/**
 * Customer portal. Everything below the enable switch, and the whole
 * background card, renders only once the portal is on.
 */
export const customerPortalEntries: SettingsEntry[] = [
  {
    id: 'customerPortal.enabled',
    page: 'customerPortal',
    title: 'portal.enablePortal',
    description: 'portal.enablePortalHint',
    anchor: 'portal-enabled',
    keywords: ['enable portal', 'customer portal', 'self-service', 'customer login', 'magic link'],
  },
  {
    id: 'customerPortal.slug',
    page: 'customerPortal',
    title: 'portal.customSlug',
    description: 'portal.slugHint',
    anchor: 'portal-slug',
    keywords: ['portal slug', 'portal address', 'custom url', 'portal name'],
  },
  {
    id: 'customerPortal.description',
    page: 'customerPortal',
    title: 'portal.descriptionLabel',
    description: 'portal.descriptionHint',
    anchor: 'portal-description',
    keywords: ['about us', 'workshop description', 'landing page text', 'portal text'],
  },
  {
    id: 'customerPortal.hours',
    page: 'customerPortal',
    title: 'portal.hoursLabel',
    description: 'portal.hoursHint',
    anchor: 'portal-hours',
    keywords: ['opening hours', 'business hours', 'open times', 'åpningstider'],
  },
  {
    id: 'customerPortal.url',
    page: 'customerPortal',
    title: 'portal.portalUrl',
    description: 'portal.shareHint',
    anchor: 'customer-portal-url',
    keywords: ['portal link', 'portal url', 'share portal', 'copy link'],
  },
  {
    id: 'customerPortal.requestAlerts',
    page: 'customerPortal',
    title: 'portal.serviceRequestAlertsLink',
    description: 'portal.serviceRequestAlertsHint',
    anchor: 'customer-portal-request-alerts',
    keywords: ['service requests', 'booking requests', 'request alerts', 'notifications'],
  },
  {
    id: 'customerPortal.background',
    page: 'customerPortal',
    title: 'portal.background.title',
    description: 'portal.background.description',
    anchor: 'customer-portal-background',
    keywords: ['portal background', 'portal look', 'landing page', 'portal theme'],
  },
  {
    id: 'customerPortal.backgroundTemplate',
    page: 'customerPortal',
    title: 'portal.background.chooseTemplate',
    anchor: 'customer-portal-background-template',
    keywords: ['background template', 'gradient', 'portal colours'],
  },
  {
    id: 'customerPortal.backgroundImage',
    page: 'customerPortal',
    title: 'portal.background.uploadLabel',
    description: 'portal.background.uploadHint',
    anchor: 'customer-portal-background-image',
    keywords: ['background image', 'upload background', 'portal photo', 'cover image'],
  },
]
