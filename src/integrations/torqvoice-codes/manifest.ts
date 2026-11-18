import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * The variable that holds the key the cloud uses for every workshop. Set on
 * the cloud, every workshop is connected with it and the key field is not
 * drawn, so there is no key to paste. Unset, the field is required: that is
 * how a self-hosted install would connect with a key of its own.
 */
export const SERVER_KEY_ENV = 'TORQVOICE_CODES_API_TOKEN'

/**
 * Where the code service answers. Read from the environment and never typed
 * by a workshop: on the cloud it is the service's address on the internal
 * Docker network.
 */
export const SERVICE_URL_ENV = 'TORQVOICE_CODES_URL'

/** The capability a fault code lookup asks for. */
export const FAULT_CODES_CAPABILITY = 'diagnostics.codes'

/**
 * Torqvoice Codes: what a fault code means on this make, in the workshop's
 * language, with likely causes and related codes. A service Torqvoice runs,
 * so it exists on the cloud only, and on every cloud plan through its own
 * plan flag rather than the integrations one.
 */
export const manifest: ConnectorManifest = {
  id: 'torqvoice-codes',
  name: 'Torqvoice Codes',
  category: 'repair',
  countries: 'global',
  logo: '/images/integrations/torqvoice-codes.svg',
  docs: '/docs/integrations/torqvoice-codes',
  auth: {
    type: 'api-key',
    fields: [
      {
        key: 'apiToken',
        label: 'apiToken',
        type: 'password',
        required: true,
        help: 'apiTokenHelp',
        serverKeyEnv: SERVER_KEY_ENV,
        hiddenWhenServerKey: true,
      },
    ],
  },
  capabilities: [FAULT_CODES_CAPABILITY],
  settings: [],
  plan: 'faultCodes',
  cloudOnly: true,
  autoConnect: true,
}
