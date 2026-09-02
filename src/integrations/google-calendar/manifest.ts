import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * Google Calendar, with Google Meet for the video call link.
 *
 * Scopes are the narrow ones: events on calendars the user can write to,
 * and the calendar list so the workshop can pick which calendar. Nothing
 * else on the account is readable.
 */
export const manifest: ConnectorManifest = {
  id: 'google-calendar',
  name: 'Google Calendar',
  category: 'calendar',
  also: ['conferencing'],
  countries: 'global',
  logo: '/images/integrations/google-calendar.svg',
  docs: '/docs/integrations/google-calendar',
  auth: {
    type: 'oauth2',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    ],
    authorizeParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    pkce: true,
    platformEnv: {
      clientId: 'GOOGLE_INTEGRATION_CLIENT_ID',
      clientSecret: 'GOOGLE_INTEGRATION_CLIENT_SECRET',
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
