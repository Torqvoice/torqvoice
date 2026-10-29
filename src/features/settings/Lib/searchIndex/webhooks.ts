import type { SettingsEntry } from './types'

/**
 * Webhooks. The tabs are local state rather than a query string, so the
 * tab entries land on the tab bar. The create form lives in a dialog behind
 * "Add webhook", so its fields land on the header that holds the button.
 */
export const webhooksEntries: SettingsEntry[] = [
  {
    id: 'webhooks.add',
    page: 'webhooks',
    title: 'webhooks.create',
    description: 'webhooks.createDescription',
    anchor: 'webhooks-header',
    keywords: [
      'add webhook',
      'new webhook',
      'create webhook',
      'endpoint url',
      'callback url',
      'http post',
      'zapier',
      'real-time event notifications',
    ],
  },
  {
    id: 'webhooks.events',
    page: 'webhooks',
    title: 'webhooks.events',
    description: 'webhooks.eventsHint',
    anchor: 'webhooks-header',
    keywords: ['webhook events', 'subscribe', 'all events', 'event triggers', 'which events'],
  },
  {
    id: 'webhooks.list',
    page: 'webhooks',
    title: 'webhooks.tabWebhooks',
    anchor: 'webhooks-tabs',
    keywords: ['webhook list', 'my webhooks', 'edit webhook', 'delete webhook', 'endpoints'],
  },
  {
    id: 'webhooks.deliveries',
    page: 'webhooks',
    title: 'webhooks.deliveries',
    description: 'webhooks.deliveriesDescription',
    anchor: 'webhooks-tabs',
    keywords: [
      'deliveries',
      'delivery log',
      'webhook history',
      'failed deliveries',
      'retry',
      'payload',
    ],
  },
  {
    id: 'webhooks.sendTest',
    page: 'webhooks',
    title: 'webhooks.sendTest',
    anchor: 'webhooks-tabs',
    keywords: ['test webhook', 'send test', 'ping', 'test event'],
  },
  {
    id: 'webhooks.autoPaused',
    page: 'webhooks',
    title: 'webhooks.autoDisabled',
    description: 'webhooks.autoDisabledBanner',
    anchor: 'webhooks-tabs',
    keywords: [
      'pause webhook',
      'disable webhook',
      'enable webhook',
      'auto-paused',
      're-enable',
      'resume webhook',
    ],
  },
  {
    id: 'webhooks.rotateSecret',
    page: 'webhooks',
    title: 'webhooks.rotateSecret',
    description: 'webhooks.confirmRotateDescription',
    anchor: 'webhooks-tabs',
    keywords: [
      'rotate secret',
      'signing secret',
      'webhook secret',
      'new secret',
      'regenerate secret',
    ],
  },
  {
    id: 'webhooks.signatures',
    page: 'webhooks',
    title: 'webhooks.helpTitle',
    description: 'webhooks.helpIntro',
    anchor: 'webhooks-signatures',
    keywords: [
      'webhook signature',
      'verify signature',
      'hmac',
      'sha256',
      'x-torqvoice-signature',
      'headers',
      'webhook secret',
    ],
  },
  {
    id: 'webhooks.reference',
    page: 'webhooks',
    title: 'webhooks.tabReference',
    description: 'webhooks.referenceIntro',
    anchor: 'webhooks-tabs',
    keywords: [
      'events reference',
      'event types',
      'sample payload',
      'envelope',
      'webhook documentation',
      'json',
    ],
  },
]
