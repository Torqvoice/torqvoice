import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A page render reads the session without extending it.
 *
 * better-auth extends a day-old session on the next read: a new expiry in the
 * database and a new cookie. A render cannot set cookies, so a read there
 * saved the expiry and lost the cookie, and the cookie ran out a week after
 * sign-in however often the app was used. Extending is left to the open tab's
 * ping and the browser's session lookup, which can set it.
 */

const getSession = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ cookie: 'session=abc' }),
  cookies: async () => ({ get: () => undefined }),
}))

import { getCachedSession } from '@/lib/cached-session'

beforeEach(() => {
  getSession.mockReset()
})

describe('getCachedSession', () => {
  it('reads the session without extending it', async () => {
    getSession.mockResolvedValue(null)
    await getCachedSession()

    expect(getSession).toHaveBeenCalledTimes(1)
    expect(getSession.mock.calls[0][0]).toMatchObject({ query: { disableRefresh: true } })
    expect(getSession.mock.calls[0][0].headers.get('cookie')).toBe('session=abc')
  })
})

const API_ROUTES = path.join('src', 'app', 'api')

/** Everything under src/app that renders on the server: all but the API routes. */
function renderedFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return full === API_ROUTES ? [] : renderedFiles(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

describe('pages and layouts', () => {
  it('read the session through getCachedSession, never better-auth directly', () => {
    const offenders = renderedFiles(path.join('src', 'app')).filter((file) => {
      const source = fs.readFileSync(file, 'utf8')
      // A server action may set cookies, so it may extend the session
      if (/^\s*['"]use server['"]/.test(source)) return false
      return /auth\.api\.getSession\(/.test(source)
    })
    expect(offenders).toEqual([])
  })
})
