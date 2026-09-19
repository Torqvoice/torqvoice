import { describe, expect, it } from 'vitest'
import {
  canTranscribe,
  liveTranscriptionSession,
  transcriptionLanguage,
  transcriptionModel,
  transcriptionPrompt,
} from '@/features/ai/Lib/transcription'

describe('speech to text through the AI connection', () => {
  it('is offered for vendors that have a transcription endpoint, and no others', () => {
    expect(canTranscribe('openai')).toBe(true)
    expect(canTranscribe('openai-compatible')).toBe(true)
    expect(canTranscribe('anthropic')).toBe(false)
    expect(canTranscribe(null)).toBe(false)
  })

  it('asks a compatible server for the name those servers answer to', () => {
    expect(transcriptionModel('openai')).toBe('gpt-4o-mini-transcribe')
    expect(transcriptionModel('openai-compatible')).toBe('whisper-1')
  })

  it('passes a two-letter language and leaves anything else to the model', () => {
    expect(transcriptionLanguage('de')).toBe('de')
    expect(transcriptionLanguage('pt-BR')).toBe('pt')
    // The app's Bokmål is the speech models' Norwegian.
    expect(transcriptionLanguage('nb')).toBe('no')
    expect(transcriptionLanguage('auto')).toBeUndefined()
    expect(transcriptionLanguage('')).toBeUndefined()
    expect(transcriptionLanguage(null)).toBeUndefined()
  })

  it('names the vehicle in the hint when there is one', () => {
    expect(transcriptionPrompt({ year: 2021, make: 'Škoda', model: 'Octavia' })).toContain(
      'The vehicle is a 2021 Škoda Octavia.'
    )
    expect(transcriptionPrompt({})).not.toContain('The vehicle is')
  })

  it('ends the hint with what was said just before, so the model reads on from it', () => {
    expect(transcriptionPrompt({}, ' and then it started to ')).toMatch(/and then it started to$/)
  })

  it('opens a live session that only transcribes, and leaves the language out for auto', () => {
    const auto = liveTranscriptionSession({ make: 'BMW', model: '5-Serie' }, undefined)
    expect(auto.type).toBe('transcription')
    // The live model has no turn detection and refuses a session that asks for it.
    expect(auto.audio.input.turn_detection).toBeNull()
    expect(auto.audio.input.transcription).toEqual({
      model: 'gpt-live-transcribe',
      keywords: expect.arrayContaining(['BMW', '5-Serie', 'brake pads']),
    })
    const norwegian = liveTranscriptionSession({}, 'no', false)
    expect(norwegian.audio.input.transcription).toEqual({
      model: 'gpt-live-transcribe',
      language: 'no',
    })
    expect(norwegian.audio.input).not.toHaveProperty('noise_reduction')
  })
})
