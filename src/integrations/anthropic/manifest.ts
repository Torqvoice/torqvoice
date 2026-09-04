import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * Anthropic as the workshop's AI provider, on the same terms as OpenAI: the
 * workshop's own key, their own bill, and the model chosen from what their
 * account can reach.
 *
 * The app talks to Anthropic through its OpenAI-compatible endpoint, so the
 * two connectors differ in credentials and model list rather than in how the
 * features that use them are written.
 */
export const manifest: ConnectorManifest = {
  id: 'anthropic',
  name: 'Anthropic',
  category: 'ai',
  countries: 'global',
  logo: '/images/integrations/anthropic.svg',
  docs: '/docs/integrations/ai',
  auth: {
    type: 'api-key',
    fields: [
      { key: 'apiKey', label: 'apiKey', type: 'password', required: true, help: 'apiKeyHelp' },
    ],
  },
  capabilities: ['ai.chat'],
  settings: [
    {
      key: 'model',
      type: 'remote-select',
      label: 'model',
      help: 'modelHelp',
      source: 'models',
      required: true,
    },
  ],
  plan: 'ai',
}
