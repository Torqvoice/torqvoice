import { describe, expect, it } from 'vitest'
import { tokenizeMessage } from '@/features/messaging/Lib/messageText'

describe('tokenizeMessage', () => {
  it('leaves plain text alone', () => {
    expect(tokenizeMessage('Your car is ready')).toEqual([
      { type: 'text', value: 'Your car is ready' },
    ])
  })

  it('pulls a link out of a sentence', () => {
    const tokens = tokenizeMessage('Track it at https://example.com/a?b=1 today')
    expect(tokens).toEqual([
      { type: 'text', value: 'Track it at ' },
      { type: 'link', value: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { type: 'text', value: ' today' },
    ])
  })

  it('keeps sentence punctuation out of the address', () => {
    const tokens = tokenizeMessage('See https://example.com/setup.')
    expect(tokens[1]).toEqual({
      type: 'link',
      value: 'https://example.com/setup',
      href: 'https://example.com/setup',
    })
    expect(tokens[2]).toEqual({ type: 'text', value: '.' })
  })

  it('keeps encoded characters that belong to the address', () => {
    const url = 'https://business.facebook.com/latest/whatsapp%5Fmanager/setup?a=1&b=2'
    expect(tokenizeMessage(url)).toEqual([{ type: 'link', value: url, href: url }])
  })

  it("reads WhatsApp's own emphasis markers", () => {
    expect(tokenizeMessage('*Continue* setting up')).toEqual([
      { type: 'text', value: 'Continue', bold: true },
      { type: 'text', value: ' setting up' },
    ])
  })

  it('ignores a marker that wraps nothing', () => {
    expect(tokenizeMessage('2 * 3 = 6')).toEqual([{ type: 'text', value: '2 * 3 = 6' }])
  })

  it('never treats another scheme as a link', () => {
    const tokens = tokenizeMessage('javascript:alert(1) and file:///etc/passwd')
    expect(tokens.every((token) => token.type === 'text')).toBe(true)
  })
})
