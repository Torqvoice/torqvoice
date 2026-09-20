import { describe, expect, it } from 'vitest'
import { appendDictation, dictationLanguage } from '@/hooks/use-dictation'
import { joinTranscript } from '@/hooks/use-live-transcription'
import { RealtimeTranscript } from '@/hooks/use-realtime-transcription'

describe('dictationLanguage', () => {
  it("takes the country from the browser when it speaks the app's language", () => {
    expect(dictationLanguage('en', 'en-GB')).toBe('en-GB')
    expect(dictationLanguage('nb', 'nb-NO')).toBe('nb-NO')
  })

  it("keeps the app's language when the browser is set to another one", () => {
    expect(dictationLanguage('nb', 'en-US')).toBe('nb')
    expect(dictationLanguage('pt-BR', 'pt-PT')).toBe('pt-PT')
    expect(dictationLanguage('de', undefined)).toBe('de')
  })
})

describe('appendDictation', () => {
  it('writes after what is already in the box, with one space between', () => {
    expect(appendDictation('Engine light on.  ', ' shakes at idle ')).toBe(
      'Engine light on. shakes at idle'
    )
  })

  it('starts the box when it was empty, and leaves it alone when nothing was said', () => {
    expect(appendDictation('', 'pulls to the right')).toBe('pulls to the right')
    expect(appendDictation('typed by hand', '  ')).toBe('typed by hand')
  })
})

describe('joinTranscript', () => {
  it('reads the finished stretches and the one in progress as one text', () => {
    expect(joinTranscript(['The engine light came on.', ' It shakes at idle '], 'worse when')).toBe(
      'The engine light came on. It shakes at idle worse when'
    )
  })

  it('skips a stretch whose answer has not arrived, and silence', () => {
    expect(joinTranscript([undefined, 'It pulls to the right.', ''], '')).toBe(
      'It pulls to the right.'
    )
  })
})

describe('RealtimeTranscript', () => {
  it('builds each utterance from its fragments and swaps in the corrected whole', () => {
    const transcript = new RealtimeTranscript()
    transcript.addDelta('a', 'The engine ')
    transcript.addDelta('a', 'lite came on')
    expect(transcript.toString()).toBe('The engine lite came on')
    transcript.complete('a', 'The engine light came on.')
    expect(transcript.toString()).toBe('The engine light came on.')
  })

  it('keeps utterances in the order they were first heard, whatever order they finish in', () => {
    const transcript = new RealtimeTranscript()
    transcript.addDelta('a', 'First')
    transcript.addDelta('b', 'second')
    transcript.complete('b', 'Second.')
    transcript.complete('a', 'First.')
    expect(transcript.toString()).toBe('First. Second.')
  })

  it('hands words that arrived before their id to the first id that turns up', () => {
    const transcript = new RealtimeTranscript()
    transcript.addDelta('', 'It pulls to the ')
    transcript.addDelta('', 'rite')
    transcript.complete('a', 'It pulls to the right.')
    expect(transcript.toString()).toBe('It pulls to the right.')
  })
})
