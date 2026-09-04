import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * OpenAI as the workshop's AI provider: service descriptions, history
 * summaries, document reading and the assistant all go through whichever AI
 * connection is active.
 *
 * The key is the workshop's own and billed to their OpenAI account, so the
 * platform never carries a bill it cannot attribute. The model is a setting
 * rather than a fixed choice because what a workshop wants to pay per call
 * is theirs to decide, and the list is read from the account so a model
 * released next month needs no release here.
 */
export const manifest: ConnectorManifest = {
  id: 'openai',
  name: 'OpenAI',
  category: 'ai',
  countries: 'global',
  logo: '/images/integrations/openai.svg',
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
