import 'server-only'
import { isCloudMode } from '@/lib/features'
import { appOrigin, torqvoiceComUrl } from '@/lib/torqvoice-com'
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

/**
 * Where the feed is asked for. A Torqvoice Cloud deployment names its own
 * address, which is how the staging app is handed the entries being tried
 * out there before they go live. A self-hosted install says nothing about
 * itself: its address is the workshop's business, and it gets the same
 * production entries either way.
 */
export function whatsNewFeedUrl(locale: string): string {
  const url = new URL(`${torqvoiceComUrl()}/api/app/whats-new`)
  url.searchParams.set('locale', locale)
  if (isCloudMode()) url.searchParams.set('app', appOrigin())
  return url.toString()
}

async function load(locale: string): Promise<WhatsNewEntry[]> {
  const url = whatsNewFeedUrl(locale)
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
      // An empty list is checked again soon: the first entry ever published,
      // or the first one tried on staging, should not take ten minutes to
      // turn up.
      cache.set(locale, {
        entries,
        expiresAt: Date.now() + (entries.length > 0 ? FRESH_MS : RETRY_MS),
      })
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
 * workshop in the request: only the language (and, on Torqvoice Cloud, the
 * deployment's own address). Kept in memory for ten minutes
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
    // Nothing worth showing meanwhile, so wait for the answer rather than
    // hand back the empty list one more time.
    if (cached.entries.length === 0) {
      await cached.refreshing
      return cache.get(locale)?.entries ?? []
    }
  }
  return cached.entries
}

/** For tests. */
export function clearWhatsNewFeedCache() {
  cache.clear()
}
