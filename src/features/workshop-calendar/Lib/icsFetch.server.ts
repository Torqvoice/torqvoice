import 'server-only'
import { checkWebhookUrl } from '@/features/webhooks/Lib/ssrf'
import { MAX_FEED_BYTES } from '../Schema/calendarSchema'

/**
 * Fetch a holiday calendar from a link the workshop pasted.
 *
 * The link is the workshop's, and the server fetches it, so every hop is
 * checked the way webhook targets are: no private, loopback or metadata
 * address, redirects followed by hand and checked again, a time limit, and
 * a cap on how much is read.
 */

const TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 5

export class FeedFetchError extends Error {}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new FeedFetchError('The calendar is too large to read')
    }
    chunks.push(value)
  }
  const all = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    all.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8').decode(all)
}

export async function fetchIcs(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    let current = url
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const check = await checkWebhookUrl(current)
      if (!check.ok) throw new FeedFetchError(`That link cannot be used: ${check.reason}`)
      const res = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        cache: 'no-store',
        headers: { accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5' },
      })
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        await res.body?.cancel()
        if (!location) throw new FeedFetchError('The calendar link redirects nowhere')
        current = new URL(location, current).toString()
        continue
      }
      if (!res.ok) throw new FeedFetchError(`The calendar link answered ${res.status}`)
      const text = await readCapped(res, MAX_FEED_BYTES)
      if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) {
        throw new FeedFetchError('The link is not a calendar (.ics) file')
      }
      return text
    }
    throw new FeedFetchError('The calendar link redirects too many times')
  } catch (error) {
    if (error instanceof FeedFetchError) throw error
    throw new FeedFetchError(
      controller.signal.aborted
        ? 'The calendar link did not answer in time'
        : 'Could not fetch the calendar'
    )
  } finally {
    clearTimeout(timer)
  }
}
