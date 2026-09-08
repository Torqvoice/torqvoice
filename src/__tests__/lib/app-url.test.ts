import { afterEach, describe, expect, it } from 'vitest'
import { getAppBaseUrl } from '@/lib/app-url'

/**
 * A self-hosted install sets NEXT_PUBLIC_APP_URL and has no VERCEL_URL. The
 * expression this replaced tested the first and printed the second, so every
 * emailed share link left the building as "https://undefined/share/...".
 */
describe('getAppBaseUrl', () => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const vercelUrl = process.env.VERCEL_URL

  afterEach(() => {
    restore('NEXT_PUBLIC_APP_URL', appUrl)
    restore('VERCEL_URL', vercelUrl)
  })

  function restore(key: string, value: string | undefined) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  it('uses the configured address on a self-hosted install', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://workshop.example.com'
    delete process.env.VERCEL_URL
    expect(getAppBaseUrl()).toBe('https://workshop.example.com')
  })

  it('never prints undefined when only the configured address is set', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://workshop.example.com'
    delete process.env.VERCEL_URL
    expect(getAppBaseUrl()).not.toContain('undefined')
  })

  it('prefers the configured address over the deployment hostname', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://workshop.example.com'
    process.env.VERCEL_URL = 'preview-abc123.vercel.app'
    expect(getAppBaseUrl()).toBe('https://workshop.example.com')
  })

  it('falls back to the deployment hostname on a preview', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    process.env.VERCEL_URL = 'preview-abc123.vercel.app'
    expect(getAppBaseUrl()).toBe('https://preview-abc123.vercel.app')
  })

  it('falls back to localhost when nothing is configured', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.VERCEL_URL
    expect(getAppBaseUrl()).toBe('http://localhost:3000')
  })

  it('does not leave a trailing slash to double up on the path', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://workshop.example.com/'
    delete process.env.VERCEL_URL
    expect(`${getAppBaseUrl()}/share/invoice/org/token`).toBe(
      'https://workshop.example.com/share/invoice/org/token'
    )
  })

  it("uses the caller's fallback when nothing is configured", () => {
    // The portal verify route sends people back to the address that reached
    // it, which beats guessing at the dev server.
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.VERCEL_URL
    expect(getAppBaseUrl('https://portal.example.com')).toBe('https://portal.example.com')
  })

  it("still prefers the configured address over the caller's fallback", () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://workshop.example.com'
    delete process.env.VERCEL_URL
    expect(getAppBaseUrl('https://portal.example.com')).toBe('https://workshop.example.com')
  })

  it('ignores an address set to whitespace', () => {
    process.env.NEXT_PUBLIC_APP_URL = '   '
    delete process.env.VERCEL_URL
    expect(getAppBaseUrl()).toBe('http://localhost:3000')
  })
})
