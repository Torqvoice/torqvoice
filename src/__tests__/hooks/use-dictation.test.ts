import { describe, expect, it } from 'vitest'
import { appendDictation, dictationLanguage } from '@/hooks/use-dictation'

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
