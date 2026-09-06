import {
  SERVICE_ENTITY,
  draftCalendarEvent,
  loadServiceForCalendar,
  type PulledEvent,
  pullWindow,
  storePulledEvents,
} from '@/features/integrations/Lib/calendar-sync'
import {
  ConnectorHttpError,
  type ConnectorContext,
  type ConnectorServer,
} from '@/features/integrations/Lib/types'
import { manifest } from './manifest'
import { zonedDate } from '@/lib/timezone'
import { workshopTimeZone } from '@/lib/workshop-timezone'

const API = 'https://www.googleapis.com/calendar/v3'

interface GoogleEvent {
  id: string
  status?: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  updated?: string
  htmlLink?: string
  hangoutLink?: string
  extendedProperties?: { private?: Record<string, string> }
}

function settingsOf(ctx: ConnectorContext) {
  const s = ctx.connection.settings
  return {
    calendarId: typeof s.calendarId === 'string' ? s.calendarId : '',
    pushEnabled: s.pushEnabled !== false,
    includeCustomer: s.includeCustomer !== false,
    addConference: s.addConference === true,
    pullEnabled: s.pullEnabled !== false,
  }
}

function eventsUrl(calendarId: string, eventId?: string): string {
  const base = `${API}/calendars/${encodeURIComponent(calendarId)}/events`
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base
}

/**
 * Put the work order on the calendar, with a Meet link when the setting
 * says so or a person asked for one from the work order (`action:
 * 'create'`, remembered as `manual` on the link). A meeting added by hand
 * keeps its event even with the automatic push switched off.
 */
