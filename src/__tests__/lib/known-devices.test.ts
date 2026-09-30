import { describe, expect, it } from 'vitest'
import { classifyUserAgent, describeUserAgent } from '@/lib/known-devices'

/**
 * The name a device gets in the "new sign-in" mail and the account page.
 * Coarse on purpose: it has to be something the owner recognises as theirs,
 * not something that identifies the device.
 */
describe('describeUserAgent', () => {
  it('names the common browsers and systems', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      )
    ).toBe('Chrome on Windows')
    expect(
      describeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
      )
    ).toBe('Safari on iPhone')
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0'
      )
    ).toBe('Edge on Mac')
    expect(
      describeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0')
    ).toBe('Firefox on Linux')
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'
      )
    ).toBe('Chrome on Android')
  })

  it('names the technician app and gives up gracefully', () => {
    expect(describeUserAgent('okhttp/4.12.0')).toBe('Torqvoice technician app')
    expect(describeUserAgent('curl/8.5.0')).toBe('Unknown device')
    expect(describeUserAgent(null)).toBe('Unknown device')
  })
})

describe('classifyUserAgent', () => {
  it('tells phones, tablets and computers apart', () => {
    expect(
      classifyUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
      )
    ).toBe('phone')
    expect(
      classifyUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36'
      )
    ).toBe('phone')
    expect(
      classifyUserAgent(
        'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1'
      )
    ).toBe('tablet')
    expect(
      classifyUserAgent(
        'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36'
      )
    ).toBe('tablet')
    expect(
      classifyUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36'
      )
    ).toBe('desktop')
    expect(classifyUserAgent('okhttp/4.12.0')).toBe('app')
    expect(classifyUserAgent(null)).toBe('unknown')
  })
})
