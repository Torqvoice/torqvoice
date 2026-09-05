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
  | 'ai'
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
      /**
       * Query parameters the vendor adds to the callback beside code and
       * state, kept on the connection's state under the same names. Intuit
       * sends the company id (realmId) this way and nowhere else.
       */
      callbackParams?: string[]
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
  /** A date is an ISO YYYY-MM-DD string, '' when unset. */
  type: 'boolean' | 'text' | 'number' | 'date' | 'select' | 'remote-select'
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
  /** The local record behind a remote id, for a pull that starts from the vendor's side. */
  byRemoteId(
    entityType: string,
    remoteId: string
  ): Promise<(LinkRecord & { entityId: string }) | null>
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

/** What a vehicle registry is asked for: a plate, a VIN, or both. */
export interface VehicleLookupQuery {
  plate?: string
  vin?: string
}

/**
 * A vehicle as a registry describes it, in the app's own vocabulary so the
 * form can fill itself without knowing which country answered. Everything is
 * optional: registries differ in what they publish, and none of them owe us
 * a complete record.
 */
export interface VehicleLookupResult {
  make?: string
  model?: string
  /** Year of first registration, the closest thing a registry has to a model year. */
  year?: number
  vin?: string
  licensePlate?: string
  color?: string
  /** One of the form's fuel options, already normalised. */
  fuelType?: string
  /** One of the form's transmission options, already normalised. */
  transmission?: string
  engineSize?: string
  engineCode?: string
  /** Registry's own class label, such as "Personbil" or "Light goods vehicle". */
  vehicleClass?: string
  /** ISO date of first registration. */
  firstRegistered?: string
  /** ISO date the next periodic inspection is due. */
  inspectionDue?: string
  /** ISO date of the last approved periodic inspection. */
  lastInspected?: string
  /** Approved tyre and rim sizes per axle, front first. */
  tyres?: { axle: number; tyre?: string; rim?: string; loadIndex?: string; speedRating?: string }[]
  /** Kerb weight and permitted total weight in kilograms. */
  weights?: { kerb?: number; grossMax?: number }
  /** Whether the registry lists the vehicle as currently registered. */
  registered?: boolean
}

/** What a safety data source is asked about: the model, and the VIN when the vehicle has one. */
export interface VehicleSafetyQuery {
  make: string
  model: string
  year: number
  vin?: string
}

export interface SafetyRecall {
  /** The authority's campaign number, such as 19V182000. */
  campaign: string
  /** Component path as the authority files it, such as "AIR BAGS:FRONTAL:DRIVER SIDE". */
  component: string
  summary: string
  consequence: string
  remedy: string
  /** ISO date the recall was reported. */
  reported: string | null
  /** The authority says not to drive the vehicle until it is fixed. */
  parkIt: boolean
  /** The authority says to park it outdoors, away from buildings: a fire risk. */
  parkOutside: boolean
  manufacturer: string
}

export interface SafetyComplaintExample {
  date: string | null
  summary: string
  crash: boolean
  fire: boolean
}

export interface SafetyComplaintGroup {
  component: string
  count: number
  /** Share of all complaints, 0 to 1. */
  share: number
  /** The most recent few complaints naming this component, newest first, for reading on the spot. */
  examples?: SafetyComplaintExample[]
}

export interface SafetyRating {
  /** Stars 1 to 5, null when not rated. */
  overall: number | null
  frontal: number | null
  side: number | null
  rollover: number | null
  /** The variant the rating is for, such as "2003 Honda Accord 4-DR. w/SAB". */
  description: string
}

/**
 * What an authority knows about one model year: open recall campaigns, what
 * owners have complained about, and crash-test ratings. Public data, so the
 * same report serves every vehicle of that model in every workshop.
 */
export interface VehicleSafetyReport {
  /** Connector id. */
  source: string
  /** SAFETY_REPORT_VERSION at the time the connector built it. */
  version?: number
  /** The model as the authority names it, or null when it has no record of it. */
  matched: { make: string; model: string; year: number } | null
  recalls: SafetyRecall[]
  complaints: {
    total: number
    crashes: number
    fires: number
    injuries: number
    deaths: number
    byComponent: SafetyComplaintGroup[]
    /** The most recent few, newest first. */
    latest: { date: string | null; component: string; summary: string }[]
  }
  rating: SafetyRating | null
  /** Where a person can read the same on the authority's site. */
  url: string
}

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
  /**
   * Ask a vehicle registry about one vehicle, for connectors with the
   * 'vehicle.lookup' capability. Synchronous because a form is waiting on it.
   * Returns null when the registry has no such vehicle.
   */
  lookupVehicle?(
    ctx: ConnectorContext,
    query: VehicleLookupQuery
  ): Promise<VehicleLookupResult | null>
  /**
   * Recalls, complaints and ratings for one model year, for connectors with
   * the 'vehicle.safety' capability. Returns a report with matched null when
   * the authority has no record of the model.
   */
  vehicleSafety?(ctx: ConnectorContext, query: VehicleSafetyQuery): Promise<VehicleSafetyReport>
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
