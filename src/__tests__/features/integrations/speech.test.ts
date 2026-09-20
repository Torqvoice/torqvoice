import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/cloud-instance', () => ({ isCloudInstance: () => true }))

import { dictationModeOf } from '@/features/integrations/Lib/speech'
import { getManifest } from '@/integrations/registry'

describe('speech to text connection', () => {
  it('is always the speech model unless the workshop lets people choose', () => {
    expect(dictationModeOf({ mode: 'choice' })).toBe('choice')
    expect(dictationModeOf({ mode: 'ai' })).toBe('ai')
    expect(dictationModeOf({})).toBe('ai')
    expect(dictationModeOf(null)).toBe('ai')
  })

  it('does not offer a server address on the cloud instance', () => {
    const manifest = getManifest('speech-to-text')
    expect(manifest?.auth.type).toBe('api-key')
    const keys = manifest?.auth.type === 'api-key' ? manifest.auth.fields.map((f) => f.key) : []
    expect(keys).toEqual(['apiKey'])
  })
})
