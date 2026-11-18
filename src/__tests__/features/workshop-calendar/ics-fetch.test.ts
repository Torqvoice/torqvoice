// @vitest-environment node
/**
 * Fetching a holiday calendar from a link the workshop pasted.
 *
 * The server fetches it, so the link must never reach a private address,
 * not even when its name passes the check and then answers with a private
 * address for the connection itself.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/webhooks/Lib/ssrf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/webhooks/Lib/ssrf')>()
  return { ...actual, checkWebhookUrl: vi.fn(actual.checkWebhookUrl) }
})

import { checkWebhookUrl } from '@/features/webhooks/Lib/ssrf'
import { fetchIcs, guardedLookup } from '@/features/workshop-calendar/Lib/icsFetch.server'

const CALENDAR =
  'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Christmas Day\r\nEND:VEVENT\r\nEND:VCALENDAR'

describe('the lookup a connection uses', () => {
  const resolveTo =
    (...addresses: string[]) =>
    (
      _host: string,
      _opts: unknown,
      cb: (err: null, a: { address: string; family: number }[]) => void
    ) =>
      cb(
        null,
        addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
      )

  const ask = (lookup: ReturnType<typeof guardedLookup>, all: boolean) =>
    new Promise<{ err: Error | null; address: unknown }>((resolve) =>
      lookup('calendar.example', { all }, (err, address) => resolve({ err, address }))
    )

  it('hands a public address to the connection', async () => {
    const lookup = guardedLookup(resolveTo('93.184.216.34') as never)
    expect(await ask(lookup, false)).toEqual({ err: null, address: '93.184.216.34' })
    expect((await ask(lookup, true)).address).toEqual([{ address: '93.184.216.34', family: 4 }])
  })

  it('refuses when any address the name gives is private', async () => {
    for (const address of ['10.0.0.5', '127.0.0.1', '169.254.169.254', '::1']) {
      const lookup = guardedLookup(resolveTo('93.184.216.34', address) as never)
      expect((await ask(lookup, true)).err?.message).toBe('resolves_private')
    }
  })
})

describe('fetching a calendar', () => {
  let server: Server
  let base = ''
  const routes: Record<string, (res: import('node:http').ServerResponse) => void> = {
    '/holidays.ics': (res) => res.end(CALENDAR),
    '/moved': (res) => res.writeHead(302, { location: '/holidays.ics' }).end(),
    '/page': (res) => res.end('<html>Not a calendar</html>'),
    '/huge.ics': (res) => res.end(`BEGIN:VCALENDAR\r\n${'X'.repeat(1_000_000)}`),
  }

  beforeAll(async () => {
    server = createServer((req, res) =>
      (routes[req.url ?? ''] ?? ((r) => r.writeHead(404).end()))(res)
    )
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads a calendar, following a redirect', async () => {
    vi.stubEnv('WEBHOOKS_ALLOW_PRIVATE_TARGETS', 'true')
    expect(await fetchIcs(`${base}/moved`)).toBe(CALENDAR)
  })

  it('says why it cannot use a page that is not a calendar, or one too large', async () => {
    vi.stubEnv('WEBHOOKS_ALLOW_PRIVATE_TARGETS', 'true')
    await expect(fetchIcs(`${base}/page`)).rejects.toThrow('The link is not a calendar (.ics) file')
    await expect(fetchIcs(`${base}/huge.ics`)).rejects.toThrow('The calendar is too large to read')
    await expect(fetchIcs(`${base}/missing.ics`)).rejects.toThrow('The calendar link answered 404')
  })

  it('refuses a private address the check never saw', async () => {
    // The name passes the check (as if it answered with a public address
    // then), and resolves to this machine when the connection is made.
    vi.mocked(checkWebhookUrl).mockResolvedValueOnce({ ok: true })
    const port = (server.address() as AddressInfo).port
    await expect(fetchIcs(`http://localhost:${port}/holidays.ics`)).rejects.toThrow(
      'That link cannot be used: resolves_private'
    )
  })
})
