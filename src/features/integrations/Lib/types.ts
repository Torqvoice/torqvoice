/**
 * The contract between the integrations platform and a connector.
 *
 * A connector is one folder under src/integrations/<id> with two files. The
 * manifest is data: what the connector is, how it authenticates, which
 * settings it offers, which app events it wants to hear about. The server
 * module is code: the job handlers and lookups that talk to the vendor. The
 * catalog reads manifests only, so a hundred connectors can be listed without
 * loading any of their code.
 */

import type { PlanFeatures } from '@/lib/features'

export type IntegrationCategory =
  | 'calendar'
  | 'conferencing'
  | 'accounting'
  | 'messaging'
  | 'payments'
  | 'automation'
  | 'storage'
  | 'registry'
  | 'other'

export type ConnectionStatus = 'pending' | 'active' | 'error' | 'disconnected'

export interface CredentialField {
  key: string
  /** i18n key under integrations.connectors.<id>.fields */
  label: string
  type: 'text' | 'password' | 'url'
  required?: boolean
  placeholder?: string
  /** Prefilled on the connect page, for values with one usual answer such as a port. */
  default?: string
  /** i18n key with guidance on where the value comes from */
  help?: string
}

/**
 * How the vendor authenticates. OAuth apps come in two ownerships: the
 * platform's registered app (cloud) or one the workshop registers itself
 * (self-hosted, or a vendor that offers no multi-tenant app). A connector
 * supports either or both; the platform chooses by environment.
 */
export type AuthSpec =
  | {
      type: 'oauth2'
      authorizeUrl: string
      tokenUrl: string
      scopes: string[]
      /** Extra query parameters on the authorize request, such as access_type=offline. */
      authorizeParams?: Record<string, string>
      pkce?: boolean
      /**
       * Where the client id and secret go on token requests. Most vendors read
       * them from the form body; Zoom and a few others want HTTP Basic auth.
       */
      tokenAuth?: 'body' | 'basic'
      /** Environment variable names holding the platform-owned app's client id and secret. */
      platformEnv?: { clientId: string; clientSecret: string }
      /** Fields a workshop fills in to use its own app. */
      tenantFields?: CredentialField[]
      /** i18n key describing how to register an app with the vendor. */
      tenantHelp?: string
    }
  | { type: 'api-key'; fields: CredentialField[] }
  | { type: 'client-credentials'; tokenUrl: string; fields: CredentialField[] }

export interface SettingOption {
  value: string
  label: string
}

export interface SettingField {
  key: string
  type: 'boolean' | 'text' | 'number' | 'select' | 'remote-select'
  /** i18n key under integrations.connectors.<id>.settings */
  label: string
  help?: string
  default?: string | number | boolean
  options?: SettingOption[]
  /** For remote-select: the key in the server module's remoteOptions map. */
  source?: string
  /** Only shown while another setting has this value. */
  showWhen?: { key: string; equals: string | number | boolean }
  required?: boolean
}

export interface ConnectorManifest {
  id: string
  /** Vendor's product name, not translated. */
  name: string
  category: IntegrationCategory
  /** Further catalog categories the connector also belongs to. */
  also?: IntegrationCategory[]
  /** ISO country codes where this vendor matters, or 'global'. Drives catalog ordering. */
  countries: string[] | 'global'
  /** Path under /public. */
  logo: string
  /** Docs path without locale, for example /docs/integrations/google-calendar. */
  docs: string
  auth: AuthSpec
  /** Capability ids such as 'calendar.push'. Shown as badges; used by the app to find a provider. */
  capabilities: string[]
  settings: SettingField[]
  /** App events (webhook event names) that enqueue a job of the given kind with the event's entityId. */
  subscriptions?: { event: string; job: string }[]
  /** Jobs the platform enqueues on a timer while the connection is active. */
  schedules?: { job: string; everyMinutes: number }[]
  /** Plan feature that must be on, beyond the general integrations flag. */
  plan?: keyof PlanFeatures
}

export type LogLevel = 'info' | 'warn' | 'error'

