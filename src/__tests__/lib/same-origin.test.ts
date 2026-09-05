import { describe, expect, it } from 'vitest'
import { isCrossSiteWrite } from '@/lib/same-origin'

function req(method: string, headers: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return { method, header: (name: string) => lower[name.toLowerCase()] ?? null }
}

describe('isCrossSiteWrite', () => {
  it('never blocks reads', () => {
    expect(isCrossSiteWrite(req('GET', { origin: 'https://evil.example', host: 'app.x' }))).toBe(
      false
    )
    expect(isCrossSiteWrite(req('HEAD', { 'sec-fetch-site': 'cross-site' }))).toBe(false)
  })

  it('trusts the browser when it says where the request came from', () => {
    expect(isCrossSiteWrite(req('POST', { 'sec-fetch-site': 'cross-site' }))).toBe(true)
    expect(isCrossSiteWrite(req('POST', { 'sec-fetch-site': 'same-origin' }))).toBe(false)
    expect(isCrossSiteWrite(req('POST', { 'sec-fetch-site': 'same-site' }))).toBe(false)
  })

  it('compares Origin with the host the request was made to', () => {
    const same = { origin: 'https://app.torqvoice.com', host: 'app.torqvoice.com' }
    expect(isCrossSiteWrite(req('POST', same))).toBe(false)
    expect(
      isCrossSiteWrite(req('DELETE', { origin: 'https://evil.example', host: 'app.torqvoice.com' }))
    ).toBe(true)
    // Behind the proxy the public host arrives forwarded.
    expect(
      isCrossSiteWrite(
        req('PATCH', {
          origin: 'https://app.torqvoice.com',
          host: 'torqvoice-app:3000',
          'x-forwarded-host': 'app.torqvoice.com',
        })
      )
    ).toBe(false)
    expect(isCrossSiteWrite(req('POST', { origin: 'null', host: 'app.torqvoice.com' }))).toBe(true)
    expect(isCrossSiteWrite(req('POST', { origin: 'not a url', host: 'app.torqvoice.com' }))).toBe(
      true
    )
  })

  it('lets requests without an Origin through, as native clients send none', () => {
    expect(isCrossSiteWrite(req('POST', { host: 'app.torqvoice.com' }))).toBe(false)
  })
})
