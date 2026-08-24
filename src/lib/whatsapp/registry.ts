import type { WhatsappAdapter } from './types'
import { metaAdapter } from './adapters/meta'
import { twilioAdapter } from './adapters/twilio'

/**
 * Every WhatsApp provider the app can talk to.
 *
 * This list is the only place that needs to grow when another provider comes
 * along: settings render themselves from the adapter's declared credentials,
 * the webhook route resolves adapters by id, and the message table stores the
 * id as free text.
 */
const ADAPTERS: readonly WhatsappAdapter[] = [metaAdapter, twilioAdapter]

export function listWhatsappAdapters(): readonly WhatsappAdapter[] {
  return ADAPTERS
}

export function getWhatsappAdapter(id: string | null | undefined): WhatsappAdapter | null {
  if (!id) return null
  return ADAPTERS.find((adapter) => adapter.id === id) ?? null
}

/** Shape the settings UI needs, without exposing the callable adapter. */
export interface WhatsappProviderOption {
  id: string
  label: string
  docsUrl: string
  usesWebhookToken: boolean
  credentials: WhatsappAdapter['credentials']
  /** Without the validator: functions cannot cross to a client component. */
  template: Omit<WhatsappAdapter['template'], 'validate'>
  setup: WhatsappAdapter['setup']
  /** Whether the number needs a separate registration call from us. */
  supportsRegistration: boolean
}

export function listWhatsappProviderOptions(): WhatsappProviderOption[] {
  return ADAPTERS.map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
    docsUrl: adapter.docsUrl,
    usesWebhookToken: adapter.usesWebhookToken,
    credentials: adapter.credentials,
    template: {
      label: adapter.template.label,
      help: adapter.template.help,
      placeholder: adapter.template.placeholder,
      usesLanguage: adapter.template.usesLanguage,
      mediaAs: adapter.template.mediaAs,
    },
    setup: adapter.setup,
    supportsRegistration: typeof adapter.registerNumber === 'function',
  }))
}
