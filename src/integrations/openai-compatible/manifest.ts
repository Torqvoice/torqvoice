import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * Any server that speaks OpenAI's chat API as the workshop's AI provider:
 * Ollama, Open WebUI, LocalAI, vLLM, LM Studio, LiteLLM and the gateways
 * built on them. The point is a workshop keeping vehicle, customer and
 * repair data on its own hardware, so the base URL is theirs to type and the
 * model list is whatever that server offers, unfiltered.
 *
 * Self-hosted installs only. On the cloud instance a URL a workshop types in
 * would be a way to make our server call whatever runs next to it, and no
 * cloud workshop has asked for it.
 */
export const manifest: ConnectorManifest = {
  id: 'openai-compatible',
  name: 'OpenAI-compatible',
  category: 'ai',
  countries: 'global',
  logo: '/images/integrations/openai-compatible.svg',
  docs: '/docs/integrations/ai',
  auth: {
    type: 'api-key',
    fields: [
      {
        key: 'baseUrl',
        label: 'baseUrl',
        type: 'url',
        required: true,
        placeholder: 'http://ollama:11434/v1',
        help: 'baseUrlHelp',
      },
      { key: 'apiKey', label: 'apiKey', type: 'password', help: 'apiKeyHelp' },
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
  selfHostedOnly: true,
}
