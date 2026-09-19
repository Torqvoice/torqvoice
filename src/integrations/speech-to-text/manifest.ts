import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * Speech to text, as a connection of its own.
 *
 * Dictation on a work order is far better through a speech model than through
 * the browser's own recognition, but the workshop's AI provider may not have
 * one: Anthropic does not. So this is separate from the chat provider, and
 * connecting it leaves that one alone. With no address it goes to OpenAI on
 * the workshop's own key; with one it goes to any server that speaks OpenAI's
 * transcription API (a local Whisper, LocalAI, Groq).
 *
 * The address is a self-hosted field only. On the cloud instance an address a
 * workshop types in would be a way to point our server at whatever runs next
 * to it, so the field is not offered there and not honoured if sent.
 */
export const manifest: ConnectorManifest = {
  id: 'speech-to-text',
  name: 'Speech to text',
  category: 'ai',
  countries: 'global',
  logo: '/images/integrations/speech-to-text.svg',
  docs: '/docs/integrations/ai',
  auth: {
    type: 'api-key',
    fields: [
      { key: 'apiKey', label: 'apiKey', type: 'password', help: 'apiKeyHelp' },
      {
        key: 'baseUrl',
        label: 'baseUrl',
        type: 'url',
        placeholder: 'http://whisper:8000/v1',
        help: 'baseUrlHelp',
        selfHostedOnly: true,
        advanced: true,
      },
    ],
  },
  capabilities: ['ai.transcribe'],
  settings: [
    {
      key: 'model',
      type: 'text',
      label: 'model',
      help: 'modelHelp',
      default: 'gpt-4o-mini-transcribe',
    },
    {
      key: 'mode',
      type: 'select',
      label: 'mode',
      help: 'modeHelp',
      default: 'ai',
      options: [
        { value: 'ai', label: 'modeAi' },
        { value: 'choice', label: 'modeChoice' },
      ],
    },
  ],
  plan: 'ai',
}
