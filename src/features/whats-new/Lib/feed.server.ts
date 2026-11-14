import 'server-only'
import { torqvoiceComUrl } from '@/lib/torqvoice-com'
import { type WhatsNewEntry, whatsNewFeedSchema } from '../Schema/whatsNewSchema'
import { sanitizeBody } from './sanitizeBody'

/** How long a fetched feed is served before it is fetched again. */
const FRESH_MS = 10 * 60 * 1000
/** After a failure, how long before torqvoice.com is asked again. */
const RETRY_MS = 60 * 1000
/** The signed-in layout waits on this, so it is not allowed to be slow. */
const TIMEOUT_MS = 2500

type Cached = { entries: WhatsNewEntry[]; expiresAt: number; refreshing?: Promise<void> }

const globalForFeed = globalThis as unknown as { __whatsNewFeed?: Map<string, Cached> }
const cache = (globalForFeed.__whatsNewFeed ??= new Map())

async function load(locale: string): Promise<WhatsNewEntry[]> {
  const url = `${torqvoiceComUrl()}/api/app/whats-new?locale=${encodeURIComponent(locale)}`
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`whats-new feed answered ${response.status}`)
  const feed = whatsNewFeedSchema.parse(await response.json())
  return feed.entries.map((entry) => ({ ...entry, body: sanitizeBody(entry.body) }))
}

function refresh(locale: string, previous: WhatsNewEntry[]): Promise<void> {
  return load(locale)
    .then((entries) => {
      cache.set(locale, { entries, expiresAt: Date.now() + FRESH_MS })
    })
    .catch(() => {
      // torqvoice.com is unreachable, or an install has no way out to the
      // internet at all. Keep what there was, and do not ask again on every
      // page load.
      cache.set(locale, { entries: previous, expiresAt: Date.now() + RETRY_MS })
    })
}

/**
 * The highlights torqvoice.com has published, in the reader's language.
 *
 * Asked for by this server, never by the browser, and with nothing about the
 * workshop in the request: only the language. Kept in memory for ten minutes
 * per language; once that has passed the old list is still returned at once
 * and the new one is fetched behind it, so only the very first request after
 * a start ever waits. A failure is an empty list, and the button that opens
 * the panel is simply not drawn.
 */
export async function getWhatsNewFeed(locale: string): Promise<WhatsNewEntry[]> {
  const cached = cache.get(locale)
  if (!cached) {
    const entry: Cached = { entries: [], expiresAt: 0 }
    cache.set(locale, entry)
    entry.refreshing = refresh(locale, [])
    await entry.refreshing
    return cache.get(locale)?.entries ?? []
  }
  if (cached.refreshing && cached.expiresAt === 0) {
    // A second request arriving while the first fetch is still out.
    await cached.refreshing
    return cache.get(locale)?.entries ?? []
  }
  if (Date.now() >= cached.expiresAt && !cached.refreshing) {
    cached.refreshing = refresh(locale, cached.entries)
  }
  return cached.entries
}

/** For tests. */
export function clearWhatsNewFeedCache() {
  cache.clear()
}
