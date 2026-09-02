import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * Zoom: a video meeting on a scheduled work order, with the join link on the
 * work order. A person adds one from the work order page; the automatic
 * option gives every scheduled work order a meeting instead. Granular
 * user-level scopes, no admin scopes; Zoom puts the client credentials in a
 * Basic header on token requests.
 */
export const manifest: ConnectorManifest = {
  id: 'zoom',
  name: 'Zoom',
  category: 'conferencing',
  countries: 'global',
  logo: '/images/integrations/zoom.svg',
  docs: '/docs/integrations/zoom',
  auth: {
    type: 'oauth2',
    authorizeUrl: 'https://zoom.us/oauth/authorize',
    tokenUrl: 'https://zoom.us/oauth/token',
    scopes: [
      'meeting:write:meeting',
      'meeting:update:meeting',
      'meeting:delete:meeting',
      'meeting:read:meeting',
      'user:read:user',
    ],
    tokenAuth: 'basic',
    pkce: true,
    platformEnv: {
      clientId: 'ZOOM_INTEGRATION_CLIENT_ID',
      clientSecret: 'ZOOM_INTEGRATION_CLIENT_SECRET',
    },
    tenantFields: [
      { key: 'clientId', label: 'clientId', type: 'text', required: true },
      { key: 'clientSecret', label: 'clientSecret', type: 'password', required: true },
    ],
    tenantHelp: 'tenantHelp',
  },
  capabilities: ['calendar.conference'],
  settings: [
    {
      key: 'autoCreate',
      type: 'boolean',
      label: 'autoCreate',
      help: 'autoCreateHelp',
      default: false,
    },
    {
      key: 'includeCustomer',
      type: 'boolean',
      label: 'includeCustomer',
      default: true,
    },
    {
      key: 'joinBeforeHost',
      type: 'boolean',
      label: 'joinBeforeHost',
      default: true,
    },
    {
      key: 'waitingRoom',
      type: 'boolean',
      label: 'waitingRoom',
      default: false,
    },
  ],
  subscriptions: [
    { event: 'service.create', job: 'conference.sync' },
    { event: 'service.update', job: 'conference.sync' },
    { event: 'service.status', job: 'conference.sync' },
    { event: 'service.delete', job: 'conference.sync' },
  ],
}
