/**
 * Every connector the app ships.
 *
 * Manifests are imported eagerly: they are small data and the catalog needs
 * all of them. Server modules are imported lazily by id, so a connector's
 * code is loaded only when one of its jobs runs. A test checks that every
 * folder under src/integrations with a manifest is listed here.
 */

import type { ConnectorManifest, ConnectorServer } from '@/features/integrations/Lib/types'
import { isCloudInstance } from '@/lib/cloud-instance'
import { manifest as amazonSes } from './amazon-ses/manifest'
import { manifest as anthropic } from './anthropic/manifest'
import { manifest as fiken } from './fiken/manifest'
import { manifest as checkCarDetails } from './checkcardetails/manifest'
import { manifest as googleCalendar } from './google-calendar/manifest'
import { manifest as localFolder } from './local-folder/manifest'
import { manifest as mailgun } from './mailgun/manifest'
import { manifest as microsoft365 } from './microsoft-365/manifest'
import { manifest as nhtsa } from './nhtsa/manifest'
import { manifest as openai } from './openai/manifest'
import { manifest as openaiCompatible } from './openai-compatible/manifest'
import { manifest as openapiAutomotive } from './openapi-automotive/manifest'
import { manifest as openLaborProject } from './openlaborproject/manifest'
import { manifest as paypal } from './paypal/manifest'
import { manifest as postmark } from './postmark/manifest'
import { manifest as quickbooks } from './quickbooks/manifest'
import { manifest as xero } from './xero/manifest'
import { manifest as rdw } from './rdw/manifest'
import { manifest as regcheck } from './regcheck/manifest'
import { manifest as resend } from './resend/manifest'
import { manifest as s3 } from './s3/manifest'
import { manifest as sendgrid } from './sendgrid/manifest'
import { manifest as smtp } from './smtp/manifest'
import { manifest as speechToText } from './speech-to-text/manifest'
import { manifest as stripe } from './stripe/manifest'
import { manifest as telegram } from './telegram/manifest'
import { manifest as telnyxSms } from './telnyx-sms/manifest'
import { manifest as torqvoiceCodes } from './torqvoice-codes/manifest'
import { manifest as twilioSms } from './twilio-sms/manifest'
import { manifest as vegvesen } from './vegvesen/manifest'
import { manifest as vipps } from './vipps/manifest'
import { manifest as vonageSms } from './vonage-sms/manifest'
import { manifest as whatsappMeta } from './whatsapp-meta/manifest'
import { manifest as whatsappTwilio } from './whatsapp-twilio/manifest'
import { manifest as zoom } from './zoom/manifest'

interface RegistryEntry {
  manifest: ConnectorManifest
  load: () => Promise<{ connector: ConnectorServer }>
}

const ALL_ENTRIES: readonly RegistryEntry[] = [
  { manifest: openai, load: () => import('./openai/server') },
  { manifest: anthropic, load: () => import('./anthropic/server') },
  { manifest: openaiCompatible, load: () => import('./openai-compatible/server') },
  { manifest: speechToText, load: () => import('./speech-to-text/server') },
  { manifest: googleCalendar, load: () => import('./google-calendar/server') },
  { manifest: microsoft365, load: () => import('./microsoft-365/server') },
  { manifest: zoom, load: () => import('./zoom/server') },
  { manifest: vegvesen, load: () => import('./vegvesen/server') },
  { manifest: openapiAutomotive, load: () => import('./openapi-automotive/server') },
  { manifest: checkCarDetails, load: () => import('./checkcardetails/server') },
  { manifest: rdw, load: () => import('./rdw/server') },
  { manifest: regcheck, load: () => import('./regcheck/server') },
  { manifest: nhtsa, load: () => import('./nhtsa/server') },
  { manifest: openLaborProject, load: () => import('./openlaborproject/server') },
  { manifest: torqvoiceCodes, load: () => import('./torqvoice-codes/server') },
  { manifest: twilioSms, load: () => import('./twilio-sms/server') },
  { manifest: vonageSms, load: () => import('./vonage-sms/server') },
  { manifest: telnyxSms, load: () => import('./telnyx-sms/server') },
  { manifest: whatsappMeta, load: () => import('./whatsapp-meta/server') },
  { manifest: whatsappTwilio, load: () => import('./whatsapp-twilio/server') },
  { manifest: telegram, load: () => import('./telegram/server') },
  { manifest: smtp, load: () => import('./smtp/server') },
  { manifest: resend, load: () => import('./resend/server') },
  { manifest: postmark, load: () => import('./postmark/server') },
  { manifest: mailgun, load: () => import('./mailgun/server') },
  { manifest: sendgrid, load: () => import('./sendgrid/server') },
  { manifest: amazonSes, load: () => import('./amazon-ses/server') },
  { manifest: stripe, load: () => import('./stripe/server') },
  { manifest: vipps, load: () => import('./vipps/server') },
  { manifest: paypal, load: () => import('./paypal/server') },
  { manifest: quickbooks, load: () => import('./quickbooks/server') },
  { manifest: xero, load: () => import('./xero/server') },
  { manifest: fiken, load: () => import('./fiken/server') },
  { manifest: s3, load: () => import('./s3/server') },
  { manifest: localFolder, load: () => import('./local-folder/server') },
]

