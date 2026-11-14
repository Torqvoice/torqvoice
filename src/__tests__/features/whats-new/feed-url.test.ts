/**
 * What the app tells torqvoice.com when it asks for the highlights.
 *
 * The staging deployment has to say which app it is, or an entry could never
 * be tried there before it goes live. A self-hosted workshop's address is
 * nobody's business, so that one says only which language it wants.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

let cloud = false
vi.mock('@/lib/features', () => ({ isCloudMode: () => cloud }))

const { whatsNewFeedUrl } = await import('@/features/whats-new/Lib/feed.server')

beforeEach(() => {
  vi.stubEnv('TORQVOICE_COM_URL', 'https://site.test')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://staging.torqvoice.test/some/path')
})
afterEach(() => vi.unstubAllEnvs())

describe('asking for the highlights', () => {
  it('names the deployment on Torqvoice Cloud, by origin only', () => {
    cloud = true
    const url = new URL(whatsNewFeedUrl('pt-BR'))
    expect(`${url.origin}${url.pathname}`).toBe('https://site.test/api/app/whats-new')
    expect(url.searchParams.get('locale')).toBe('pt-BR')
    expect(url.searchParams.get('app')).toBe('https://staging.torqvoice.test')
  })

  it('says nothing about a self-hosted install but its language', () => {
    cloud = false
    const url = new URL(whatsNewFeedUrl('nb'))
    expect([...url.searchParams.keys()]).toEqual(['locale'])
    expect(url.toString()).not.toContain('staging.torqvoice.test')
  })
})
