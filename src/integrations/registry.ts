/**
 * Every connector the app ships.
 *
 * Manifests are imported eagerly: they are small data and the catalog needs
 * all of them. Server modules are imported lazily by id, so a connector's
 * code is loaded only when one of its jobs runs. A test checks that every
 * folder under src/integrations with a manifest is listed here.
 */

import type { ConnectorManifest, ConnectorServer } from '@/features/integrations/Lib/types'
import { manifest as amazonSes } from './amazon-ses/manifest'
import { manifest as googleCalendar } from './google-calendar/manifest'
import { manifest as mailgun } from './mailgun/manifest'
import { manifest as microsoft365 } from './microsoft-365/manifest'
import { manifest as openapiAutomotive } from './openapi-automotive/manifest'
import { manifest as postmark } from './postmark/manifest'
import { manifest as rdw } from './rdw/manifest'
import { manifest as resend } from './resend/manifest'
import { manifest as sendgrid } from './sendgrid/manifest'
import { manifest as smtp } from './smtp/manifest'
import { manifest as telegram } from './telegram/manifest'
import { manifest as telnyxSms } from './telnyx-sms/manifest'
import { manifest as twilioSms } from './twilio-sms/manifest'
import { manifest as vegvesen } from './vegvesen/manifest'
import { manifest as vonageSms } from './vonage-sms/manifest'
import { manifest as whatsappMeta } from './whatsapp-meta/manifest'
import { manifest as whatsappTwilio } from './whatsapp-twilio/manifest'
import { manifest as zoom } from './zoom/manifest'

interface RegistryEntry {
  manifest: ConnectorManifest
  load: () => Promise<{ connector: ConnectorServer }>
}

const ENTRIES: readonly RegistryEntry[] = [
  { manifest: googleCalendar, load: () => import('./google-calendar/server') },
  { manifest: microsoft365, load: () => import('./microsoft-365/server') },
  { manifest: zoom, load: () => import('./zoom/server') },
  { manifest: vegvesen, load: () => import('./vegvesen/server') },
  { manifest: openapiAutomotive, load: () => import('./openapi-automotive/server') },
  { manifest: rdw, load: () => import('./rdw/server') },
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
]

const BY_ID = new Map(ENTRIES.map((e) => [e.manifest.id, e]))

export function listManifests(): ConnectorManifest[] {
  return ENTRIES.map((e) => e.manifest)
}

export function getManifest(id: string): ConnectorManifest | null {
  return BY_ID.get(id)?.manifest ?? null
}

export async function getConnector(id: string): Promise<ConnectorServer> {
  const entry = BY_ID.get(id)
  if (!entry) throw new Error(`Unknown connector ${id}`)
  const mod = await entry.load()
  return mod.connector
}
