import {
  SERVICE_ENTITY,
  draftCalendarEvent,
  loadServiceForCalendar,
} from '@/features/integrations/Lib/calendar-sync'
import {
  ConnectorHttpError,
  type ConnectorContext,
  type ConnectorServer,
} from '@/features/integrations/Lib/types'
import { manifest } from './manifest'

const API = 'https://api.zoom.us/v2'

interface ZoomMeeting {
  id: number
  join_url?: string
  start_url?: string
  password?: string
}

function settingsOf(ctx: ConnectorContext) {
  const s = ctx.connection.settings
  return {
    autoCreate: s.autoCreate !== false,
    includeCustomer: s.includeCustomer !== false,
    joinBeforeHost: s.joinBeforeHost !== false,
    waitingRoom: s.waitingRoom === true,
  }
}

async function deleteMeeting(ctx: ConnectorContext, meetingId: string): Promise<void> {
  const res = await ctx.http.fetch(`${API}/meetings/${encodeURIComponent(meetingId)}`, {
    method: 'DELETE',
  })
  // 404: already gone. 400 with code 3001 is Zoom's "meeting does not exist".
  if (!res.ok && res.status !== 404 && res.status !== 400) {
    throw new ConnectorHttpError(res.status, await res.text(), 'meetings')
  }
}

async function syncMeeting(ctx: ConnectorContext, serviceRecordId: string) {
  const settings = settingsOf(ctx)
  const link = await ctx.links.get(SERVICE_ENTITY, serviceRecordId)
  const record = await loadServiceForCalendar(ctx.connection.organizationId, serviceRecordId)
  const draft = record
    ? draftCalendarEvent(record, { appUrl: ctx.appUrl, includeCustomer: settings.includeCustomer })
    : null

  if (!draft || !settings.autoCreate) {
    if (!link) return { summary: 'nothing to do' }
    await deleteMeeting(ctx, link.remoteId)
    await ctx.links.remove(SERVICE_ENTITY, serviceRecordId)
    return { summary: 'meeting removed' }
  }

  // Settings changes do not alter the checksum, so a saved toggle is applied
  // the next time the work order itself changes. Good enough for a join link.
  if (link?.checksum === draft.checksum && link.metadata?.meetingUrl)
    return { summary: 'unchanged' }

  const durationMinutes = Math.max(
    15,
    Math.round((draft.end.getTime() - draft.start.getTime()) / 60_000)
  )
  const body = {
    topic: draft.title.slice(0, 200),
    type: 2,
    start_time: draft.start.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    duration: durationMinutes,
    timezone: ctx.timezone,
    agenda: draft.description.slice(0, 2000),
    settings: {
      join_before_host: settings.joinBeforeHost,
      waiting_room: settings.waitingRoom,
      approval_type: 2,
    },
  }

  let meeting: ZoomMeeting
  if (link) {
    const res = await ctx.http.fetch(`${API}/meetings/${encodeURIComponent(link.remoteId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    if (res.status === 204 || res.ok) {
      // PATCH returns no body; keep the join link we already have.
      meeting = { id: Number(link.remoteId), join_url: String(link.metadata?.meetingUrl ?? '') }
    } else if (res.status === 404 || res.status === 400) {
      meeting = await ctx.http.json<ZoomMeeting>(`${API}/users/me/meetings`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
    } else {
      throw new ConnectorHttpError(res.status, await res.text(), 'meetings')
    }
  } else {
    meeting = await ctx.http.json<ZoomMeeting>(`${API}/users/me/meetings`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  await ctx.links.set(SERVICE_ENTITY, serviceRecordId, {
    remoteId: String(meeting.id),
    remoteUrl: meeting.start_url ?? null,
    checksum: draft.checksum,
    metadata: {
      ...(link?.metadata ?? {}),
      ...(meeting.join_url && { meetingUrl: meeting.join_url, meetingProvider: 'zoom' }),
      ...(meeting.password && { password: meeting.password }),
    },
  })
  return { summary: link ? 'meeting updated' : 'meeting created' }
}

export const connector: ConnectorServer = {
  manifest,
  async identify(ctx) {
    const me = await ctx.http.json<{ id: string; email?: string; display_name?: string }>(
      `${API}/users/me`
    )
    return { id: me.id, name: me.email ?? me.display_name ?? me.id }
  },
  async test(ctx) {
    await ctx.http.json(`${API}/users/me`)
    return { ok: true }
  },
  jobs: {
    'conference.sync': async (ctx, payload) => {
      const id = typeof payload.entityId === 'string' ? payload.entityId : null
      if (!id) return { summary: 'no record id' }
      return syncMeeting(ctx, id)
    },
  },
}