async function pushService(
  ctx: ConnectorContext,
  serviceRecordId: string,
  action: 'create' | null = null
) {
  const settings = settingsOf(ctx)
  if (!settings.calendarId) throw new Error('No calendar chosen in the integration settings')
  const link = await ctx.links.get(SERVICE_ENTITY, serviceRecordId)
  const record = await loadServiceForCalendar(ctx.connection.organizationId, serviceRecordId)
  const draft = record
    ? draftCalendarEvent(record, { appUrl: ctx.appUrl, includeCustomer: settings.includeCustomer })
    : null
  const manual = action === 'create' || link?.metadata?.manual === true
  const wantMeeting = settings.addConference || manual

  if (!draft || !(settings.pushEnabled || manual)) {
    if (!link) return { summary: 'nothing to do' }
    try {
      await ctx.http.fetch(eventsUrl(settings.calendarId, link.remoteId), { method: 'DELETE' })
    } catch (err) {
      if (!(err instanceof ConnectorHttpError && (err.status === 404 || err.status === 410)))
        throw err
    }
    await ctx.links.remove(SERVICE_ENTITY, serviceRecordId)
    return { summary: 'event removed' }
  }

  if (link?.checksum === draft.checksum && (!wantMeeting || link.metadata?.meetingUrl)) {
    return { summary: 'unchanged' }
  }

  const body: Record<string, unknown> = {
    summary: draft.title,
    description: draft.description,
    start: { dateTime: draft.start.toISOString(), timeZone: ctx.timezone },
    end: { dateTime: draft.end.toISOString(), timeZone: ctx.timezone },
    source: { title: 'Torqvoice', url: draft.url },
    extendedProperties: { private: { torqvoiceServiceId: serviceRecordId } },
  }
  if (wantMeeting && !link?.metadata?.meetingUrl) {
    body.conferenceData = {
      createRequest: {
        requestId: `torqvoice-${serviceRecordId}-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    }
  }

  let saved: GoogleEvent
  if (link) {
    try {
      saved = await ctx.http.json<GoogleEvent>(
        `${eventsUrl(settings.calendarId, link.remoteId)}?conferenceDataVersion=1`,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        }
      )
    } catch (err) {
      if (err instanceof ConnectorHttpError && (err.status === 404 || err.status === 410)) {
        saved = await ctx.http.json<GoogleEvent>(
          `${eventsUrl(settings.calendarId)}?conferenceDataVersion=1`,
          {
            method: 'POST',
            body: JSON.stringify(body),
          }
        )
      } else throw err
    }
  } else {
    saved = await ctx.http.json<GoogleEvent>(
      `${eventsUrl(settings.calendarId)}?conferenceDataVersion=1`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    )
  }

  // Google creates the Meet room after the write returns; one read back
  // catches the link rather than leaving the work order without it.
  if (wantMeeting && !link?.metadata?.meetingUrl && !saved.hangoutLink) {
    saved = await ctx.http.json<GoogleEvent>(eventsUrl(settings.calendarId, saved.id))
  }
  if (action === 'create' && !saved.hangoutLink && !link?.metadata?.meetingUrl) {
    throw new Error('Google did not add a Meet link to the event. Try again in a moment.')
  }

  await ctx.links.set(SERVICE_ENTITY, serviceRecordId, {
    remoteId: saved.id,
    remoteUrl: saved.htmlLink ?? null,
    checksum: draft.checksum,
    metadata: {
      ...(link?.metadata ?? {}),
      calendarId: settings.calendarId,
      ...(manual && { manual: true }),
      ...(saved.hangoutLink && { meetingUrl: saved.hangoutLink, meetingProvider: 'google-meet' }),
    },
  })
  return { summary: link ? 'event updated' : 'event created' }
}

// An all-day event carries bare days; they are the workshop's days, not UTC's.
function allDayBound(day: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  return m ? zonedDate(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, timeZone) : null
}

function toPulled(e: GoogleEvent, timeZone: string): PulledEvent | null {
  if (e.status === 'cancelled') return null
  const allDay = Boolean(e.start?.date)
  const start = e.start?.dateTime
    ? new Date(e.start.dateTime)
    : e.start?.date
      ? allDayBound(e.start.date, timeZone)
      : null
  const end = e.end?.dateTime
    ? new Date(e.end.dateTime)
    : e.end?.date
      ? allDayBound(e.end.date, timeZone)
      : null
  if (!start || !end) return null
  return {
    remoteId: e.id,
    title: e.summary ?? '',
    start,
    end,
    allDay,
    updatedAt: e.updated ? new Date(e.updated) : null,
    url: e.htmlLink ?? null,
  }
}

async function pullBusy(ctx: ConnectorContext) {
  const settings = settingsOf(ctx)
  if (!settings.pullEnabled) return { summary: 'pull switched off' }
  if (!settings.calendarId) return { summary: 'no calendar chosen' }
  const window = pullWindow()
  const timeZone = await workshopTimeZone(ctx.connection.organizationId)
  const events: PulledEvent[] = []
  let pageToken: string | undefined
  do {
    const url = new URL(eventsUrl(settings.calendarId))
    url.searchParams.set('timeMin', window.from.toISOString())
    url.searchParams.set('timeMax', window.to.toISOString())
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('maxResults', '250')
    url.searchParams.set(
      'fields',
      'nextPageToken,items(id,status,summary,start,end,updated,htmlLink,extendedProperties)'
    )
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const page = await ctx.http.json<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      url.toString()
    )
    for (const item of page.items ?? []) {
      if (item.extendedProperties?.private?.torqvoiceServiceId) continue
      const pulled = toPulled(item, timeZone)
      if (pulled) events.push(pulled)
    }
    pageToken = page.nextPageToken
  } while (pageToken)
  const result = await storePulledEvents(ctx, settings.calendarId, events, window)
  return { summary: `${result.stored} busy events cached` }
}

export const connector: ConnectorServer = {
  manifest,
  async identify(ctx) {
    const me = await ctx.http.json<{ sub: string; email?: string; name?: string }>(
      'https://www.googleapis.com/oauth2/v3/userinfo'
    )
    return { id: me.sub, name: me.email ?? me.name ?? me.sub }
  },
  async test(ctx) {
    const settings = settingsOf(ctx)
    const list = await ctx.http.json<{ items?: { id: string }[] }>(
      `${API}/users/me/calendarList?minAccessRole=writer&fields=items(id)`
    )
    if (settings.calendarId && !list.items?.some((c) => c.id === settings.calendarId)) {
      return { ok: false, message: 'The chosen calendar is no longer available' }
    }
    return { ok: true }
  },
  remoteOptions: {
    async calendars(ctx) {
      const list = await ctx.http.json<{
        items?: { id: string; summary: string; primary?: boolean }[]
      }>(`${API}/users/me/calendarList?minAccessRole=writer&fields=items(id,summary,primary)`)
      return (list.items ?? [])
        .sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)))
        .map((c) => ({ value: c.id, label: c.summary }))
    },
  },
  jobs: {
    'calendar.push': async (ctx, payload) => {
      const id = typeof payload.entityId === 'string' ? payload.entityId : null
      if (!id) return { summary: 'no record id' }
      return pushService(ctx, id, payload.action === 'create' ? 'create' : null)
    },
    'calendar.pull': pullBusy,
  },
}
