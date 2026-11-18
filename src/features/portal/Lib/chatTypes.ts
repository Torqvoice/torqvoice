/**
 * The shapes of the chat between a customer and the workshop, as the portal
 * passes them around. Plain data: dates are ISO strings, so a server
 * component can hand a thread to a client one.
 */

import { z } from 'zod'

/**
 * A photo or video sent with a message. `url` is where the signed-in
 * customer can read it (the portal's own file route), not the stored url.
 */
export interface PortalChatAttachment {
  url: string
  /** What the file is, from its extension. */
  kind: 'image' | 'video' | 'file'
}

export interface PortalChatMessage {
  id: string
  /**
   * 'inbound' was written by the customer (the reader of the portal, so it
   * sits on the right as "me"); 'outbound' by the workshop.
   */
  direction: 'inbound' | 'outbound'
  /** The text; empty when the message is only photos. */
  body: string
  attachments: PortalChatAttachment[]
  /** Who at the workshop wrote an outbound message, by first name. Null on the customer's own. */
  authorName: string | null
  createdAt: string
  /** When the other side first saw it; null while unread. */
  readAt: string | null
}

/** The end of a customer's thread and how much of it they have not seen. */
export interface PortalThreadPreview {
  /** Messages from the workshop this customer has not opened. */
  unread: number
  /** The latest messages, oldest first. */
  messages: PortalChatMessage[]
}

export const EMPTY_THREAD_PREVIEW: PortalThreadPreview = { unread: 0, messages: [] }

/**
 * Something that happened to the customer's car or papers, drawn into the
 * thread at the moment it happened. Never stored as a message: it is read
 * from the job, the update, the quote or the invoice itself, so it is always
 * as true as they are.
 */
export type PortalChatEventKind = 'work_started' | 'update' | 'quote' | 'invoice'

export interface PortalChatEvent {
  /** Stable between polls: the kind and the record it came from. */
  id: string
  kind: PortalChatEventKind
  /** When it happened. */
  at: string
  /**
   * `at` is a calendar day and not a moment: an invoice that was never sent
   * stands on its own date, which has no time of day. The chat prints the day
   * for it and never a clock time.
   */
  dayOnly: boolean
  /** "Volvo V60", when the record is about a car. */
  vehicle: string | null
  /** The job's, quote's or invoice's own title, or what the workshop wrote with an update. */
  title: string | null
  /** The quote's or invoice's total, already printed in the workshop's currency. */
  amount: string | null
  /** Where the customer reads it; null when there is nothing to open. */
  href: string | null
  /** A quote the customer can still answer: the link reads "Read and answer". */
  answerable: boolean
  /** An invoice with money still owed whose due day has passed on the workshop's calendar. */
  overdue: boolean
}

/**
 * Whether an event is drawn as a card with a button, or as one quiet line.
 * A card is for what waits for the customer now: a quote to answer, an
 * invoice that is overdue, an update the workshop shared. Everything else,
 * and each of those once it is answered or paid, is a line, so the thread
 * stays about the messages.
 */
export function portalEventIsCard(event: Pick<PortalChatEvent, 'kind' | 'answerable' | 'overdue'>) {
  return event.kind === 'update' || event.answerable || event.overdue
}

/** A customer's thread as the chat reads it: messages, events, and how much is new. */
export interface PortalThread {
  /** False when the workshop turned the chat off: the thread can be read, not written to. */
  enabled: boolean
  /** Messages from the workshop this customer has not opened. */
  unread: number
  /** The latest messages, oldest first. */
  messages: PortalChatMessage[]
  /** What happened around those messages, oldest first. */
  events: PortalChatEvent[]
  /** The thread has older messages or events than these: "Show earlier". */
  hasEarlier: boolean
}

/** How many days of events the thread starts with, and each "Show earlier" adds. */
export const PORTAL_EVENT_DAYS = 30
/** The furthest back events are ever read. */
export const PORTAL_EVENT_MAX_DAYS = 180

/** How many more messages "Show earlier messages" brings, and the most a thread loads. */
export const PORTAL_THREAD_STEP = 30
export const PORTAL_THREAD_MAX = 300

/** The most a customer can send in one message. */
export const PORTAL_MESSAGE_MAX_LENGTH = 4000
export const PORTAL_MESSAGE_MAX_PHOTOS = 6

/**
 * What a send or a read of the chat can refuse with. The action answers the
 * code and the chat says it in the portal's language.
 */
export const PORTAL_CHAT_ERRORS = [
  'chat_off',
  'too_fast',
  'empty',
  'not_yours',
  // The workshop is being restored from a backup; a few minutes later it works.
  'restoring',
] as const
export type PortalChatError = (typeof PORTAL_CHAT_ERRORS)[number]

const attachmentSchema = z.object({
  url: z.string(),
  kind: z.enum(['image', 'video', 'file']),
})

export const portalChatMessageSchema = z.object({
  id: z.string(),
  direction: z.enum(['inbound', 'outbound']),
  body: z.string(),
  attachments: z.array(attachmentSchema),
  authorName: z.string().nullable(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
})

export const portalChatEventSchema = z.object({
  id: z.string(),
  kind: z.enum(['work_started', 'update', 'quote', 'invoice']),
  at: z.string(),
  // Left out by a server from before the field existed: a moment, as before.
  dayOnly: z.boolean().default(false),
  vehicle: z.string().nullable(),
  title: z.string().nullable(),
  amount: z.string().nullable(),
  href: z.string().nullable(),
  answerable: z.boolean(),
  overdue: z.boolean(),
})

/** What the chat's poll answers, checked before it is drawn. */
export const portalThreadSchema = z.object({
  enabled: z.boolean(),
  unread: z.number().int().min(0),
  messages: z.array(portalChatMessageSchema),
  events: z.array(portalChatEventSchema),
  hasEarlier: z.boolean(),
})
