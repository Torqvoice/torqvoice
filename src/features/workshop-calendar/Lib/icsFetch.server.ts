import 'server-only'
import { type LookupAddress, lookup as dnsLookup } from 'node:dns'
import { type IncomingMessage, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { checkWebhookUrl, isPrivateAddress } from '@/features/webhooks/Lib/ssrf'
import { MAX_FEED_BYTES } from '../Schema/calendarSchema'

/**
 * Fetch a holiday calendar from a link the workshop pasted.
 *
 * The link is the workshop's, and the server fetches it, so every hop is
 * checked the way webhook targets are: no private, loopback or metadata
 * address, redirects followed by hand and checked again, a time limit, and
 * a cap on how much is read.
 *
 * The connection resolves the name through `guardedLookup`, which refuses a
 * private address itself. Checking a name first and letting the connection
 * resolve it again is not enough: the name can answer with a public address
 * for the check and a private one a moment later for the connection.
 */

const TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 5

export class FeedFetchError extends Error {}

/** Raised from the lookup when a name resolves to an address the server must not reach. */
class PrivateAddressError extends Error {
  code = 'EPRIVATEADDRESS'
}

type Resolve = (
  hostname: string,
  options: { all: true; family?: number },
  callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void
) => void

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number
) => void

/**
 * A `lookup` for http(s).request that resolves as usual and refuses to hand
 * the connection a private, loopback or link-local address. The same opt-out
 * as webhooks applies, for testing against a local server.
 */
export function guardedLookup(resolve: Resolve = dnsLookup as unknown as Resolve) {
  return (
    hostname: string,
    options: { all?: boolean; family?: number },
    callback: LookupCallback
  ): void => {
    resolve(hostname, { all: true, family: options.family }, (err, addresses) => {
      if (err) return callback(err, [])
      if (addresses.length === 0) return callback(new Error(`No address for ${hostname}`), [])
      const allowPrivate = process.env.WEBHOOKS_ALLOW_PRIVATE_TARGETS === 'true'
      if (!allowPrivate && addresses.some((a) => isPrivateAddress(a.address))) {
        return callback(new PrivateAddressError('resolves_private'), [])
      }
      if (options.all) return callback(null, addresses)
      return callback(null, addresses[0].address, addresses[0].family)
    })
  }
}

function get(url: URL, signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest
    const req = request(
      url,
      {
        method: 'GET',
        signal,
        lookup: guardedLookup() as never,
        headers: { accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5' },
      },
      resolve
    )
    req.on('error', reject)
    req.end()
  })
}

async function readCapped(res: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of res) {
    const buffer = chunk as Buffer
    total += buffer.byteLength
    if (total > maxBytes) {
      res.destroy()
      throw new FeedFetchError('The calendar is too large to read')
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

export async function fetchIcs(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    let current = url
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const check = await checkWebhookUrl(current)
      if (!check.ok) throw new FeedFetchError(`That link cannot be used: ${check.reason}`)
      const res = await get(new URL(current), controller.signal)
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400) {
        const location = res.headers.location
        res.resume()
        if (!location) throw new FeedFetchError('The calendar link redirects nowhere')
        current = new URL(location, current).toString()
        continue
      }
      if (status < 200 || status >= 300) {
        res.resume()
        throw new FeedFetchError(`The calendar link answered ${status}`)
      }
      const text = await readCapped(res, MAX_FEED_BYTES)
      if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) {
        throw new FeedFetchError('The link is not a calendar (.ics) file')
      }
      return text
    }
    throw new FeedFetchError('The calendar link redirects too many times')
  } catch (error) {
    if (error instanceof FeedFetchError) throw error
    if (error instanceof PrivateAddressError) {
      throw new FeedFetchError('That link cannot be used: resolves_private')
    }
    throw new FeedFetchError(
      controller.signal.aborted
        ? 'The calendar link did not answer in time'
        : 'Could not fetch the calendar'
    )
  } finally {
    clearTimeout(timer)
  }
}
