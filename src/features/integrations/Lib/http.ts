/**
 * One HTTP client per connection.
 *
 * Attaches the credentials, refreshes an OAuth token before it expires and
 * again on a 401, retries 429 and 5xx with backoff, and logs failures. Token
 * refresh runs under a per-connection lock so two jobs cannot both refresh
 * and invalidate each other's token, which is how QuickBooks-style rotating
 * refresh tokens get lost.
 */

import { db } from '@/lib/db'
import { type OAuth2Spec, needsRefresh, refreshToken, resolveClient } from './oauth'
import {
  type ConnectorHttp,
  ConnectorHttpError,
  type LogLevel,
  type OAuthCredentials,
} from './types'
import { openCredentials, sealCredentials } from './vault'

const MAX_RETRIES = 3
const refreshLocks = new Map<string, Promise<OAuthCredentials>>()

export interface HttpAuth {
  /** OAuth: refresh through the vendor. Static: nothing to refresh. */
  oauth?: OAuth2Spec
  /** Header builder for non-OAuth auth. Defaults to Bearer with credentials.accessToken. */
  headers?: (credentials: Record<string, unknown>) => Record<string, string>
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function retryDelayMs(attempt: number, res: Response | null): number {
  const retryAfter = res?.headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) return Math.min(seconds, 60) * 1000
  }
  const base = [500, 2000, 5000][attempt] ?? 5000
  return base + Math.floor(Math.random() * 500)
}

/**
 * Refresh under a lock. A second caller waiting on the same connection gets
 * the same promise, so the vendor sees one refresh. The database is reread
 * first, in case another process refreshed already.
 */
export async function refreshUnderLock(
  connectionId: string,
  spec: OAuth2Spec
): Promise<OAuthCredentials> {
  const inflight = refreshLocks.get(connectionId)
  if (inflight) return inflight
  const run = (async () => {
    const row = await db.integrationConnection.findUnique({
      where: { id: connectionId },
      select: { credentials: true },
    })
    const current = openCredentials(row?.credentials) as unknown as OAuthCredentials
    if (!needsRefresh(current)) return current
    const client = resolveClient(spec, current as unknown as Record<string, unknown>)
    if (!client) throw new Error('No OAuth client configured for this connection')
    const next = await refreshToken({ spec, client, credentials: current })
    await db.integrationConnection.update({
      where: { id: connectionId },
      data: { credentials: sealCredentials(next as unknown as Record<string, unknown>) },
    })
    return next
  })()
  refreshLocks.set(connectionId, run)
  try {
    return await run
  } finally {
    refreshLocks.delete(connectionId)
  }
}

export function createConnectorHttp(input: {
  connectionId: string
  credentials: Record<string, unknown>
  auth: HttpAuth
  log: (level: LogLevel, message: string, details?: Record<string, unknown>) => Promise<void>
}): ConnectorHttp {
  let credentials = input.credentials

  const authHeaders = async (force: boolean): Promise<Record<string, string>> => {
    if (input.auth.oauth) {
      const oauth = credentials as unknown as OAuthCredentials
      if (force || needsRefresh(oauth)) {
        if (force) {
          // Make the lock refresh even when the stored expiry looks fine.
          credentials = { ...credentials, expiresAt: 0 }
        }
        const fresh = await refreshUnderLock(input.connectionId, input.auth.oauth)
        credentials = fresh as unknown as Record<string, unknown>
      }
      return { Authorization: `Bearer ${(credentials as unknown as OAuthCredentials).accessToken}` }
    }
    if (input.auth.headers) return input.auth.headers(credentials)
    const token = typeof credentials.accessToken === 'string' ? credentials.accessToken : ''
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const doFetch = async (url: string, init?: RequestInit): Promise<Response> => {
    let forceRefresh = false
    let last: Response | null = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const headers = new Headers(init?.headers)
      for (const [k, v] of Object.entries(await authHeaders(forceRefresh))) headers.set(k, v)
      forceRefresh = false
      if (init?.body && !headers.has('Content-Type'))
        headers.set('Content-Type', 'application/json')
      let res: Response
      try {
        res = await fetch(url, { ...init, headers })
      } catch (err) {
        if (attempt === MAX_RETRIES) throw err
        await sleep(retryDelayMs(attempt, null))
        continue
      }
      if (res.status === 401 && input.auth.oauth && attempt === 0) {
        forceRefresh = true
        continue
      }
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        last = res
        await input.log('warn', `Retrying ${res.status} from ${new URL(url).host}`, {
          status: res.status,
          attempt: attempt + 1,
        })
        await sleep(retryDelayMs(attempt, res))
        continue
      }
      return res
    }
    return last as Response
  }

  return {
    fetch: doFetch,
    async json<T>(url: string, init?: RequestInit): Promise<T> {
      const res = await doFetch(url, init)
      const text = await res.text()
      if (!res.ok) throw new ConnectorHttpError(res.status, text, url)
      if (!text) return undefined as T
      return JSON.parse(text) as T
    },
  }
}
