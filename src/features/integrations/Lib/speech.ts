/**
 * Which connection dictation is written down by.
 *
 * The speech-to-text connection when the workshop has one; otherwise the chat
 * provider, when that vendor has a speech model (OpenAI and the servers that
 * speak its API do, Anthropic does not); otherwise nothing, and the browser's
 * own recognition is all there is.
 */

import { db } from '@/lib/db'
import { isCloudInstance } from '@/lib/cloud-instance'
import { canTranscribe, transcriptionModel } from '@/features/ai/Lib/transcription'
import { aiSetup, configuredAiProvider } from './ai'
import { openCredentials } from './vault'

export const SPEECH_CONNECTOR_ID = 'speech-to-text'

/**
 * Who decides how a dictation is written down. 'ai' is always the speech
 * model; 'choice' lets each person pick it or the browser from the mic's menu.
 */
export type DictationMode = 'ai' | 'choice'

export interface SpeechSetup {
  /** The client to build: OpenAI's own address, or a server the workshop named. */
  provider: 'openai' | 'openai-compatible'
  apiKey: string
  baseUrl?: string
  model: string
}

function settingOf(settings: unknown, key: string): string {
  const value = (settings as Record<string, unknown> | null)?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

export function dictationModeOf(settings: unknown): DictationMode {
  return settingOf(settings, 'mode') === 'choice' ? 'choice' : 'ai'
}

async function speechConnection(organizationId: string) {
  return db.integrationConnection.findFirst({
    where: { organizationId, connectorId: SPEECH_CONNECTOR_ID, status: 'active' },
    select: { credentials: true, settings: true },
  })
}

/**
 * What a page needs to know to draw the mic, without opening any credentials:
 * whether a speech model is there at all, and who chooses the engine. With
 * no speech connection the chat provider stands in, and people may choose,
 * since nobody has said otherwise.
 */
export async function configuredDictation(
  organizationId: string
): Promise<{ available: boolean; mode: DictationMode }> {
  const connection = await speechConnection(organizationId)
  if (connection) return { available: true, mode: dictationModeOf(connection.settings) }
  const provider = await configuredAiProvider(organizationId)
  return { available: canTranscribe(provider), mode: 'choice' }
}

/** The keys and the model, for the one request that sends a recording. */
export async function speechSetup(organizationId: string): Promise<SpeechSetup | null> {
  const connection = await speechConnection(organizationId)
  if (connection) {
    const credentials = openCredentials(connection.credentials)
    const apiKey = typeof credentials.apiKey === 'string' ? credentials.apiKey : ''
    // A self-hosted field: never read on the cloud instance, whatever is stored.
    const baseUrl =
      !isCloudInstance() && typeof credentials.baseUrl === 'string'
        ? credentials.baseUrl.trim()
        : ''
    const provider = baseUrl ? 'openai-compatible' : 'openai'
    if (provider === 'openai' && !apiKey) return null
    return {
      provider,
      apiKey,
      ...(baseUrl ? { baseUrl } : {}),
      model: settingOf(connection.settings, 'model') || transcriptionModel(provider),
    }
  }

  const chat = await aiSetup(organizationId)
  if (!chat || !canTranscribe(chat.provider)) return null
  const provider = chat.provider === 'openai' ? 'openai' : 'openai-compatible'
  return {
    provider,
    apiKey: chat.apiKey,
    ...(chat.baseUrl ? { baseUrl: chat.baseUrl } : {}),
    model: transcriptionModel(provider),
  }
}
