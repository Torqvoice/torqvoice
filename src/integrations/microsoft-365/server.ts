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

const GRAPH = 'https://graph.microsoft.com/v1.0'

interface GraphEvent {
  id: string
  subject?: string
  isAllDay?: boolean
  isCancelled?: boolean
  start?: { dateTime: string; timeZone: string }
  end?: { dateTime: string; timeZone: string }
  lastModifiedDateTime?: string
  onlineMeeting?: { joinUrl?: string } | null
  webLink?: string
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

/** Graph wants a local-looking timestamp plus a zone; UTC keeps it unambiguous. */
function graphTime(d: Date): { dateTime: string; timeZone: string } {
  return { dateTime: d.toISOString().replace('Z', ''), timeZone: 'UTC' }
}

/**
 * An all-day event comes back as midnight of its day in the requested zone,
 * which is UTC here; the day is the workshop's, so it is anchored there or
 * a workshop west of UTC sees it on the evening before.
 */
function allDayBound(t: { dateTime: string } | undefined, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t?.dateTime ?? '')
  return m ? zonedDate(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, timeZone) : null
}

/** Graph returns times in the requested zone (UTC here) without a Z. */
function fromGraphTime(t: { dateTime: string; timeZone: string } | undefined): Date | null {
  if (!t?.dateTime) return null
  const trimmed = t.dateTime.replace(/(\.\d{3})\d+$/, '$1')
  const d = new Date(t.timeZone === 'UTC' || !t.timeZone ? `${trimmed}Z` : trimmed)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Put the work order on the calendar, as a Teams meeting when the setting
 * says so or a person asked for one from the work order (`action:
 * 'create'`, remembered as `manual` on the link). A meeting added by hand
 * keeps its event even with the automatic push switched off, since the
 * meeting is the event.
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
      const res = await ctx.http.fetch(`${GRAPH}/me/events/${encodeURIComponent(link.remoteId)}`, {
        method: 'DELETE',
      })
      if (!res.ok && res.status !== 404)
        throw new ConnectorHttpError(res.status, await res.text(), 'events')
    } catch (err) {
      if (!(err instanceof ConnectorHttpError && err.status === 404)) throw err
    }
    await ctx.links.remove(SERVICE_ENTITY, serviceRecordId)
    return { summary: 'event removed' }
  }

  if (link?.checksum === draft.checksum && (!wantMeeting || link.metadata?.meetingUrl)) {
    return { summary: 'unchanged' }
  }

  // Graph does not let an online meeting be switched off again, so it is
  // only asked for while the event has none.
  const body: Record<string, unknown> = {
    subject: draft.title,
    body: { contentType: 'text', content: draft.description },
    start: graphTime(draft.start),
    end: graphTime(draft.end),
    ...(wantMeeting &&
      !link?.metadata?.meetingUrl && {
        isOnlineMeeting: true,
        onlineMeetingProvider: 'teamsForBusiness',
      }),
  }

  let saved: GraphEvent
  if (link) {
    try {
      saved = await ctx.http.json<GraphEvent>(
        `${GRAPH}/me/events/${encodeURIComponent(link.remoteId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        }
      )
    } catch (err) {
      if (err instanceof ConnectorHttpError && err.status === 404) {
        saved = await ctx.http.json<GraphEvent>(
          `${GRAPH}/me/calendars/${encodeURIComponent(settings.calendarId)}/events`,
          {
            method: 'POST',
            body: JSON.stringify(body),
          }
        )
      } else throw err
    }
  } else {
    saved = await ctx.http.json<GraphEvent>(
      `${GRAPH}/me/calendars/${encodeURIComponent(settings.calendarId)}/events`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    )
  }

  // Graph fills the join link a moment after an update returns; one read
  // back catches it rather than leaving the work order without a link.
  if (wantMeeting && !link?.metadata?.meetingUrl && !saved.onlineMeeting?.joinUrl) {
    saved = await ctx.http.json<GraphEvent>(
      `${GRAPH}/me/events/${encodeURIComponent(saved.id)}?$select=id,webLink,onlineMeeting`
    )
  }
  const meetingUrl = saved.onlineMeeting?.joinUrl
  if (manual && action === 'create' && !meetingUrl && !link?.metadata?.meetingUrl) {
    throw new Error(
      'Microsoft did not add a Teams meeting to the event. Teams meetings need a work or school account with Teams.'
    )
  }

  await ctx.links.set(SERVICE_ENTITY, serviceRecordId, {
    remoteId: saved.id,
    remoteUrl: saved.webLink ?? null,
    checksum: draft.checksum,
    metadata: {
      ...(link?.metadata ?? {}),
      calendarId: settings.calendarId,
      ...(manual && { manual: true }),
      ...(meetingUrl && { meetingUrl, meetingProvider: 'teams' }),
    },
  })
  return { summary: link ? 'event updated' : 'event created' }
}

function toPulled(e: GraphEvent, timeZone: string): PulledEvent | null {
  if (e.isCancelled) return null
  const allDay = Boolean(e.isAllDay)
  const start = allDay ? allDayBound(e.start, timeZone) : fromGraphTime(e.start)
  const end = allDay ? allDayBound(e.end, timeZone) : fromGraphTime(e.end)
  if (!start || !end) return null
  return {
    remoteId: e.id,
    title: e.subject ?? '',
    start,
    end,
    allDay,
    updatedAt: e.lastModifiedDateTime ? new Date(e.lastModifiedDateTime) : null,
    url: e.webLink ?? null,
  }
}

async function pullBusy(ctx: ConnectorContext) {
  const settings = settingsOf(ctx)
  if (!settings.pullEnabled) return { summary: 'pull switched off' }
  if (!settings.calendarId) return { summary: 'no calendar chosen' }
  const window = pullWindow()
  const timeZone = await workshopTimeZone(ctx.connection.organizationId)
  const events: PulledEvent[] = []
  let next: string | undefined = (() => {
    const url = new URL(
      `${GRAPH}/me/calendars/${encodeURIComponent(settings.calendarId)}/calendarView`
    )
    url.searchParams.set('startDateTime', window.from.toISOString())
    url.searchParams.set('endDateTime', window.to.toISOString())
    url.searchParams.set('$top', '250')
    url.searchParams.set(
      '$select',
      'id,subject,start,end,isAllDay,isCancelled,lastModifiedDateTime,webLink'
    )
    return url.toString()
  })()
  while (next) {
    const page: { value?: GraphEvent[]; '@odata.nextLink'?: string } = await ctx.http.json(next, {
      headers: { Prefer: 'outlook.timezone="UTC"' },
    })
    for (const item of page.value ?? []) {
      const pulled = toPulled(item, timeZone)
      if (pulled) events.push(pulled)
    }
    next = page['@odata.nextLink']
  }
  const result = await storePulledEvents(ctx, settings.calendarId, events, window)
  return { summary: `${result.stored} busy events cached` }
}

export const connector: ConnectorServer = {
  manifest,
  async identify(ctx) {
    const me = await ctx.http.json<{
      id: string
      mail?: string | null
      userPrincipalName?: string
      displayName?: string
    }>(`${GRAPH}/me?$select=id,mail,userPrincipalName,displayName`)
    return { id: me.id, name: me.mail ?? me.userPrincipalName ?? me.displayName ?? me.id }
  },
  async test(ctx) {
    const settings = settingsOf(ctx)
    const list = await ctx.http.json<{ value?: { id: string }[] }>(
      `${GRAPH}/me/calendars?$select=id`
    )
    if (settings.calendarId && !list.value?.some((c) => c.id === settings.calendarId)) {
      return { ok: false, message: 'The chosen calendar is no longer available' }
    }
    return { ok: true }
  },
  remoteOptions: {
    async calendars(ctx) {
      const list = await ctx.http.json<{
        value?: { id: string; name: string; canEdit?: boolean; isDefaultCalendar?: boolean }[]
      }>(`${GRAPH}/me/calendars?$select=id,name,canEdit,isDefaultCalendar`)
      return (list.value ?? [])
        .filter((c) => c.canEdit !== false)
        .sort((a, b) => Number(Boolean(b.isDefaultCalendar)) - Number(Boolean(a.isDefaultCalendar)))
        .map((c) => ({ value: c.id, label: c.name }))
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
