/**
 * A share link's page hands the customer addresses the link's token opens.
 * A logo uploaded today is stored under the signed-in route, and a customer
 * with no session could not load it.
 */
import { describe, expect, it } from 'vitest'
import { shareFileUrl } from '@/lib/share-file-url'

describe('shareFileUrl', () => {
  it('rewrites an upload stored today to the link’s public address', () => {
    expect(shareFileUrl('/api/protected/files/org_1/logos/mark.png', 'tok')).toBe(
      '/api/public/files/tok/logos/mark.png'
    )
  })

  it('rewrites an upload stored in the older form too', () => {
    expect(shareFileUrl('/api/files/org_1/quotes/photo.jpg', 'tok')).toBe(
      '/api/public/files/tok/quotes/photo.jpg'
    )
  })

  it('leaves anything that is not a stored upload as it is', () => {
    for (const url of [
      'https://example.com/logo.png',
      'data:image/png;base64,AAAA',
      '/uploads/logos/mark.png',
    ]) {
      expect(shareFileUrl(url, 'tok')).toBe(url)
    }
  })
})
