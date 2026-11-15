import {
  type PortalChatEvent,
  type PortalChatMessage,
  portalEventIsCard,
} from '../../Lib/chatTypes'

/**
 * The thread as it is drawn: messages and events in the order they happened,
 * under a line for each day on the workshop's calendar.
 *
 * Pure, so what the thread shows can be checked without drawing it. The day
 * a message belongs to is the workshop's: a message sent at 23:30 in Oslo is
 * under that evening's date for a customer reading it from anywhere.
 */

/** A message the customer has sent that the server has not confirmed yet. */
export interface PortalOutgoing {
  /** Made in the browser; never the id of a stored message. */
  localId: string
  body: string
  /** The photos and video as the browser holds them, for the bubble. */
  previews: { url: string; kind: 'image' | 'video' }[]
  /** The stored urls the upload answered, sent with the message. */
  attachments: string[]
  createdAt: string
  state: 'sending' | 'failed'
  /** Why it failed, as a refusal the chat can say; null for "could not send". */
  problem: string | null
}

export type PortalThreadItem =
  | { type: 'day'; key: string; at: string }
  | {
      type: 'message'
      key: string
      message: PortalChatMessage
      /** The last bubble of a run: who wrote and when stand under it. */
      closesRun: boolean
    }
  | { type: 'outgoing'; key: string; outgoing: PortalOutgoing }
  | { type: 'event'; key: string; event: PortalChatEvent }
  /** Several quiet events of one kind on one day, folded into one line. */
  | { type: 'events'; key: string; kind: PortalChatEvent['kind']; events: PortalChatEvent[] }

/** "2026-11-14" on the workshop's calendar. */
export function workshopDayKey(iso: string, timeZone: string): string {
  // en-CA prints a date as YYYY-MM-DD, which sorts and compares as text.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

type Entry =
  | { type: 'message'; at: string; message: PortalChatMessage }
  | { type: 'event'; at: string; event: PortalChatEvent }
  | { type: 'events'; at: string; events: PortalChatEvent[] }
  | { type: 'outgoing'; at: string; outgoing: PortalOutgoing }

export function buildPortalThread(
  messages: PortalChatMessage[],
  events: PortalChatEvent[],
  outgoing: PortalOutgoing[],
  timeZone: string
): PortalThreadItem[] {
  const stored: Entry[] = [
    ...messages.map((message): Entry => ({ type: 'message', at: message.createdAt, message })),
    ...foldEvents(events, timeZone),
  ].sort((a, b) => a.at.localeCompare(b.at))
  // What is still on its way always sits at the end, in the order it was
  // written, whatever the browser's clock says next to the server's.
  const entries: Entry[] = [
    ...stored,
    ...outgoing.map((one): Entry => ({ type: 'outgoing', at: one.createdAt, outgoing: one })),
  ]

  const items: PortalThreadItem[] = []
  let day = ''
  entries.forEach((entry, index) => {
    const key = workshopDayKey(entry.at, timeZone)
    // A message still being sent never opens a day of its own before the
    // last stored one: it belongs to today, which is where it is drawn.
    if (key !== day && (entry.type !== 'outgoing' || key > day)) {
      day = key
      items.push({ type: 'day', key: `day:${key}`, at: entry.at })
    }
    if (entry.type === 'event') {
      items.push({ type: 'event', key: entry.event.id, event: entry.event })
      return
    }
    if (entry.type === 'events') {
      const [first] = entry.events
      items.push({
        type: 'events',
        key: `events:${first.kind}:${key}`,
        kind: first.kind,
        events: entry.events,
      })
      return
    }
    if (entry.type === 'outgoing') {
      items.push({ type: 'outgoing', key: entry.outgoing.localId, outgoing: entry.outgoing })
      return
    }
    const next = entries[index + 1]
    const sameRun =
      next?.type === 'message' &&
      next.message.direction === entry.message.direction &&
      next.message.authorName === entry.message.authorName &&
      workshopDayKey(next.at, timeZone) === key
    items.push({
      type: 'message',
      key: entry.message.id,
      message: entry.message,
      closesRun: !sameRun,
    })
  })
  return items
}

/**
 * Events as the thread places them. What waits for the customer (a card)
 * always stands alone. The rest are quiet lines, and several of one kind on
 * one day (five invoices sent in a batch) fold into a single line where the
 * first of them happened, so paperwork never buries the conversation.
 */
function foldEvents(events: PortalChatEvent[], timeZone: string): Entry[] {
  const entries: Entry[] = []
  const runs = new Map<string, PortalChatEvent[]>()
  for (const event of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    if (portalEventIsCard(event)) {
      entries.push({ type: 'event', at: event.at, event })
      continue
    }
    const run = `${event.kind}:${workshopDayKey(event.at, timeZone)}`
    const held = runs.get(run)
    if (held) held.push(event)
    else runs.set(run, [event])
  }
  for (const run of runs.values()) {
    entries.push(
      run.length === 1
        ? { type: 'event', at: run[0].at, event: run[0] }
        : { type: 'events', at: run[0].at, events: run }
    )
  }
  return entries
}

/** How the workshop prints its times: its zone and its 12 or 24 hour clock. */
export interface PortalChatClock {
  timeZone: string
  timeFormat: '12h' | '24h'
}

/** The four ways the thread prints a moment, in the portal's language on the workshop's clock. */
export type PortalChatStampKind = 'time' | 'day' | 'shortDay' | 'dayWithYear'

/**
 * The formatters behind every time and day in the thread. One function, so
 * the server (which prints the first thread) and the browser (which prints
 * what arrives later) ask for exactly the same thing.
 */
export function portalChatFormats(
  locale: string,
  clock: PortalChatClock
): Record<PortalChatStampKind, Intl.DateTimeFormat> {
  const zone = { timeZone: clock.timeZone }
  return {
    time: new Intl.DateTimeFormat(locale, {
      ...zone,
      ...(clock.timeFormat === '24h'
        ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
        : { hour: 'numeric', minute: '2-digit', hour12: true }),
    }),
    day: new Intl.DateTimeFormat(locale, {
      ...zone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
    // The day alone, for an event that has no time of day.
    shortDay: new Intl.DateTimeFormat(locale, { ...zone, day: 'numeric', month: 'short' }),
    dayWithYear: new Intl.DateTimeFormat(locale, {
      ...zone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  }
}

/**
 * The times and days of a thread, already printed, by the moment they print.
 *
 * The server and the browser do not print a time alike: each has its own
 * copy of the language data, and they disagree in small ways ("9:20 a. m."
 * with one kind of space or another, "sept" or "sep"). A chat that printed
 * its times on both sides was therefore one text on the server and another
 * in the browser, which React refuses (error 418) in any language where the
 * two copies differ. So the server prints the first thread's stamps once and
 * hands them over, and the browser shows those as they are; it prints only
 * what arrives after the page has loaded.
 */
export type PortalChatStamps = Record<string, Record<PortalChatStampKind, string>>

export function portalChatStamps(
  moments: string[],
  locale: string,
  clock: PortalChatClock
): PortalChatStamps {
  const formats = portalChatFormats(locale, clock)
  const stamps: PortalChatStamps = {}
  for (const iso of moments) {
    if (stamps[iso]) continue
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) continue
    stamps[iso] = {
      time: formats.time.format(date),
      day: formats.day.format(date),
      shortDay: formats.shortDay.format(date),
      dayWithYear: formats.dayWithYear.format(date),
    }
  }
  return stamps
}