export interface ConnectorHttp {
  /** fetch with the connection's credentials attached, refreshed when needed, and retried on 429 and 5xx. */
  fetch(url: string, init?: RequestInit): Promise<Response>
  /** fetch and parse JSON; throws ConnectorHttpError on a non-2xx response. */
  json<T = unknown>(url: string, init?: RequestInit): Promise<T>
}

export class ConnectorHttpError extends Error {
  status: number
  body: string
  constructor(status: number, body: string, url: string) {
    super(`HTTP ${status} from ${url}: ${body.slice(0, 300)}`)
    this.status = status
    this.body = body
  }
}

export interface LinkRecord {
  remoteId: string
  remoteUrl: string | null
  metadata: Record<string, unknown> | null
  checksum: string | null
}

export interface LinkStore {
  get(entityType: string, entityId: string): Promise<LinkRecord | null>
  set(
    entityType: string,
    entityId: string,
    link: Partial<LinkRecord> & { remoteId: string }
  ): Promise<void>
  remove(entityType: string, entityId: string): Promise<void>
  /** Remote ids this connection created, so a pull can leave them out. */
  remoteIds(entityType: string): Promise<Set<string>>
}

export interface ConnectionSnapshot {
  id: string
  organizationId: string
  connectorId: string
  settings: Record<string, unknown>
  state: Record<string, unknown>
  externalAccountId: string | null
}

export interface ConnectorContext {
  connection: ConnectionSnapshot
  /** Decrypted credentials. Never log these. */
  credentials: Record<string, unknown>
  http: ConnectorHttp
  links: LinkStore
  log(level: LogLevel, message: string, details?: Record<string, unknown>): Promise<void>
  /** Merge into the connection's state and persist. */
  saveState(patch: Record<string, unknown>): Promise<void>
  /** Workshop timezone (IANA), for calendar bodies. */
  timezone: string
  appUrl: string
}

export interface JobOutcome {
  /** Short human line for the log, such as "3 events updated". */
  summary?: string
  /** Ask the platform to run this job again later, for example after a page cursor. */
  rescheduleInSeconds?: number
}

export type JobHandler = (
  ctx: ConnectorContext,
  payload: Record<string, unknown>
) => Promise<JobOutcome | void>

export interface ConnectorServer {
  manifest: ConnectorManifest
  /** After connecting: who the account is, shown on the connection page. */
  identify?(ctx: ConnectorContext): Promise<{ id: string; name: string }>
  /** Cheap round trip that proves the credentials still work. */
  test(ctx: ConnectorContext): Promise<{ ok: boolean; message?: string }>
  /**
   * Send a real message to the signed-in user, for vendors where a key check
   * is not proof that mail or texts actually go out. Throws with the vendor's
   * reason when it fails.
   */
  sendTest?(ctx: ConnectorContext, to: { email: string }): Promise<void>
  /** Providers for remote-select settings, keyed by SettingField.source. */
  remoteOptions?: Record<string, (ctx: ConnectorContext) => Promise<SettingOption[]>>
  jobs: Record<string, JobHandler>
  /** Inbound webhook handling, where the vendor pushes. */
  webhook?: {
    receive(
      request: Request,
      ctx: ConnectorContext
    ): Promise<{ jobs: { kind: string; payload?: Record<string, unknown> }[]; response?: Response }>
  }
  /**
   * Set up remote state once the credentials have proved good, such as
   * registering a webhook with the vendor. Settings returned here are saved
   * on the connection, for values the vendor knows and the form did not ask.
   */
  onConnect?(ctx: ConnectorContext): Promise<{ settings?: Record<string, unknown> } | void>
  /** Clean up remote state when the workshop disconnects. */
  onDisconnect?(ctx: ConnectorContext): Promise<void>
}

/** Stored, sealed, in IntegrationConnection.credentials. */
export interface OAuthCredentials {
  accessToken: string
  refreshToken?: string
  /** Epoch milliseconds. */
  expiresAt?: number
  tokenType?: string
  scope?: string
  /** Present for tenant-owned apps. */
  clientId?: string
  clientSecret?: string
  /** PKCE verifier and nonce, only while pending. */
  codeVerifier?: string
}
