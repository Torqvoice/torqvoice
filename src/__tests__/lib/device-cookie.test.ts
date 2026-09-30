import { describe, expect, it } from 'vitest'
import {
  attachDeviceCookie,
  DEVICE_COOKIE,
  readDeviceCookie,
  withDeviceCookie,
} from '@/lib/device-cookie'

/**
 * The device cookie is issued at the auth route, before better-auth runs,
 * because a cookie set from the session hook never reaches the browser. So
 * the request the hook sees must already carry it, and the response must
 * hand it out.
 */
describe('device cookie', () => {
  it('mints one for a browser that has none, on the request and the response', () => {
    const incoming = new Request('http://app.test/api/public/auth/sign-in/email', {
      method: 'POST',
      headers: { cookie: 'other=1' },
    })
    const { request, issued } = withDeviceCookie(incoming)
    expect(issued).toMatch(/^[a-f0-9]{48}$/)
    expect(readDeviceCookie(request.headers)).toBe(issued)
    expect(request.headers.get('cookie')).toContain('other=1')

    const response = attachDeviceCookie(
      new Response('ok', { headers: { 'set-cookie': 'session=x' } }),
      issued
    )
    const cookies = response.headers.getSetCookie()
    expect(cookies).toHaveLength(2)
    expect(cookies[1]).toContain(`${DEVICE_COOKIE}=${issued}`)
    expect(cookies[1]).toContain('HttpOnly')
    expect(cookies[1]).toContain('SameSite=Lax')
  })

  it('leaves a returning browser alone', () => {
    const id = 'a'.repeat(48)
    const incoming = new Request('http://app.test/x', {
      headers: { cookie: `${DEVICE_COOKIE}=${id}` },
    })
    const { request, issued } = withDeviceCookie(incoming)
    expect(issued).toBeNull()
    expect(request).toBe(incoming)
    expect(attachDeviceCookie(new Response('ok'), null).headers.getSetCookie()).toHaveLength(0)
  })

  it('ignores a cookie that is not one of ours', () => {
    expect(readDeviceCookie(new Headers({ cookie: `${DEVICE_COOKIE}=not-hex` }))).toBeNull()
    expect(readDeviceCookie(undefined)).toBeNull()
  })
})
