/**
 * The contract every WhatsApp provider implements.
 *
 * Workshops reach WhatsApp through whoever will sell them a number: Meta
 * directly, Twilio, or one of the resellers a given country happens to favour.
 * Each speaks a different dialect on the wire, but a workshop only ever wants
 * to send a customer a line of text or a photo of a broken part, so that is
 * what this layer exposes. Everything provider-shaped stops at the adapter.
 *
 * Adding a provider means writing one adapter and registering it. No database
 * change, no settings constant, no branch anywhere else: credentials are
 * declared by the adapter and stored under its own namespace.
 */

export type WhatsappMediaType = 'image' | 'document' | 'video' | 'audio' | 'sticker'

/** How the provider stores a credential we need, so settings can render itself. */
export interface WhatsappCredentialField {
  /** Short name, stored as `whatsapp.cred.<provider>.<key>`. */
  key: string
  label: string
  /** Masked in the UI and never sent back to the client. */
  secret?: boolean
  required?: boolean
  placeholder?: string
  help?: string
}

/** Resolved settings for one organization, handed to every adapter call. */
export interface WhatsappContext {
  organizationId: string
  /** The workshop's own WhatsApp number, E.164, no provider prefix. */
  from: string
  credentials: Record<string, string>
}

/**
 * An approved message template.
 *
 * WhatsApp only allows free text within 24 hours of the customer's last
 * message. Outside that window every business-initiated message has to be a
 * template the provider approved in advance, which is why this is a first
 * class concept rather than an edge case.
 */
export interface WhatsappTemplate {
  /** Template name at Meta, or the Template SID at providers that wrap it. */
  name: string
  /** BCP-47ish language code the template was approved under, e.g. "de". */
  language: string
  /** Positional body variables, in the order the template declares them. */
  variables?: string[]
  /** Public URL for a template whose header carries an image or document. */
  headerMediaUrl?: string
  headerMediaType?: WhatsappMediaType
}

export interface WhatsappOutbound {
  to: string
  body?: string
  /**
   * Publicly reachable URL. Providers fetch media themselves at send time, so
   * a link behind our own auth will silently produce an empty message.
   */
  mediaUrl?: string
  mediaType?: WhatsappMediaType
  mediaFilename?: string
  /** Set instead of body when the service window has closed. */
  template?: WhatsappTemplate
}

export interface WhatsappSendResult {
  providerMessageId?: string
  /** Provider's own word for what happened, normalised to our statuses. */
  status: 'queued' | 'sent'
}

/** Media on a received message, kept as a reference the adapter can resolve. */
export interface WhatsappMediaRef {
  /** A provider media id, or a URL that needs the provider's credentials. */
  reference: string
  type: WhatsappMediaType
  mimeType?: string
  filename?: string
  caption?: string
}

export interface WhatsappInbound {
  providerMessageId?: string
  from: string
  to: string
  body?: string
  media?: WhatsappMediaRef
  sentAt?: Date
  /** The WhatsApp profile name, when the provider passes one along. */
  senderName?: string
}

export interface WhatsappStatusEvent {
  providerMessageId: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  errorMessage?: string
}

/** What one webhook delivery contained, after the adapter has read it. */
export interface WhatsappWebhookEvents {
  inbound: WhatsappInbound[]
  statuses: WhatsappStatusEvent[]
}

export interface WhatsappMediaPayload {
  body: ArrayBuffer
  contentType: string
  filename?: string
}

/**
 * How a provider refers to an approved template.
 *
 * They disagree on this more than on anything else: Meta wants a name plus the
 * language it was approved in, Twilio wants a Template SID that already carries
 * its languages. Asking for "template name" in one box and hoping is how a
 * Template SID ends up being a name that does not exist.
 */
export interface WhatsappTemplateField {
  label: string
  help: string
  placeholder?: string
  /** False when the template resource already knows its own language. */
  usesLanguage: boolean
  /**
   * How a photo reaches a template, which the two providers do differently.
   *
   * 'header': the template fixes only the media *type* at creation, and the
   * image itself is handed over whole at send time as a header parameter.
   * Meta works this way, so the workshop has nothing to configure.
   *
   * 'variable': the media URL belongs to the template, and a variable may only
   * follow the domain, so the workshop leaves a placeholder at the end of it
   * and we supply the last segment.
   */
  mediaAs: 'header' | 'variable'
  /** Returns an error when the value cannot be right, or null when it may be. */
  validate?: (value: string) => string | null
}

/** Deep links into the provider's own console, one per setup step. */
export interface WhatsappSetupLinks {
  /** Where the credentials in this adapter's list are found. */
  credentials: string
  /** Where the webhook URL is registered. */
  webhook: string
  /** Where approved templates are written. */
  templates: string
  /**
   * Where a token that does not expire is minted, when that is somewhere other
   * than the credentials page. Meta offers a 24 hour token on the way in and
   * keeps the permanent one in a different product entirely.
   */
  token?: string
  /**
   * Where to click once the link lands, for consoles that cannot be linked
   * any deeper. Meta's pages hang off an app id we never collect, so the
   * button can only reach the app list and the rest is a breadcrumb.
   */
  credentialsPath?: string
  webhookPath?: string
  /**
   * Where the sending number itself is found, for providers that host it.
   * Meta's number belongs to the workshop and is theirs to know; Twilio's is
   * a sender they set up in the console, and they will need to look it up.
   */
  number?: string
}

export interface WhatsappAdapter {
  readonly id: string
  readonly label: string
  /** Where a workshop goes to get these credentials. */
  readonly docsUrl: string
  readonly credentials: readonly WhatsappCredentialField[]
  readonly template: WhatsappTemplateField
  readonly setup: WhatsappSetupLinks
  /**
   * True when the provider expects the webhook URL to carry our own shared
   * secret, because it signs nothing itself.
   */
  readonly usesWebhookToken: boolean

  send(ctx: WhatsappContext, message: WhatsappOutbound): Promise<WhatsappSendResult>

  /**
   * Answers the provider's subscription handshake. Meta will not deliver
   * anything until this echoes its challenge back.
   */
  verify?(request: Request, ctx: WhatsappContext): Promise<Response>

  /**
   * Reads one webhook delivery. Throwing rejects it: the route turns that into
   * the acknowledgement the provider expects rather than a retry storm.
   */
  receive(request: Request, ctx: WhatsappContext): Promise<WhatsappWebhookEvents>

  /**
   * Registers the business number for use, where the provider asks for it.
   *
   * Meta requires this as a separate call after a number is verified, with a
   * six-digit PIN that becomes the number's two-step verification PIN. Twilio
   * does it for you, so this is absent there.
   */
  registerNumber?(ctx: WhatsappContext, pin: string): Promise<void>

  /**
   * Tells the provider the message has been seen, where that exists.
   *
   * Meta shows the customer blue ticks; a workshop that reads on a screen but
   * never marks anything looks like it is ignoring people.
   */
  markRead?(ctx: WhatsappContext, providerMessageId: string): Promise<void>

  /** Fetches an inbound attachment, which providers keep behind their own auth. */
  fetchMedia?(ctx: WhatsappContext, reference: string): Promise<WhatsappMediaPayload>

  /** What this provider wants to hear back. Twilio wants TwiML, Meta wants 200. */
  acknowledge(): Response
}