/**
 * The same test as isCloudMode() in lib/features, imported from lib/cloud-instance
 * directly so the registry stays plain data with no database behind it.
 */
const IS_CLOUD = isCloudInstance()

/**
 * A self-hosted-only connector does not exist on the cloud instance: not in
 * the catalog, not on its settings page, not for a job or a completion.
 * Leaving it out here, rather than hiding the card, is what makes that one
 * decision hold everywhere the id could arrive from.
 */
/**
 * The same rule for a single field. A connector that is fine on the cloud
 * instance except for one address the workshop would type loses that field
 * there, in the manifest itself, so the connect page does not draw it and the
 * connect action does not accept it.
 */
function forThisInstall(manifest: ConnectorManifest): ConnectorManifest {
  if (!IS_CLOUD) return manifest
  let out = manifest
  if (out.auth.type === 'api-key' && out.auth.fields.some((f) => f.selfHostedOnly)) {
    out = {
      ...out,
      auth: { ...out.auth, fields: out.auth.fields.filter((f) => !f.selfHostedOnly) },
    }
  }
  // The same for a choice inside a setting: an option that would let the
  // workshop type an address of its own is not offered here.
  if (out.settings.some((s) => s.options?.some((o) => o.selfHostedOnly))) {
    out = {
      ...out,
      settings: out.settings.map((s) =>
        s.options ? { ...s, options: s.options.filter((o) => !o.selfHostedOnly) } : s
      ),
    }
  }
  return out
}

/**
 * A key the server holds for every workshop, for a service Torqvoice pays
 * for on their behalf. While its variable is set the workshop's own key is
 * optional: left empty, the server's is used. A field marked
 * `hiddenWhenServerKey` goes altogether, so the server's key is the only one.
 */
export function withServerKeys(
  manifest: ConnectorManifest,
  env: Record<string, string | undefined> = process.env
): ConnectorManifest {
  if (manifest.auth.type !== 'api-key') return manifest
  const held = (f: { serverKeyEnv?: string }) =>
    Boolean(f.serverKeyEnv && env[f.serverKeyEnv]?.trim())
  if (!manifest.auth.fields.some(held)) return manifest
  return {
    ...manifest,
    auth: {
      ...manifest.auth,
      fields: manifest.auth.fields
        .filter((f) => !(held(f) && f.hiddenWhenServerKey))
        .map((f) => (held(f) ? { ...f, required: false, help: f.serverKeyHelp ?? f.help } : f)),
    },
  }
}

/**
 * Cloud-only connectors a developer may try on a self-hosted dev machine,
 * without minting a cloud token and putting the whole app in cloud mode:
 * `TORQVOICE_DEV_CLOUD_CONNECTORS=torqvoice-codes` (ids, comma separated).
 * Only `next dev` sets NODE_ENV to "development"; a production build never
 * does, so the list is ignored there whatever the environment says.
 */
export function devCloudConnectors(
  env: Record<string, string | undefined> = process.env
): ReadonlySet<string> {
  if (env.NODE_ENV !== 'development') return new Set()
  return new Set(
    (env.TORQVOICE_DEV_CLOUD_CONNECTORS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  )
}

/**
 * Whether a connector exists on this install at all: a self-hosted-only one
 * not on the cloud instance, a cloud-only one not on a self-hosted install
 * (unless a developer listed it, see devCloudConnectors).
 */
export function availableOnThisInstall(
  manifest: ConnectorManifest,
  cloud: boolean,
  devAllowed: ReadonlySet<string> = new Set()
): boolean {
  if (cloud) return !manifest.selfHostedOnly
  return !manifest.cloudOnly || devAllowed.has(manifest.id)
}

const DEV_CLOUD_CONNECTORS = devCloudConnectors()

const ENTRIES: readonly RegistryEntry[] = ALL_ENTRIES.filter((e) =>
  availableOnThisInstall(e.manifest, IS_CLOUD, DEV_CLOUD_CONNECTORS)
).map((e) => ({ ...e, manifest: withServerKeys(forThisInstall(e.manifest)) }))

const BY_ID = new Map(ENTRIES.map((e) => [e.manifest.id, e]))

export function listManifests(): ConnectorManifest[] {
  return ENTRIES.map((e) => e.manifest)
}

export function getManifest(id: string): ConnectorManifest | null {
  return BY_ID.get(id)?.manifest ?? null
}

/**
 * The cloud-only connectors a self-hosted install's catalog shows as cards
 * that say where they are offered, with nothing behind them. They stay out
 * of the registry itself, so no settings page, action or job can reach one.
 */
export function cloudOnlyElsewhere(
  cloud: boolean = IS_CLOUD,
  present: (id: string) => boolean = (id) => BY_ID.has(id)
): ConnectorManifest[] {
  if (cloud) return []
  return ALL_ENTRIES.filter((e) => e.manifest.cloudOnly && !present(e.manifest.id)).map(
    (e) => e.manifest
  )
}

export async function getConnector(id: string): Promise<ConnectorServer> {
  const entry = BY_ID.get(id)
  if (!entry) throw new Error(`Unknown connector ${id}`)
  const mod = await entry.load()
  return mod.connector
}
