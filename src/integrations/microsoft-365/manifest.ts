import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * Microsoft 365 calendar (Outlook), with Teams for the video call link.
 * Works for work and school accounts and for personal Outlook.com accounts
 * through the common endpoint.
 */
export const manifest: ConnectorManifest = {
  id: 'microsoft-365',
  name: 'Microsoft 365 Calendar',
  category: 'calendar',
  also: ['conferencing'],
  countries: 'global',
  logo: '/images/integrations/microsoft-365.svg',
  docs: '/docs/integrations/microsoft-365',
  auth: {
    type: 'oauth2',
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['openid', 'email', 'offline_access', 'User.Read', 'Calendars.ReadWrite'],
    authorizeParams: { response_mode: 'query', prompt: 'select_account' },
    pkce: true,
    platformEnv: {
      clientId: 'MICROSOFT_INTEGRATION_CLIENT_ID',
      clientSecret: 'MICROSOFT_INTEGRATION_CLIENT_SECRET',
    },
    tenantFields: [
      { key: 'clientId', label: 'clientId', type: 'text', required: true },
      { key: 'clientSecret', label: 'clientSecret', type: 'password', required: true },
    ],
    tenantHelp: 'tenantHelp',
  },
  capabilities: ['calendar.push', 'calendar.pull', 'calendar.conference'],
  settings: [
    {
      key: 'calendarId',
      type: 'remote-select',
      label: 'calendarId',
      source: 'calendars',
      required: true,
    },
    { key: 'pushEnabled', type: 'boolean', label: 'pushEnabled', default: true },
    {
      key: 'includeCustomer',
      type: 'boolean',
      label: 'includeCustomer',
      default: true,
      showWhen: { key: 'pushEnabled', equals: true },
    },
    {
      key: 'addConference',
      type: 'boolean',
      label: 'addConference',
      help: 'addConferenceHelp',
      default: false,
      showWhen: { key: 'pushEnabled', equals: true },
    },
    {
      key: 'pullEnabled',
      type: 'boolean',
      label: 'pullEnabled',
      help: 'pullEnabledHelp',
      default: true,
    },
  ],
  subscriptions: [
    { event: 'service.create', job: 'calendar.push' },
    { event: 'service.update', job: 'calendar.push' },
    { event: 'service.status', job: 'calendar.push' },
    { event: 'service.delete', job: 'calendar.push' },
  ],
  schedules: [{ job: 'calendar.pull', everyMinutes: 15 }],
}
